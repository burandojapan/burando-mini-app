"""V7 additions, reusing the existing FastAPI application and catalog."""

import hashlib, json, time, uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from urllib.parse import urlparse
import httpx
from fastapi import HTTPException, Header, Request, UploadFile, File
from pydantic import BaseModel, Field, ConfigDict, model_validator
from v7_security import amount, token_hash, clean_receipt, MAX_RECEIPT_BYTES


class Checkout(BaseModel):
    customer_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=5, max_length=50)
    backup_phone: str = Field(default="", max_length=50)
    address: str = Field(min_length=3, max_length=300)
    comment: str = Field(default="", max_length=500)
    items: list[dict] = Field(min_length=1, max_length=100)
    total: float
    language: str = Field(default="uz", pattern="^(uz|ru)$")
    init_data: str = Field(default="", max_length=10000)
    lookup_token: str = Field(min_length=43, max_length=128)
    idempotency_key: uuid.UUID


class Decision(BaseModel):
    action: str
    version: int = Field(ge=0)
    reason: str = Field(default="", max_length=500)
    funds_confirmed: bool = False


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    instagram_url: str = ""
    telegram_url: str = ""
    payment_details_uz: str = Field(default="", max_length=2000)
    payment_details_ru: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def links(self):
        for name, domain in [
            ("instagram_url", "instagram.com"),
            ("telegram_url", "t.me"),
        ]:
            value = getattr(self, name)
            if value:
                parsed = urlparse(value)
                if (
                    parsed.scheme != "https"
                    or parsed.hostname not in {domain, "www." + domain}
                    or parsed.username
                    or parsed.password
                ):
                    raise ValueError("Invalid official contact URL")
        return self


class Banner(BaseModel):
    title_uz: str = Field(default="", max_length=160)
    title_ru: str = Field(default="", max_length=160)
    image: str = Field(max_length=2000)
    link: str = Field(default="", max_length=500)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    active: bool = True
    position: int = 0

    @model_validator(mode="after")
    def valid(self):
        if urlparse(self.image).scheme != "https":
            raise ValueError("HTTPS image required")
        if self.link and not self.link.startswith(("/?product=", "/?category=")):
            raise ValueError("Use internal product/category link")
        if any(d and not d.tzinfo for d in (self.starts_at, self.ends_at)):
            raise ValueError("Timezone required")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("Invalid dates")
        return self


