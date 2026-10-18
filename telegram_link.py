"""Short-lived browser/Telegram pairing; neither token is a Telegram identity."""
import re
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from urllib.parse import parse_qsl

import httpx
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from v7_security import token_hash


class BrowserProof(BaseModel):
    token: str = Field(pattern=r'^[a-f0-9]{64}$')


class TelegramProof(BaseModel):
    init_data: str = Field(min_length=1, max_length=10000)
    approval: str = Field(pattern=r'^[A-Za-z0-9_-]{43}$')


def install(app, ns, db):
    limits = defaultdict(deque)
    bot = {'username': '', 'until': 0}

    def throttle(request, maximum=40):
        now = time.monotonic()
        key = request.client.host if request.client else 'unknown'
        if len(limits) > 10000:
            for ip in list(limits):
                if not limits[ip] or limits[ip][-1] < now - 60:
                    del limits[ip]
        q = limits[key]
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= maximum:
            raise HTTPException(429, 'Please wait one minute')
        q.append(now)

    def now_iso():
        return datetime.now(timezone.utc).isoformat()

    async def username():
        if bot['until'] > time.monotonic():
            return bot['username']
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post('https://api.telegram.org/bot' + ns.BOT_TOKEN + '/getMe', json={})
            data = r.json()
            name = data.get('result', {}).get('username', '')
            if not r.is_success or not data.get('ok') or not re.fullmatch(r'[A-Za-z0-9_]{5,32}', name):
                raise ValueError()
            expected = 'brnd_test_bot' if ns.ENVIRONMENT.name == 'staging' else 'burando_news_bot'
            if name.lower() != expected:
                raise ValueError()
        except (httpx.HTTPError, ValueError, TypeError):
            raise HTTPException(503, 'Telegram connection temporarily unavailable') from None
        bot.update(username=name, until=time.monotonic()+300)
        return name

    async def find(token):
        rows = await db('GET', 'telegram_links', params={
            'browser_hash': 'eq.'+token_hash(token), 'expires_at': 'gt.'+now_iso(), 'select': '*'})
        if not rows:
            raise HTTPException(410, 'Telegram link expired; reconnect or continue without Telegram')
        return rows[0]

    async def resolve(token):
        row = await find(token)
        if row['state'] != 'confirmed':
            raise HTTPException(409, 'Confirm your Telegram account first')
        return {'id': int(row['telegram_user_id']), 'username': row['telegram_username']}

    @app.post('/api/telegram-link/start')
    async def start(request: Request):
        throttle(request, 12)
        name = await username()
        browser, approval = secrets.token_hex(32), secrets.token_urlsafe(32)
        expiry = (datetime.now(timezone.utc)+timedelta(minutes=30)).isoformat()
        # Expired pairings have no order/customer data and are no longer usable.
        await db('DELETE', 'telegram_links', params={'expires_at': 'lt.'+now_iso()})
        code = f'{secrets.randbelow(1000000):06d}'
        await db('POST', 'telegram_links', json={
            'browser_hash': token_hash(browser), 'approval_hash': token_hash(approval),
            'confirmation_code': code, 'expires_at': expiry})
        return {'token': browser, 'url': f'https://t.me/{name}?startapp=link_{approval}',
                'code': code, 'expires_at': expiry}

    @app.post('/api/telegram-link/status')
    async def status(body: BrowserProof, request: Request):
        throttle(request)
        row = await find(body.token)
        result = {'state': row['state'], 'code': row['confirmation_code']}
        if row['state'] == 'confirmed':
            result['account'] = row['display_name']
            result['username'] = row['telegram_username']
        return result

    @app.post('/api/telegram-link/revoke')
    async def revoke(body: BrowserProof, request: Request):
        throttle(request)
        await db('DELETE', 'telegram_links', params={'browser_hash': 'eq.'+token_hash(body.token)})
        return {'ok': True}

    @app.post('/api/telegram-link/preview')
    async def preview(body: TelegramProof, request: Request):
        throttle(request)
        user = ns.validate(body.init_data)
        # Bind the pairing nonce to the HMAC-verified launch data, not the URL or initDataUnsafe.
        signed_start = dict(parse_qsl(body.init_data)).get('start_param', '')
        if signed_start != 'link_'+body.approval:
            raise HTTPException(403, 'Telegram launch does not match this request')
        rows = await db('GET', 'telegram_links', params={
            'approval_hash': 'eq.'+token_hash(body.approval),
            'expires_at': 'gt.'+now_iso(), 'select': '*'})
        if not rows or (rows[0]['state']=='confirmed' and rows[0]['telegram_user_id']!=str(user['id'])):
            raise HTTPException(410, 'Telegram link expired or already used')
        return {'code': rows[0]['confirmation_code'],
                'account': (user.get('first_name', '')+' '+user.get('last_name', '')).strip()[:200],
                'username': user.get('username', '')[:64]}

    @app.post('/api/telegram-link/confirm')
    async def confirm(body: TelegramProof, request: Request):
        details = await preview(body, request)
        user = ns.validate(body.init_data)
        rows = await db('PATCH', 'telegram_links', params={
            'approval_hash': 'eq.'+token_hash(body.approval), 'state': 'eq.pending',
            'expires_at': 'gt.'+now_iso()}, json={
                'state': 'confirmed', 'telegram_user_id': str(user['id']),
                'telegram_username': details['username'], 'display_name': details['account']})
        if not rows:
            # A repeat confirmation by the same signed account is harmless.
            await preview(body, request)
        return {'ok': True}

    return resolve
