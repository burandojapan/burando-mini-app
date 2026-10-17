import app


def test_modern_secret_not_used_as_jwt(monkeypatch):
    monkeypatch.setattr(app, "SUPABASE_SERVICE_KEY", "sb_secret_TEST")
    headers = app.sb_headers(True)
    assert headers["apikey"] == "sb_secret_TEST"
    assert "Authorization" not in headers


def test_modern_publishable_not_used_as_jwt(monkeypatch):
    monkeypatch.setattr(app, "SUPABASE_KEY", "sb_publishable_TEST")
    assert "Authorization" not in app.sb_headers()


def test_legacy_key_still_uses_bearer(monkeypatch):
    monkeypatch.setattr(app, "SUPABASE_SERVICE_KEY", "legacy.jwt.token")
    assert app.sb_headers(True)["Authorization"] == "Bearer legacy.jwt.token"
