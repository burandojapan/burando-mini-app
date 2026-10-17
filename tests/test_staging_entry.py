import pytest
from fastapi.testclient import TestClient
from staging_entry import build_entry


def test_provisioning_is_private_and_not_ready(monkeypatch):
    env = dict(
        APP_ENV="staging",
        STAGING_SETUP_MODE="true",
        STAGING_SITE_USER="test",
        STAGING_SITE_PASSWORD="x" * 40,
    )
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    client = TestClient(build_entry(env))
    assert client.get("/healthz").status_code == 200
    assert client.get("/").status_code == 401
    assert client.get("/", auth=("test", "x" * 40)).status_code == 503
    assert client.get("/readyz", auth=("test", "x" * 40)).json()["ready"] is False
    assert (
        client.post("/api/order", auth=("test", "x" * 40), json={}).status_code == 503
    )


@pytest.mark.parametrize(
    "change",
    [
        {"APP_ENV": "production"},
        {"BOT_TOKEN": "forbidden"},
        {"SUPABASE_URL": "https://forbidden.invalid"},
        {"NOTIFICATIONS_ENABLED": "true"},
        {"STAGING_SITE_PASSWORD": "weak"},
    ],
)
def test_unsafe_provisioning_rejected(change):
    env = dict(
        APP_ENV="staging",
        STAGING_SETUP_MODE="true",
        STAGING_SITE_USER="test",
        STAGING_SITE_PASSWORD="x" * 40,
    )
    env.update(change)
    with pytest.raises(RuntimeError):
        build_entry(env)
