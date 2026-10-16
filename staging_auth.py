"""Staging-only form login for WebViews that do not display Basic challenges."""
import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict, deque
from urllib.parse import parse_qs

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

COOKIE = "__Host-burando_test"
TTL = 8 * 60 * 60
LOGIN = "/__staging/login"
PAGE = """<!doctype html><html lang="uz"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BURANDO TEST — Kirish</title>
<style>*{box-sizing:border-box}body{margin:0;padding:24px;min-height:100dvh;display:grid;place-items:center;background:#faf8f5;color:#181818;font:16px system-ui,sans-serif}main{width:100%;max-width:390px;padding:28px;background:white;border-radius:22px;box-shadow:0 8px 40px #0000000c}h1{letter-spacing:.12em;margin:0 0 10px}p{line-height:1.5;color:#555}label{display:block;margin:18px 0 8px}input,button{width:100%;font:inherit;padding:14px;border-radius:12px;border:1px solid #ccc}button{margin-top:24px;background:#b9252d;color:white;border:0;font-weight:700}button:disabled{opacity:.6}#error{color:#ad1925}small{color:#666}</style>
<main><h1>BURANDO <small>TEST</small></h1><p>Sinov do‘koniga kirish / Вход в тестовый магазин</p>
<form method="post" action="/__staging/login"><label for="user">Login / Логин</label><input id="user" name="username" autocomplete="username" required maxlength="128" autocapitalize="none" spellcheck="false">
<label for="password">Parol / Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="512">
<button>Kirish / Войти</button><p id="error" role="alert"></p></form><small>Faqat sinov uchun. Haqiqiy pul yubormang.</small></main>
<script>const form=document.querySelector('form');form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;document.querySelector('#error').textContent='';try{const response=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{'Accept':'application/json'},body:new URLSearchParams(new FormData(form))});if(response.ok){location.reload();return}document.querySelector('#error').textContent=response.status===429?'Ko‘p urinish. Bir daqiqadan keyin qayta urinib ko‘ring.':'Login yoki parol noto‘g‘ri / Неверный логин или пароль';}catch(error){document.querySelector('#error').textContent='Ulanish xatosi. Qayta urinib ko‘ring.'}button.disabled=false});</script></html>"""


def credentials_valid(user, password):
    expected_user = os.getenv("STAGING_SITE_USER", "").strip()
    expected_password = os.getenv("STAGING_SITE_PASSWORD", "")
    return bool(expected_password) and hmac.compare_digest(
        user.encode(), expected_user.encode()
    ) & hmac.compare_digest(password.encode(), expected_password.encode())


def signature(value):
    key = os.getenv("STAGING_SITE_PASSWORD", "")
    context = "burando-test-session:" + os.getenv("STAGING_SITE_USER", "").strip()
    return hmac.new(key.encode(), (context + ":" + value).encode(), hashlib.sha256).hexdigest()


def session_valid(cookie):
    if not os.getenv("STAGING_SITE_PASSWORD"):
        return False
    try:
        expiry, nonce, digest = cookie.split(".")
        remaining = int(expiry) - time.time()
        return 0 < remaining <= TTL and hmac.compare_digest(
            signature(expiry + "." + nonce), digest
        )
    except (ValueError, TypeError):
        return False


def form_response():
    return HTMLResponse(PAGE, status_code=401, headers={"Cache-Control": "no-store"})


def install_login(app):
    attempts = defaultdict(deque)

    @app.post(LOGIN, include_in_schema=False)
    async def login(request: Request):
        # Explicit same-origin checks prevent cross-site login/session substitution.
        if request.headers.get("origin") != str(request.base_url).rstrip("/"):
            return JSONResponse({"detail": "Origin rejected"}, status_code=403)
        now = time.monotonic()
        ip = request.client.host if request.client else "unknown"
        for old in list(attempts):
            if not attempts[old] or attempts[old][-1] < now - 60:
                del attempts[old]
        recent = attempts[ip]
        while recent and recent[0] < now - 60:
            recent.popleft()
        if len(recent) >= 10:
            return JSONResponse({"detail": "Try again later"}, status_code=429,
                                headers={"Retry-After": "60"})
        recent.append(now)
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > 4096:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
        try:
            form = parse_qs(data.decode(), strict_parsing=True)
            user, password = form["username"], form["password"]
            valid = len(user) == len(password) == 1 and credentials_valid(user[0], password[0])
        except (ValueError, KeyError, UnicodeError):
            valid = False
        if not valid:
            return form_response()
        value = str(int(time.time()) + TTL) + "." + secrets.token_hex(16)
        response = (JSONResponse({"ok": True}) if "application/json" in request.headers.get("accept", "")
                    else RedirectResponse("/", status_code=303))
        response.set_cookie(COOKIE, value + "." + signature(value), max_age=TTL,
                            secure=True, httponly=True, samesite="none", path="/")
        response.headers["Cache-Control"] = "no-store"
        return response
