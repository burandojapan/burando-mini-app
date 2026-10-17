"""Response hardening and independent staging perimeter authentication."""

import base64
from fastapi import Request
from fastapi.responses import JSONResponse
from staging_auth import COOKIE, LOGIN, credentials_valid, session_valid, form_response, install_login


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
    if environment.name == "staging":
        install_login(app)

    @app.middleware("http")
    async def perimeter(request: Request, call_next):
        early_response = None
        if environment.name == "staging" and request.url.path not in {"/healthz", LOGIN}:
            credentials = request.headers.get("authorization", "")
            try:
                scheme, value = credentials.split(" ", 1)
                if scheme.lower() != "basic":
                    raise ValueError()
                user, password = (
                    base64.b64decode(value, validate=True).decode().split(":", 1)
                )
                valid = credentials_valid(user, password)
            except (ValueError, UnicodeError):
                valid = False
            valid = valid or session_valid(request.cookies.get(COOKIE, ""))
            if not valid and request.method == "GET" and not request.url.path.startswith(("/api/", "/static/")):
                early_response = form_response()
            elif not valid:
                early_response = JSONResponse(
                    {"detail": "Staging authentication required"},
                    status_code=401,
                    headers={
                        "WWW-Authenticate": 'Basic realm="BURANDO TEST", charset="UTF-8"',
                        "Cache-Control": "no-store",
                    },
                )
        response = early_response if early_response is not None else await call_next(request)
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
    async def health(request: Request):
        # Only this non-sensitive liveness response is readable by the CDN entrance.
        # No credentials, API CORS, session changes or staging auth exemptions added.
        headers = {"Cache-Control": "no-store", "Vary": "Origin"}
        if (environment.name == "staging" and
                request.headers.get("origin") == "https://burando-v7-entry.onrender.com"):
            headers["Access-Control-Allow-Origin"] = "https://burando-v7-entry.onrender.com"
        return JSONResponse({"ok": True, "environment": environment.name}, headers=headers)
