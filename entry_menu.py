"""Repair live catalog URLs using the already configured bot, without sending messages."""
import asyncio
import logging
import re
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

import httpx
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

ENTRY = 'https://burando-live-entry.onrender.com/'
log = logging.getLogger('burando.entry')


class Launch(BaseModel):
    init_data: str = Field(min_length=1, max_length=10000)


def install(app, ns):
    if ns.ENVIRONMENT.name != 'production':
        return
    identity = {'until': 0}
    lock = asyncio.Lock()
    limits = defaultdict(deque)
    checked = {}
    cdn = {'until':0, 'ready':False}

    async def cdn_ready():
        if cdn['until']>time.monotonic(): return cdn['ready']
        ready=False
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response=await client.get(ENTRY+'live-store.js?v=2')
            ready=(response.is_success and 'javascript' in response.headers.get('content-type','')
                   and 'window.BurandoLiveStore' in response.text)
        except httpx.HTTPError: pass
        cdn.update(ready=ready,until=time.monotonic()+(300 if ready else 5))
        return ready

    async def telegram(method, body):
        if not ns.BOT_TOKEN:
            raise HTTPException(503, 'Telegram unavailable')
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response=await client.post('https://api.telegram.org/bot'+ns.BOT_TOKEN+'/'+method,json=body)
            data=response.json()
            if not response.is_success or not data.get('ok'):
                raise ValueError()
            return data['result']
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise HTTPException(503, 'Telegram unavailable') from None

    async def repair(chat_id=None):
        async with lock:
            if identity['until'] < time.monotonic():
                me=await telegram('getMe',{})
                if str(me.get('username','')).lower() != 'burando_news_bot':
                    raise HTTPException(503, 'Unexpected live bot; menu unchanged')
                identity['until']=time.monotonic()+300
            body={'chat_id':chat_id} if chat_id else {}
            menu=await telegram('getChatMenuButton',body)
            if menu.get('type') == 'default' and chat_id:
                return False  # This chat inherits the canonical default.
            if menu.get('type')=='web_app' and menu.get('web_app',{}).get('url')==ENTRY:
                return False
            await telegram('setChatMenuButton',{**body,'menu_button':{'type':'web_app','text':'🛍 Katalog','web_app':{'url':ENTRY}}})
            return True

    @app.post('/api/telegram/entry')
    async def ensure_entry(payload: Launch, request: Request):
        user=ns.validate(payload.init_data)
        ip=request.client.host if request.client else 'unknown'
        now=time.monotonic()
        if len(limits)>10000:
            for old in list(limits):
                if not limits[old] or limits[old][-1]<now-60: del limits[old]
        q=limits[ip]
        while q and q[0]<now-60: q.popleft()
        if len(q)>=15: raise HTTPException(429,'Retry later')
        q.append(now)
        uid=str(user['id'])
        if len(checked)>10000:
            for old in list(checked):
                if checked[old]<now: del checked[old]
        if checked.get(uid,0)>now: return {'ok':True,'cdn_ready':await cdn_ready()}
        await repair(uid)
        checked[uid]=now+300
        return {'ok':True,'cdn_ready':await cdn_ready()}

    async def startup_repair():
        try:
            changed=int(await repair())
            # Only previously verified account IDs; never names, addresses, receipts or messages.
            if ns.SUPABASE_URL and ns.SUPABASE_SERVICE_KEY:
                async with httpx.AsyncClient(timeout=10) as client:
                    r=await client.get(ns.SUPABASE_URL+'/rest/v1/orders',headers=ns.sb_headers(True),params={
                        'select':'telegram_user_id','telegram_verified':'eq.true','limit':'50','order':'created_at.desc'})
                if r.is_success:
                    ids={str(row.get('telegram_user_id','')) for row in r.json()}
                    for uid in ids:
                        if re.fullmatch(r'[1-9][0-9]{0,18}',uid): changed+=int(await repair(uid))
            log.warning('BURANDO live entry menus verified; repaired=%s; target=%s',changed,ENTRY)
        except Exception:
            log.warning('BURANDO live entry menu check incomplete; no credentials logged')

    previous=app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(application):
        async with previous(application):
            task=asyncio.create_task(startup_repair()) if ns.BOT_TOKEN else None
            try: yield
            finally:
                if task:
                    task.cancel()
                    try: await task
                    except asyncio.CancelledError: pass
    app.router.lifespan_context=lifespan

