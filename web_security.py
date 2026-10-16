"""Response hardening and independent staging perimeter authentication."""

import base64, hmac, os
from fastapi import Request
from fastapi.responses import JSONResponse


class BodyTooLarge(Exception):
    pass


class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api/"):
            return await self.app(scope, receive, send)
        limit = 6 * 1024 * 1024
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = limit + 1
        if declared > limit:
            return await JSONResponse({"detail": "Request too large"}, status_code=413)(
                scope, receive, send
            )
        used = 0

        async def bounded_receive():
            nonlocal used
            message = await receive()
            used += len(message.get("body", b""))
            if used > limit:
                raise BodyTooLarge()
            return message

        try:
            await self.app(scope, bounded_receive, send)
        except BodyTooLarge:
            await JSONResponse({"detail": "Request too large"}, status_code=413)(
                scope, receive, send
            )


def install(app, environment):
    app.add_middleware(BodyLimitMiddleware)

    @app.middleware("http")
    async def perimeter(request: Request, call_next):
        if environment.name == "staging" and request.url.path != "/healthz":
            credentials = request.headers.get("authorization", "")
            try:
                scheme, value = credentials.split(" ", 1)
                if scheme.lower() != "basic":
                    raise ValueError()
                user, password = (
                    base64.b64decode(value, validate=True).decode().split(":", 1)
                )
                valid = hmac.compare_digest(
                    user, os.getenv("STAGING_SITE_USER", "").strip()
                ) and hmac.compare_digest(
                    password, os.getenv("STAGING_SITE_PASSWORD", "")
                )
                valid = valid and bool(os.getenv("STAGING_SITE_PASSWORD"))
            except (ValueError, UnicodeError):
                valid = False
            if not valid:
                return JSONResponse(
                    {"detail": "Staging authentication required"},
                    status_code=401,
                    headers={
                        "WWW-Authenticate": 'Basic realm="BURANDO TEST", charset="UTF-8"',
                        "Cache-Control": "no-store",
                    },
                )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = (
            "camera=(self), microphone=(), geolocation=()"
        )
        # Telegram WebApp is framed: avoid DENY/X-Frame-Options and permit Telegram ancestors.
        response.headers["Content-Security-Policy"] = (
            "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://*.telegram.me"
        )
        if request.url.path.startswith("/api/") or request.url.path == "/admin":
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/healthz", include_in_schema=False)
    async def health():
        return {"ok": True, "environment": environment.name}