def install(app, ns):
    limits = defaultdict(deque)

    def throttle(request):
        # Single-process bound. Configure shared edge rate limits for multi-worker deployment.
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        if len(limits) > 10000:
            for ip in list(limits):
                if not limits[ip] or limits[ip][-1] < now - 60:
                    del limits[ip]
        q = limits[key]
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= 20:
            raise HTTPException(429, "Too many requests; retry in one minute")
        q.append(now)

    async def db(method, path, **kwargs):
        ns.require_db()
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                r = await client.request(
                    method,
                    ns.SUPABASE_URL + "/rest/v1/" + path,
                    headers=ns.sb_headers(True, "return=representation"),
                    **kwargs,
                )
        except httpx.HTTPError:
            raise HTTPException(503, "Database temporarily unavailable") from None
        if not r.is_success:
            if "rpc/" in path and r.status_code == 400:
                raise HTTPException(409, "Operation conflict; refresh and retry")
            raise HTTPException(503, "Database unavailable or V7 migration not applied")
        return r.json() if r.content else None

    async def authorized(code, token):
        hashed = token_hash(token)
        rows = await db(
            "GET",
            "orders",
            params={
                "order_code": "eq." + code,
                "lookup_token_hash": "eq." + hashed,
                "select": "*",
            },
        )
        if not rows:
            raise HTTPException(404, "Order not found")
        return rows[0]

    async def public_order(o):
        keys = [
            "order_code",
            "total",
            "currency",
            "payment_status",
            "order_status",
            "payment_version",
            "created_at",
        ]
        result = {k: o.get(k) for k in keys}
        result["has_receipt"] = bool(o.get("receipt_path"))
        result["items"] = await db(
            "GET",
            "order_items",
            params={
                "order_id": "eq." + str(o["id"]),
                "select": "product_code,title,image,size,color,qty,unit_price,line_total",
            },
        )
        if o.get("payment_status") == "rejected":
            audit = await db(
                "GET",
                "payment_audit",
                params={
                    "order_id": "eq." + str(o["id"]),
                    "action": "eq.reject",
                    "select": "reason",
                    "order": "id.desc",
                    "limit": "1",
                },
            )
            result["rejection_reason"] = audit[0]["reason"] if audit else ""
        return result

    class Claim(BaseModel):
        init_data: str = Field(max_length=10000)
        lookup_token: str = Field(min_length=43, max_length=128)

    @app.post("/api/orders/{code}/access")
    async def claim_access(code: str, payload: Claim, request: Request):
        throttle(request)
        user = ns.validate(payload.init_data)
        rows = await db(
            "PATCH",
            "orders",
            params={
                "order_code": "eq." + code,
                "telegram_user_id": "eq." + str(user["id"]),
            },
            json={"lookup_token_hash": token_hash(payload.lookup_token)},
        )
        if not rows:
            raise HTTPException(404, "Order not found")
        return {"ok": True}

    @app.post("/api/order")
    async def checkout(order: Checkout, request: Request):
        throttle(request)
        hashed = token_hash(order.lookup_token)
        user = ns.validate(order.init_data) if order.init_data else {}
        if (
            not order.customer_name.strip()
            or not order.address.strip()
            or not any(c.isdigit() for c in order.phone)
        ):
            raise HTTPException(400, "Customer details required")
        # Do not use JSON fallback when persisting orders: require live authoritative prices.
        rows = await db("GET", "products", params={"select": "*", "active": "eq.true"})
        catalog = {p["id"]: p for p in [ns.normalize_product(r) for r in rows]}
        items = []
        total = amount(0)
        for raw in order.items:
            try:
                item = ns.Item(**raw)
            except Exception:
                raise HTTPException(400, "Invalid cart item")
            p = catalog.get(item.id)
            if not p:
                raise HTTPException(400, "Product unavailable")
            if (p["sizes"] and item.size not in p["sizes"]) or (
                p["colors_uz"] and item.color not in p["colors_uz"]
            ):
                raise HTTPException(400, "Invalid product variant")
            price = amount(p["price"])
            if amount(item.price) != price:
                raise HTTPException(409, "Price changed; refresh catalog")
            line = price * item.qty
            total += line
            items.append(
                dict(
                    product_code=p["id"],
                    title=p["title_uz"],
                    image=p["image"],
                    size=item.size,
                    color=item.color,
                    qty=item.qty,
                    unit_price=float(price),
                    line_total=float(line),
                )
            )
        if amount(order.total) != total:
            raise HTTPException(409, "Total changed; refresh cart")
        payload = order.model_dump(mode="json")
        payload.pop("lookup_token")
        payload.pop("init_data")
        fingerprint = hashlib.sha256(
            json.dumps(
                {"checkout": payload, "telegram_id": user.get("id")}, sort_keys=True
            ).encode()
        ).hexdigest()
        saved = await db(
            "POST",
            "rpc/burando_create_order",
            json={
                "p_order": dict(
                    order_code=ns.order_code(),
                    telegram_user_id=str(user.get("id") or ""),
                    telegram_username=user.get("username", ""),
                    telegram_verified=bool(user),
                    customer_language=order.language,
                    customer_name=order.customer_name.strip(),
                    phone=order.phone.strip(),
                    backup_phone=order.backup_phone.strip(),
                    address=order.address.strip(),
                    comment=order.comment.strip(),
                    total=float(total),
                    lookup_token_hash=hashed,
                    idempotency_key=str(order.idempotency_key),
                    request_hash=fingerprint,
                ),
                "p_items": items,
            },
        )
        # Migration 008 queues notices transactionally; transport stays off until explicitly enabled.
        return {"ok": True, **saved}

    class TelegramSession(BaseModel):
        init_data: str = Field(max_length=10000)

    @app.post("/api/telegram/orders")
    async def telegram_orders(payload: TelegramSession, request: Request):
        throttle(request)
        user = ns.validate(payload.init_data)
        rows = await db(
            "GET",
            "orders",
            params={
                "telegram_user_id": "eq." + str(user["id"]),
                "order": "created_at.desc",
                "select": "*",
                "limit": "100",
            },
        )
        return [await public_order(o) for o in rows]

    @app.get("/api/orders/{code}")
    async def lookup(
        code: str, request: Request, x_order_token: str = Header(default="")
    ):
        throttle(request)
        return await public_order(await authorized(code, x_order_token))

    @app.post("/api/orders/{code}/receipt")
    async def receipt(
        code: str,
        request: Request,
        file: UploadFile = File(...),
        x_order_token: str = Header(default=""),
    ):
        throttle(request)
        o = await authorized(code, x_order_token)
        if o["payment_status"] not in {
            "pending",
            "awaiting_payment",
            "receipt_submitted",
            "rejected",
        }:
            raise HTTPException(409, "Receipt is locked for verification")
        data = clean_receipt(await file.read(MAX_RECEIPT_BYTES + 1), file.content_type)
        path = str(o["id"]) + "/" + uuid.uuid4().hex + ".jpg"
        async with httpx.AsyncClient(timeout=40) as client:
            r = await client.post(
                ns.SUPABASE_URL + "/storage/v1/object/payment-receipts/" + path,
                headers={**ns.sb_headers(True), "Content-Type": "image/jpeg"},
                content=data,
            )
        if not r.is_success:
            raise HTTPException(503, "Receipt storage unavailable")
        try:
            result = await db(
                "POST",
                "rpc/burando_payment_action",
                json=dict(
                    p_code=code,
                    p_version=o["payment_version"],
                    p_action="submit",
                    p_actor="customer",
                    p_path=path,
                    p_token_hash=token_hash(x_order_token),
                ),
            )
        except Exception:
            # A network timeout may occur AFTER transaction commit. Keep the private object:
            # deleting it here could destroy a successfully attached receipt.
            raise
        # Previous receipts retained privately for recovery; lifecycle cleanup needs scheduled retention policy.
        return {"ok": True, "payment_status": result["payment_status"]}

    @app.patch("/api/admin/orders/{code}")
    async def delivery(code: str, payload: dict, x_admin_key: str = Header(default="")):
        ns.require_admin_key(x_admin_key)
        if payload.get("payment_status") is not None:
            raise HTTPException(409, "Use audited payment verification")
        status = payload.get("order_status")
        if status not in {
            "received",
            "preparing_japan",
            "shipped_japan",
            "in_transit",
            "arrived_uz",
            "out_for_delivery",
            "delivered",
            "cancelled",
        }:
            raise HTTPException(400, "Invalid delivery status")
        return await db(
            "POST",
            "rpc/burando_delivery_action",
            json={"p_code": code, "p_status": status},
        )

    @app.patch("/api/admin/orders/{code}/status")
    async def legacy_delivery(
        code: str, payload: dict, x_admin_key: str = Header(default="")
    ):
        return await delivery(
            code, {"order_status": payload.get("status")}, x_admin_key
        )

    @app.get("/api/orders/{code}/receipt")
    async def customer_receipt(
        code: str, request: Request, x_order_token: str = Header(default="")
    ):
        throttle(request)
        order = await authorized(code, x_order_token)
        if not order.get("receipt_path"):
            raise HTTPException(404, "Receipt not found")
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                ns.SUPABASE_URL
                + "/storage/v1/object/authenticated/payment-receipts/"
                + order["receipt_path"],
                headers=ns.sb_headers(True),
            )
        if not response.is_success:
            raise HTTPException(503, "Receipt unavailable")
        from fastapi.responses import Response

        return Response(
            response.content,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    @app.get("/api/admin/orders/{code}/receipt")
    async def admin_receipt(code: str, x_admin_key: str = Header(default="")):
        ns.require_admin_key(x_admin_key)
        rows = await db(
            "GET",
            "orders",
            params={"order_code": "eq." + code, "select": "id,receipt_path"},
        )
        if not rows or not rows[0].get("receipt_path"):
            raise HTTPException(404, "Receipt not found")
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                ns.SUPABASE_URL
                + "/storage/v1/object/authenticated/payment-receipts/"
                + rows[0]["receipt_path"],
                headers=ns.sb_headers(True),
            )
        if not r.is_success:
            raise HTTPException(503, "Receipt unavailable")
        from fastapi.responses import Response

        return Response(
            r.content,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    @app.post("/api/admin/orders/{code}/payment")
    async def decision(
        code: str, payload: Decision, x_admin_key: str = Header(default="")
    ):
        ns.require_admin_key(x_admin_key)
        if payload.action not in {"review", "paid", "reject"}:
            raise HTTPException(400, "Invalid decision")
        if payload.action == "paid" and not payload.funds_confirmed:
            raise HTTPException(400, "Confirm actual funds received")
        result = await db(
            "POST",
            "rpc/burando_payment_action",
            json=dict(
                p_code=code,
                p_version=payload.version,
                p_action=payload.action,
                p_actor="admin:"
                + hashlib.sha256(x_admin_key.encode()).hexdigest()[:12],
                p_reason=payload.reason,
            ),
        )
        return {"ok": True, "payment_status": result["payment_status"]}

    @app.get("/api/admin/orders/{code}/audit")
    async def audit(code: str, x_admin_key: str = Header(default="")):
        ns.require_admin_key(x_admin_key)
        rows = await db(
            "GET", "orders", params={"order_code": "eq." + code, "select": "id"}
        )
        if not rows:
            raise HTTPException(404, "Order not found")
        return await db(
            "GET",
            "payment_audit",
            params={"order_id": "eq." + str(rows[0]["id"]), "order": "id.asc"},
        )

    @app.get("/api/settings")
    async def settings():
        rows = await db(
            "GET", "store_settings", params={"id": "eq.1", "select": "data"}
        )
        return Settings(**(rows[0]["data"] if rows else {})).model_dump()

    @app.put("/api/admin/settings")
    async def save_settings(payload: Settings, x_admin_key: str = Header(default="")):
        ns.require_admin_key(x_admin_key)
        await db(
            "PATCH",
            "store_settings",
            params={"id": "eq.1"},
            json={"data": payload.model_dump()},
        )
        return {"ok": True}

    @app.get("/api/banners")
    async def banners():
        rows = await db(
            "GET", "banners", params={"active": "eq.true", "order": "position.asc"}
        )
        now = datetime.now(timezone.utc)
        return [
            r
            for r in rows
            if (
                not r.get("starts_at")
                or datetime.fromisoformat(r["starts_at"].replace("Z", "+00:00")) <= now
            )
            and (
                not r.get("ends_at")
                or now < datetime.fromisoformat(r["ends_at"].replace("Z", "+00:00"))
            )
        ]

    @app.get("/api/admin/banners")
    async def admin_banners(x_admin_key: str = Header(default="")):
        ns.require_admin_key(x_admin_key)
        return await db("GET", "banners", params={"order": "position.asc"})

    @app.post("/api/admin/banners")
    async def save_banner(payload: Banner, x_admin_key: str = Header(default="")):
        ns.require_admin_key(x_admin_key)
        return await db("POST", "banners", json=payload.model_dump(mode="json"))

    @app.put("/api/admin/banners/{banner_id}")
    async def update_banner(
        banner_id: uuid.UUID, payload: Banner, x_admin_key: str = Header(default="")
    ):
        ns.require_admin_key(x_admin_key)
        rows = await db(
            "PATCH",
            "banners",
            params={"id": "eq." + str(banner_id)},
            json=payload.model_dump(mode="json"),
        )
        if not rows:
            raise HTTPException(404, "Banner not found")
        return rows

    @app.delete("/api/admin/banners/{banner_id}")
    async def delete_banner(
        banner_id: uuid.UUID, x_admin_key: str = Header(default="")
    ):
        ns.require_admin_key(x_admin_key)
        await db("DELETE", "banners", params={"id": "eq." + str(banner_id)})
        return {"ok": True}
