"""Durable Telegram notices; staging requires an explicit test bot and recipient list."""
import asyncio
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger('burando.notifications')


class NoticeConfig(BaseModel):
    enabled: bool = False
    admin_chat_id: str = ''
    test_recipient_ids: list[str] = Field(default_factory=list, max_length=30)

    def clean(self, staging):
        admin = self.admin_chat_id.strip()
        if admin and not re.fullmatch(r'-?[1-9][0-9]{0,18}', admin):
            raise HTTPException(400, 'Admin Telegram ID noto‘g‘ri')
        recipients = sorted(set(str(x).strip() for x in self.test_recipient_ids if str(x).strip()))
        if any(not re.fullmatch(r'[1-9][0-9]{0,18}', x) for x in recipients):
            raise HTTPException(400, 'Test uchun faqat shaxsiy Telegram ID kiriting')
        if staging and admin and not re.fullmatch(r'[1-9][0-9]{0,18}', admin):
            raise HTTPException(400, 'TEST admini shaxsiy Telegram akkaunti bo‘lsin')
        if self.enabled and not admin:
            raise HTTPException(400, 'Xabar oluvchi adminni tanlang')
        if staging and admin and admin not in recipients:
            recipients.append(admin)
        return dict(enabled=self.enabled, admin_chat_id=admin, test_recipient_ids=recipients)


