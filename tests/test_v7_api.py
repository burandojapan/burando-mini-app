"""HTTP tests with an isolated fake PostgREST transport, no external credentials."""

import json, time
from split_payments import sign_quote, cart_hash
from types import SimpleNamespace
from unittest.mock import patch
import pytest, httpx
from fastapi.testclient import TestClient
import app as store
from v7_security import token_hash

TOKEN = "a" * 64
PRODUCT = dict(
    id=1,
    code="BD-000001",
    name="Test shoe",
    price=185,
    images=[],
    sizes=["42"],
    colors=["White"],
    active=True,
)
ORDER = dict(
    id=1,
    order_code="BR-TEST",
    total=185,
    currency="USD",
    payment_status="awaiting_payment",
    order_status="received",
    payment_version=0,
    lookup_token_hash=token_hash(TOKEN),
    receipt_path=None,
)


@pytest.fixture
def client(monkeypatch):
    for key in [
        "ALL_PROXY",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "all_proxy",
        "https_proxy",
        "http_proxy",
    ]:
        monkeypatch.delenv(key, raising=False)
    calls = []

    async def request(self, method, url, **kw):
        calls.append((method, url, kw))
        params = kw.get("params", {})
        body = kw.get("json", {})
        if url.startswith('https://cbu.uz/'):
            from datetime import datetime, timezone
            data = [{'Ccy':'USD','Nominal':'1','Rate':'12000','Date':datetime.now(timezone.utc).strftime('%d.%m.%Y')}]
        elif url.endswith("/products"):
            data = [PRODUCT]
        elif url.endswith("/orders"):
            if params.get("idempotency_key"):
                return httpx.Response(200,json=[],request=httpx.Request(method,url))
            data = (
                [ORDER]
                if params.get("lookup_token_hash", "eq." + token_hash(TOKEN))
                == "eq." + token_hash(TOKEN)
                else []
            )
        elif url.endswith("/order_items"):
            data = []
        elif url.endswith("/rpc/burando_create_order"):
            data = dict(
                order_code="BR-TEST",
                total=185,
                payment_status="awaiting_payment",
                order_status="received",
            )
        elif url.endswith("/rpc/burando_payment_action"):
            data = dict(
                ok=True,
                payment_status="receipt_submitted"
                if body["p_action"] == "submit"
                else "under_review",
            )
        elif "/storage/" in url:
            data = {}
        elif url.endswith("/store_settings"):
            data = [{"id": 1, "data": {}}]
        elif url.endswith("/banners"):
            data = []
        else:
            data = []
        return httpx.Response(200, json=data, request=httpx.Request(method, url))

    with (
        patch.object(store, "SUPABASE_URL", "https://isolated.invalid"),
        patch.object(store, "SUPABASE_SERVICE_KEY", "test-service"),
        patch.object(store, "ADMIN_KEY", "admin-test-key"),
        patch.object(httpx.AsyncClient, "request", request),
    ):
        yield TestClient(store.app), calls


def checkout():
    return dict(
        customer_name="Demo buyer",
        phone="+998901234567",
        address="Demo address",
        items=[dict(id="BD-000001", qty=1, price=185, size="42", color="White")],
        total=185,
        quote_token=sign_quote('admin-test-key',dict(cart_hash=cart_hash([dict(product_code='BD-000001',size='42',color='White',qty=1,unit_price=185.0)]),total_usd='185.00',total_uzs='2220000',deposit_uzs='1110000',balance_uzs='1110000',exchange_rate='12000',exchange_date='2026-10-22',exchange_source='CBU',expires_at=int(time.time())+900)),
        lookup_token=TOKEN,
        idempotency_key="b43b27db-10c8-49ba-a279-413751055e71",
    )


def test_browser_checkout_uses_atomic_rpc_and_authoritative_title(client):
    c, calls = client
    payload = checkout()
    payload["items"][0]["title"] = "FAKE TITLE"
    r = c.post("/api/order", json=payload)
    assert r.status_code == 200, r.text
    rpc = next(k for m, u, k in calls if u.endswith("/rpc/burando_create_order"))[
        "json"
    ]
    assert rpc["p_items"][0]["title"] == "Test shoe"
    assert rpc["p_order"]["telegram_verified"] is False
    assert rpc["p_order"]["lookup_token_hash"] == token_hash(TOKEN)
    assert TOKEN not in json.dumps(rpc)


def test_fixed_uzs_checkout_snapshot_and_tamper(client, monkeypatch):
    c,calls=client
    monkeypatch.setitem(PRODUCT,'price_uzs',1999000)
    payload=checkout();payload['items'][0]['price_uzs']=1999000;payload['total_uzs']=1999000
    assert c.post('/api/order',json=payload).status_code==200
    rpc=next(k['json'] for m,u,k in calls if u.endswith('/rpc/burando_create_order'))
    assert rpc['p_order']['total_uzs']==2220000
    assert rpc['p_order']['payment_plan']=='split_50'
    assert rpc['p_items'][0]['unit_price_uzs'] is None
    payload['items'][0]['price_uzs']=1
    assert c.post('/api/order',json=payload).status_code==200 # manual product UZS no longer sets checkout amount


