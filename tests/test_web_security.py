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