def install(app, ns):
    staging = ns.ENVIRONMENT.name == 'staging'
    test_transport = (staging and os.getenv('STAGING_TEST_NOTIFICATIONS') == 'true'
                      and bool(os.getenv('STAGING_BOT_USERNAME', '').strip()))
    transport = test_transport or (ns.ENVIRONMENT.name == 'production' and ns.ENVIRONMENT.notifications_enabled)
    expected_bot = os.getenv('STAGING_BOT_USERNAME', '').strip().lstrip('@').lower()
    identity_cache = {'until': 0, 'username': ''}
    dispatch_lock = asyncio.Lock()

    async def rest(method, path, **kwargs):
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(method, ns.SUPABASE_URL+'/rest/v1/'+path,
                headers=ns.sb_headers(True, 'return=minimal'), **kwargs)
        response.raise_for_status()
        return response.json() if response.content else None

    async def telegram(method, payload):
        if not ns.BOT_TOKEN:
            raise HTTPException(503, 'Telegram bot serverda sozlanmagan')
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post('https://api.telegram.org/bot'+ns.BOT_TOKEN+'/'+method, json=payload)
            data = response.json()
            if not response.is_success or not data.get('ok'):
                raise ValueError()
            return data.get('result', {})
        except Exception:
            # Never expose Telegram request URLs, credentials or raw error bodies.
            raise HTTPException(502, 'Telegram bilan bog‘lanib bo‘lmadi. Botni ochib Start bosing.') from None

    async def bot_username():
        if identity_cache['until'] < time.monotonic():
            me = await telegram('getMe', {})
            username = str(me.get('username', '')).lower()
            if not username or (staging and username != expected_bot):
                raise HTTPException(503, 'TEST bot nomi mos kelmadi. Xabar yuborish bloklandi.')
            identity_cache.update(until=time.monotonic()+60, username=username)
        return identity_cache['username']

    async def config():
        rows = await rest('GET', 'notification_config', params={'id':'eq.1','select':'enabled,admin_chat_id,test_recipient_ids,enabled_since'})
        return rows[0] if rows else {'enabled':False,'admin_chat_id':'','test_recipient_ids':[],'enabled_since':None}

    async def ready_config():
        if not transport or not ns.BOT_TOKEN:
            return None
        cfg = await config()
        if not cfg.get('enabled') or not cfg.get('enabled_since') or not cfg.get('admin_chat_id'):
            return None
        await bot_username()
        return cfg

    async def dispatch():
        if dispatch_lock.locked():
            return {'enabled':bool(transport),'processed':0}
        async with dispatch_lock:
            cfg = await ready_config()
            if not cfg:
                return {'enabled':False,'processed':0}
            processed = 0
            for _ in range(10):
                current = await config()
                if not current.get('enabled') or current.get('enabled_since') != cfg['enabled_since']:
                    break
                item = await rest('POST', 'rpc/burando_claim_notification_since', json={'p_since':cfg['enabled_since']})
                if not item:
                    break
                target = str(cfg['admin_chat_id'] if item['audience']=='admin' else item.get('telegram_user_id') or '')
                allowed = not staging or target in cfg.get('test_recipient_ids', [])
                try:
                    # A database queue row alone never authorizes customer contact.
                    rows = await rest('GET','orders',params={'id':'eq.'+str(item['order_id']),
                        'select':'customer_name,phone,backup_phone,address,comment,telegram_username,telegram_user_id,telegram_verified'})
                    order = rows[0] if rows else None
                    if item['audience']=='customer' and (not order or not order.get('telegram_verified') or str(order.get('telegram_user_id'))!=target):
                        allowed = False
                    if not allowed or not target:
                        patch = {'status':'blocked','last_error':'Recipient not authorized','lease_until':None}
                    else:
                        message = item['message']
                        if item['audience']=='admin' and order:
                            message += '\n\n'+'\n'.join(str(order.get(k) or '') for k in ['customer_name','phone','backup_phone','address','comment','telegram_username'])
                            products = await rest('GET','order_items',params={'order_id':'eq.'+str(item['order_id']),
                                'select':'product_code,title,qty,size,color,line_total,line_total_uzs'})
                            message += '\n'+'\n'.join(f"{p['product_code']} · {p['title']} × {p['qty']} · {p.get('size') or '—'} / {p.get('color') or '—'} · USD {p['line_total']}" + (f" · {p['line_total_uzs']} so‘m" if p.get('line_total_uzs') is not None else '') for p in products or [])
                        if staging:
                            message = '🧪 BURANDO TEST · Haqiqiy savdo emas\n'+message
                        current = await config()
                        if current.get('enabled') and current.get('enabled_since') == cfg['enabled_since']:
                            await telegram('sendMessage', {'chat_id':target,'text':message[:4000], 'disable_web_page_preview':True})
                            patch = {'status':'sent','last_error':'','lease_until':None}
                        else:
                            patch = {'status':'blocked','last_error':'Configuration changed','lease_until':None}
                except Exception:
                    patch = {'status':'pending' if item['attempts']<5 else 'failed',
                        'last_error':'Telegram delivery failed; check bot access',
                        'available_at':(datetime.now(timezone.utc)+timedelta(seconds=min(3600,30*2**item['attempts']))).isoformat(), 'lease_until':None}
                await rest('PATCH','notification_outbox',params={'id':'eq.'+str(item['id']),'status':'eq.sending','attempts':'eq.'+str(item['attempts'])},json=patch)
                processed += 1
            return {'enabled':True,'processed':processed}

    @app.get('/api/admin/notifications/config')
    async def get_config(x_admin_key: str = Header(default='')):
        ns.require_admin_key(x_admin_key)
        cfg = await config()
        username, issue = '', ''
        if transport and ns.BOT_TOKEN:
            try:
                username = await bot_username()
            except HTTPException as e:
                issue = e.detail
        else:
            issue = 'Serverda xabar transporti o‘chirilgan yoki bot sozlanmagan'
        return {**cfg,'environment':ns.ENVIRONMENT.name,'transport_ready':bool(username),'bot_username':username,'issue':issue}

    @app.put('/api/admin/notifications/config')
    async def save_config(payload: NoticeConfig, x_admin_key: str = Header(default='')):
        ns.require_admin_key(x_admin_key)
        data = payload.clean(staging)
        if data['enabled']:
            if not transport:
                raise HTTPException(503, 'Bu muhitda xabar yuborish transporti yoqilmagan')
            await bot_username()
            chat = await telegram('getChat', {'chat_id':data['admin_chat_id']})
            if str(chat.get('id')) != data['admin_chat_id']:
                raise HTTPException(400, 'Admin Telegram ID tasdiqlanmadi')
        # Every explicit setup starts a new window: old queued orders stay unsent.
        data['enabled_since'] = datetime.now(timezone.utc).isoformat() if data['enabled'] else None
        await rest('PATCH','notification_config',params={'id':'eq.1'},json=data)
        return {'ok':True,'enabled':data['enabled']}

    @app.post('/api/admin/notifications/test')
    async def test_notice(x_admin_key: str = Header(default='')):
        ns.require_admin_key(x_admin_key)
        cfg = await ready_config()
        if not cfg:
            raise HTTPException(409, 'Avval Telegram xabarlarini sozlab yoqing')
        if staging and cfg['admin_chat_id'] not in cfg.get('test_recipient_ids', []):
            raise HTTPException(403, 'Test oluvchisi ruxsat etilmagan')
        await telegram('sendMessage', {'chat_id':cfg['admin_chat_id'], 'text':('🧪 TEST · ' if staging else '')+'BURANDO: admin xabarlari ulandi. Yangi buyurtma va holat xabarlari shu chatga keladi.'})
        return {'ok':True}

    @app.post('/api/admin/notifications/dispatch')
    async def manual(x_admin_key: str = Header(default='')):
        ns.require_admin_key(x_admin_key)
        return await dispatch()

    @app.get('/api/admin/notifications')
    async def status(x_admin_key: str = Header(default='')):
        ns.require_admin_key(x_admin_key)
        cfg = await config()
        if not cfg.get('enabled_since'):
            return []
        return await rest('GET','notification_outbox',params={'select':'id,order_id,audience,status,attempts,last_error,created_at','order':'id.desc','limit':'100','created_at':'gte.'+cfg['enabled_since']})

    async def run():
        while True:
            try:
                await dispatch()
            except Exception:
                log.warning('Notification service unavailable; retry scheduled')
            await asyncio.sleep(15)

    previous_lifespan = app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(application):
        async with previous_lifespan(application):
            task = asyncio.create_task(run()) if transport and ns.BOT_TOKEN else None
            try:
                yield
            finally:
                if task:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
    app.router.lifespan_context = lifespan
