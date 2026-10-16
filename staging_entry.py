"""Staging-only entrypoint; provisioning mode has no database, bot, or storefront."""

import os
from types import SimpleNamespace
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from web_security import install


def build_entry(env):
    if env.get("APP_ENV") != "staging":
        raise RuntimeError("Staging entrypoint cannot be used for production")
    if env.get("STAGING_SETUP_MODE") != "true":
        from app import app

        return app
    if any(
        env.get(key)
        for key in (
            "SUPABASE_URL",
            "SUPABASE_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_SERVICE_KEY",
            "BOT_TOKEN",
            "ADMIN_CHAT_ID",
        )
    ):
        raise RuntimeError(
            "Provisioning mode must not have database or Telegram credentials"
        )
    if (
        env.get("NOTIFICATIONS_ENABLED", "false") != "false"
        or env.get("DEV_MODE", "false") != "false"
    ):
        raise RuntimeError("Unsafe provisioning flags")
    if (
        not env.get("STAGING_SITE_USER")
        or len(env.get("STAGING_SITE_PASSWORD", "")) < 32
    ):
        raise RuntimeError("Staging perimeter credentials required")
    pending = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    install(pending, SimpleNamespace(name="staging"))

    @pending.get("/readyz")
    async def ready():
        from fastapi.responses import JSONResponse

        return JSONResponse(
            {"ready": False, "stage": "awaiting_isolated_database"}, status_code=503
        )

    @pending.api_route(
        "/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"]
    )
    async def waiting(path: str):
        return HTMLResponse(
            """<!doctype html><html lang="uz"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BURANDO · TEST</title><style>body{font:18px system-ui;background:#faf8f5;color:#171717;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:540px;padding:32px}h1{font-size:48px;letter-spacing:.08em}b{color:#da1828}p{line-height:1.6}</style><main><b>TEST MUHITI</b><h1>BURANDO</h1><p>Alohida sinov serveri tayyorlanmoqda.</p><p>Test bazasi va xavfsizlik tekshiruvlari hali tugamagan. Bu yerda hozircha buyurtma yoki chek yuborib bo‘lmaydi.</p><hr><p>Тестовая среда настраивается. Приём заказов и чеков пока отключён.</p></main></html>""",
            status_code=503,
            headers={"Cache-Control": "no-store", "Retry-After": "3600"},
        )

    return pending


# Factory avoids exposing a runnable default outside an explicitly configured staging environment.
def create_app():
    return build_entry(os.environ)