def test_price_variant_and_unverified_telegram_rejected(client):
    c, calls = client
    for change in ["price", "variant", "telegram"]:
        p = checkout()
        if change == "price":
            p["items"][0]["price"] = 1
        if change == "variant":
            p["items"][0]["size"] = "999"
        if change == "telegram":
            p["init_data"] = "user=fake"
        assert c.post("/api/order", json=p).status_code in (400, 401, 409)
    assert not any(u.endswith("/rpc/burando_create_order") for _, u, _ in calls)


def test_guest_order_lookup_private(client):
    c, _ = client
    assert c.get("/api/orders/BR-TEST").status_code == 401
    assert (
        c.get("/api/orders/BR-TEST", headers={"X-Order-Token": "b" * 64}).status_code
        == 404
    )
    r = c.get("/api/orders/BR-TEST", headers={"X-Order-Token": TOKEN})
    assert r.status_code == 200
    assert "lookup_token_hash" not in r.json()
    assert "phone" not in r.json()


def test_receipt_invalid_and_unauthorized(client):
    c, calls = client
    assert (
        c.post(
            "/api/orders/BR-TEST/receipt",
            files={"file": ("x.png", b"not an image", "image/png")},
        ).status_code
        == 401
    )
    r = c.post(
        "/api/orders/BR-TEST/receipt",
        headers={"X-Order-Token": TOKEN},
        files={"file": ("x.png", b"not an image", "image/png")},
    )
    assert r.status_code == 400
    assert not any("/storage/" in u for _, u, _ in calls)


def test_admin_auth_and_paid_confirmation(client):
    c, calls = client
    assert (
        c.post(
            "/api/admin/orders/BR-TEST/payment",
            json={"action": "paid", "version": 0, "funds_confirmed": True},
        ).status_code
        == 401
    )
    assert (
        c.post(
            "/api/admin/orders/BR-TEST/payment",
            headers={"X-Admin-Key": "admin-test-key"},
            json={"action": "paid", "version": 0},
        ).status_code
        == 400
    )
    assert (
        c.patch(
            "/api/admin/orders/BR-TEST",
            headers={"X-Admin-Key": "admin-test-key"},
            json={"payment_status": "paid"},
        ).status_code
        == 409
    )


def test_settings_and_banner_validation(client):
    c, _ = client
    headers = {"X-Admin-Key": "admin-test-key"}
    assert (
        c.put(
            "/api/admin/settings",
            headers=headers,
            json={"instagram_url": "https://evil.example"},
        ).status_code
        == 422
    )
    assert (
        c.post(
            "/api/admin/banners", headers=headers, json={"image": "javascript:alert(1)"}
        ).status_code
        == 422
    )
    assert (
        c.post(
            "/api/admin/banners",
            headers=headers,
            json={"image": "https://images.example/x.jpg", "link": "//evil.example"},
        ).status_code
        == 422
    )
    assert c.get("/api/settings").status_code == 200
    assert c.get("/api/banners").json() == []


def test_receipt_valid_upload_never_marks_paid(client):
    from PIL import Image
    from io import BytesIO

    c, calls = client
    stream = BytesIO()
    Image.new("RGB", (20, 20), "white").save(stream, "PNG")
    r = c.post(
        "/api/orders/BR-TEST/receipt",
        headers={"X-Order-Token": TOKEN},
        files={"file": ("test.png", stream.getvalue(), "image/png")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["payment_status"] == "receipt_submitted"
    rpc = next(k for m, u, k in calls if u.endswith("/rpc/burando_payment_action"))[
        "json"
    ]
    assert rpc["p_action"] == "submit"
    assert any("/storage/v1/object/payment-receipts/" in u for _, u, _ in calls)


def test_receipt_locked_during_review(client, monkeypatch):
    c, calls = client
    monkeypatch.setitem(ORDER, "payment_status", "under_review")
    r = c.post(
        "/api/orders/BR-TEST/receipt",
        headers={"X-Order-Token": TOKEN},
        files={"file": ("test.jpg", b"anything", "image/jpeg")},
    )
    assert r.status_code == 409
    assert not any("/storage/" in u for _, u, _ in calls)


def test_telegram_checkout_verified(client, monkeypatch):
    from test_v7_security import signed

    c, calls = client
    monkeypatch.setattr(store, "BOT_TOKEN", "test-bot")
    p = checkout()
    p["init_data"] = signed()
    assert c.post("/api/order", json=p).status_code == 200
    rpc = next(k for m, u, k in calls if u.endswith("/rpc/burando_create_order"))[
        "json"
    ]
    assert rpc["p_order"]["telegram_verified"] is True
    assert rpc["p_order"]["telegram_user_id"] == "42"


def test_notifications_disabled_without_explicit_enable(client):
    c, calls = client
    r = c.post(
        "/api/admin/notifications/dispatch", headers={"X-Admin-Key": "admin-test-key"}
    )
    assert r.status_code == 200
    assert r.json() == {"enabled": False, "processed": 0}
    assert not any("api.telegram.org" in u for _, u, _ in calls)


def test_admin_receipt_endpoint_denies_guests(client):
    c, _ = client
    assert c.get("/api/admin/orders/BR-TEST/receipt").status_code == 401
    assert c.get("/api/admin/orders/BR-TEST/audit").status_code == 401


def test_security_headers(client):
    c, _ = client
    r = c.get("/healthz")
    assert r.status_code == 200
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["x-content-type-options"] == "nosniff"
