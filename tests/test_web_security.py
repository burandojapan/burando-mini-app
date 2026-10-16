from types import SimpleNamespace
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from web_security import install


def make_app(name):
    app = FastAPI()
    install(app, SimpleNamespace(name=name))

    @app.post("/api/body")
    async def body(request: Request):
        return {"size": len(await request.body())}

    @app.get("/admin")
    async def admin():
        return {"ok": True}

    return app


def test_staging_perimeter_and_health(monkeypatch):
    monkeypatch.setenv("STAGING_SITE_USER", "tester")
    monkeypatch.setenv("STAGING_SITE_PASSWORD", "a" * 40)
    c = TestClient(make_app("staging"))
    assert c.get("/admin").status_code == 401
    assert c.get("/healthz").status_code == 200
    assert c.get("/admin", auth=("tester", "wrong")).status_code == 401
    assert c.get("/admin", auth=("tester", "a" * 40)).status_code == 200


def test_request_body_size_limit():
    c = TestClient(make_app("test"))
    assert c.post("/api/body", content=b"hello").json()["size"] == 5
    assert (
        c.post(
            "/api/body", headers={"Content-Length": str(7 * 1024 * 1024)}, content=b""
        ).status_code
        == 413
    )

    def large_body():
        for _ in range(7):
            yield b"x" * (1024 * 1024)

    assert c.post("/api/body", content=large_body()).status_code == 413


def test_webview_login_preserves_protection(monkeypatch):
    monkeypatch.setenv("STAGING_SITE_USER", "tester")
    monkeypatch.setenv("STAGING_SITE_PASSWORD", "a" * 40)
    c = TestClient(make_app("staging"), base_url="https://testserver")
    page = c.get("/admin")
    assert page.status_code == 401 and 'type="password"' in page.text
    assert "WWW-Authenticate" not in page.headers
    assert page.headers["cache-control"] == "no-store"
    # No Basic challenge support is needed; native WebView form uses a cookie.
    headers = {"Origin": "https://testserver", "Accept": "application/json"}
    payload = {"username": "tester", "password": "a" * 40}
    assert c.post("/__staging/login", data=payload).status_code == 403
    assert c.post("/__staging/login", data=payload,
                  headers={**headers, "Origin": "https://evil.example"}).status_code == 403
    assert c.post("/__staging/login", data={**payload, "password": "wrong"}, headers=headers).status_code == 401
    response = c.post("/__staging/login", data=payload, headers=headers)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    for flag in ["__Host-burando_test=", "HttpOnly", "Secure", "SameSite=none", "Path=/"]:
        assert flag in cookie
    assert c.get("/admin").status_code == 200
    assert c.post("/api/body", content=b"hello").status_code == 200
    # Password rotation invalidates prior sessions immediately.
    monkeypatch.setenv("STAGING_SITE_PASSWORD", "b" * 40)
    assert c.get("/admin").status_code == 401


def test_webview_session_tampering_expiry_and_rate_limit(monkeypatch):
    import staging_auth as auth
    monkeypatch.setenv("STAGING_SITE_USER", "tester")
    monkeypatch.setenv("STAGING_SITE_PASSWORD", "a" * 40)
    import time
    value = str(int(time.time()) - 10) + ".nonce"
    assert not auth.session_valid(value + "." + auth.signature(value))
    assert not auth.session_valid("99999999999.nonce.forged")
    c = TestClient(make_app("staging"), base_url="https://testserver")
    assert c.get("/admin", headers={"Cookie": auth.COOKIE + "=forged"}).status_code == 401
    headers = {"Origin": "https://testserver"}
    assert c.post(auth.LOGIN, content=b"x" * 4097, headers=headers).status_code == 413
    for _ in range(9):
        assert c.post(auth.LOGIN, data={"username": "tester", "password": "wrong"}, headers=headers).status_code == 401
    assert c.post(auth.LOGIN, data={"username": "tester", "password": "wrong"}, headers=headers).status_code == 429
