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


def test_customer_cors_is_exact_origin_no_cookies_and_not_admin():
    c=TestClient(make_app('production'))
    origin={'Origin':'https://burando-live-entry.onrender.com'}
    for path in ['/api/order','/api/orders/BR-X/receipt','/shop','/api/telegram-link/start']:
        r=c.options(path,headers={**origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type, X-Order-Token'})
        assert r.status_code==200
        assert r.headers['access-control-allow-origin']==origin['Origin']
        assert 'access-control-allow-credentials' not in r.headers
    for path in ['/admin','/api/admin/orders','/api/admin/settings']:
        assert 'access-control-allow-origin' not in c.options(path,headers={**origin,'Access-Control-Request-Method':'POST'}).headers
    for host in ['https://evil.example','https://burando-v7-entry.onrender.com']:
        assert 'access-control-allow-origin' not in c.get('/api/products',headers={'Origin':host}).headers
    r=c.options('/api/order',headers={**origin,'Access-Control-Request-Method':'PUT'})
    assert r.status_code==403
    r=c.options('/api/order',headers={**origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-Admin-Key'})
    assert r.status_code==403
    assert 'access-control-allow-origin' not in TestClient(make_app('staging')).options('/api/order',headers={**origin,'Access-Control-Request-Method':'POST'}).headers


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


def test_entry_can_only_read_staging_liveness():
    origin = {"Origin": "https://burando-v7-entry.onrender.com"}
    client = TestClient(make_app("staging"))
    response = client.get("/healthz", headers=origin)
    assert response.json() == {"ok": True, "environment": "staging"}
    assert response.headers["access-control-allow-origin"] == origin["Origin"]
    assert response.headers["cache-control"] == "no-store"
    assert "access-control-allow-credentials" not in response.headers
    assert "access-control-allow-origin" not in client.get(
        "/healthz", headers={"Origin": "https://evil.example"}).headers
    assert "access-control-allow-origin" not in TestClient(make_app("production")).get(
        "/healthz", headers=origin).headers
    assert client.get("/admin", headers=origin).status_code == 401
    api = client.post("/api/body", headers=origin, content=b"hello")
    assert api.status_code == 401 and "access-control-allow-origin" not in api.headers


def test_release_documents_and_assets_require_freshness():
    app = make_app('production')

    @app.get('/shop')
    @app.get('/')
    async def shop():
        from fastapi.responses import HTMLResponse
        return HTMLResponse('<main>BURANDO</main>')

    @app.get('/static/app.js')
    async def script():
        from fastapi.responses import Response
        return Response('/* app */', media_type='text/javascript')

    client = TestClient(app)
    for path in ['/', '/shop', '/admin']:
        assert client.get(path).headers['cache-control'] == 'no-store'
    assert client.get('/static/app.js?v=7.11').headers['cache-control'] == 'no-cache, must-revalidate'


def test_live_entry_only_reads_production_health():
    origin = {'Origin': 'https://burando-live-entry.onrender.com'}
    client = TestClient(make_app('production'))
    assert client.get('/healthz', headers=origin).headers['access-control-allow-origin'] == origin['Origin']
    assert 'access-control-allow-origin' not in client.get('/admin', headers=origin).headers
    for environment, caller in [('production','https://burando-v7-entry.onrender.com'), ('staging',origin['Origin']), ('production','https://evil.example')]:
        response = TestClient(make_app(environment)).get('/healthz', headers={'Origin':caller})
        assert 'access-control-allow-origin' not in response.headers
