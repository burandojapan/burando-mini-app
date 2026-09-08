import os
import json
import hmac
import hashlib
import uuid
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import parse_qsl

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv()

BASE = Path(__file__).resolve().parent

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "").strip()

DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()

# Production write operations uchun service-role tavsiya qilinadi.
SUPABASE_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY", ""
).strip()

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "").strip()

app = FastAPI(title="BURANDO Mini App")

app.mount(
    "/static",
    StaticFiles(directory=BASE / "static"),
    name="static",
)


# =========================================================
# HELPERS
# =========================================================

def load_local_products():
    return json.loads(
        (BASE / "data/products.json").read_text(
            encoding="utf-8"
        )
    )


def as_list(value):
    if value is None:
        return []

    if isinstance(value, list):
        return value

    if isinstance(value, str):
        value = value.strip()

        if not value:
            return []

        try:
            parsed = json.loads(value)

            if isinstance(parsed, list):
                return parsed

            return [str(parsed)]

        except Exception:
            # Admin panelda vergul yoki yangi qator bilan ham yozish mumkin.
            if "\n" in value:
                return [
                    x.strip()
                    for x in value.splitlines()
                    if x.strip()
                ]

            return [value]

    return [value]


def category_slug(value):
    value = (value or "").strip().lower()

    aliases = {
        "oyoq kiyim": "shoes",
        "shoes": "shoes",

        "soat": "watches",
        "watches": "watches",

        "kiyim": "clothes",
        "clothes": "clothes",

        "kosmetika": "beauty",
        "beauty": "beauty",

        "aksessuar": "accessories",
        "aksessuarlar": "accessories",
        "accessories": "accessories",

        "uniqlo": "clothes",
    }

    return aliases.get(
        value,
        value or "accessories"
    )


def normalize_product(row):
    images = [
        str(x)
        for x in as_list(row.get("images"))
        if str(x).strip()
    ]

    sizes = [
        str(x)
        for x in as_list(row.get("sizes"))
        if str(x).strip()
    ]

    colors = [
        str(x)
        for x in as_list(row.get("colors"))
        if str(x).strip()
    ]

    code = str(
        row.get("code")
        or row.get("id")
        or ""
    )

    name = str(
        row.get("name")
        or code
    )

    description = str(
        row.get("description")
        or ""
    )

    description_uz = str(
        row.get("description_uz")
        or description
        or ""
    )

    description_ru = str(
        row.get("description_ru")
        or ""
    )

    brand = str(
        row.get("brand")
        or ""
    ).strip()

    brand_text = (
        f"{name} {description} {' '.join(images)}"
    ).lower()

    if not brand and "uniqlo" in brand_text:
        brand = "UNIQLO"

    return {
        "id": code,
        "title_uz": name,
        "title_ru": name,
        "price": float(
            row.get("price") or 0
        ),
        "category": category_slug(
            row.get("category")
        ),
        "brand": brand,
        "image": images[0] if images else "",
        "images": images,
        "desc_uz": description_uz,
        "desc_ru": description_ru,
        "sizes": sizes,
        "colors_uz": colors,
        "colors_ru": colors,
        "badge_uz": "Original Japan",
        "badge_ru": "Original Japan",
        "active": bool(
            row.get("active", True)
        ),
    }


def read_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    }


def write_key():
    return (
        SUPABASE_SERVICE_ROLE_KEY
        or SUPABASE_KEY
    )


def write_headers(
    representation=False
):
    key = write_key()

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    if representation:
        headers["Prefer"] = "return=representation"

    return headers


def ensure_supabase_write():
    if not SUPABASE_URL or not write_key():
        raise HTTPException(
            503,
            "Supabase write access is not configured"
        )


def require_admin(
    x_admin_key: str = Header(default="")
):
    if not ADMIN_API_KEY:
        raise HTTPException(
            503,
            "ADMIN_API_KEY is not configured"
        )

    if not hmac.compare_digest(
        x_admin_key,
        ADMIN_API_KEY
    ):
        raise HTTPException(
            401,
            "Admin authorization required"
        )


def make_order_code():
    now = datetime.now(timezone.utc)

    suffix = (
        uuid.uuid4()
        .hex[:6]
        .upper()
    )

    return (
        f"BR-{now.strftime('%Y%m%d')}-{suffix}"
    )


def extract_telegram_user_id(init_data):
    try:
        data = dict(
            parse_qsl(
                init_data,
                keep_blank_values=True
            )
        )

        raw_user = data.get("user", "")

        if not raw_user:
            return ""

        user = json.loads(raw_user)

        return str(
            user.get("id") or ""
        )

    except Exception:
        return ""


# =========================================================
# PRODUCTS
# =========================================================

async def load_products():
    if not SUPABASE_URL or not SUPABASE_KEY:
        return load_local_products()

    try:
        async with httpx.AsyncClient(
            timeout=15
        ) as client:

            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/products",
                headers=read_headers(),
                params={
                    "select": "*",
                    "active": "eq.true",
                    "order": "id.asc",
                },
            )

            response.raise_for_status()

            rows = response.json()

        return [
            normalize_product(row)
            for row in rows
        ]

    except Exception as exc:
        print(
            f"Supabase products error: {exc}"
        )

        return load_local_products()


# =========================================================
# MODELS
# =========================================================

class Item(BaseModel):
    id: str
    title: str = ""
    qty: int = Field(
        ge=1,
        le=99
    )
    price: float = Field(
        ge=0
    )
    size: str = ""
    color: str = ""


class Order(BaseModel):
    customer_name: str = Field(
        min_length=2,
        max_length=100
    )

    phone: str = Field(
        min_length=5,
        max_length=50
    )

    address: str = Field(
        min_length=3,
        max_length=300
    )

    comment: str = Field(
        default="",
        max_length=500
    )

    items: list[Item]

    total: float

    init_data: str = ""


class AdminProduct(BaseModel):
    code: str = ""

    name: str = Field(
        min_length=1,
        max_length=300
    )

    price: float = Field(
        ge=0
    )

    category: str = "accessories"

    description: str = ""
    description_uz: str = ""
    description_ru: str = ""

    images: list[str] = []
    sizes: list[str] = []
    colors: list[str] = []

    active: bool = True


class OrderStatusUpdate(BaseModel):
    order_status: str | None = None
    payment_status: str | None = None


# =========================================================
# TELEGRAM VALIDATION
# =========================================================

def validate(init_data: str):
    if DEV_MODE and not init_data:
        return

    if not BOT_TOKEN or not init_data:
        raise HTTPException(
            401,
            "Telegram authorization required"
        )

    data = dict(
        parse_qsl(
            init_data,
            keep_blank_values=True
        )
    )

    received_hash = data.pop(
        "hash",
        None
    )

    if not received_hash:
        raise HTTPException(
            401,
            "Invalid Telegram data"
        )

    check_string = "\n".join(
        f"{k}={v}"
        for k, v in sorted(
            data.items()
        )
    )

    secret = hmac.new(
        b"WebAppData",
        BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()

    calculated_hash = hmac.new(
        secret,
        check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(
        calculated_hash,
        received_hash
    ):
        raise HTTPException(
            401,
            "Invalid Telegram data"
        )


# =========================================================
# PAGES
# =========================================================

@app.get("/")
async def home():
    return FileResponse(
        BASE / "static/index.html"
    )


@app.get("/admin")
async def admin_page():
    return FileResponse(
        BASE / "static/admin.html"
    )


# =========================================================
# PUBLIC API
# =========================================================

@app.get("/api/products")
async def get_products():
    return await load_products()


@app.post("/api/order")
async def create_order(order: Order):
    validate(order.init_data)

    if not order.items:
        raise HTTPException(
            400,
            "Cart is empty"
        )

    products = await load_products()

    catalog = {
        p["id"]: p
        for p in products
    }

    normalized_items = []

    total = 0.0

    for item in order.items:
        product = catalog.get(
            item.id
        )

        if not product:
            raise HTTPException(
                400,
                f"Unknown product: {item.id}"
            )

        price = float(
            product["price"]
        )

        if abs(
            price - item.price
        ) > 0.01:
            raise HTTPException(
                400,
                "Invalid product price"
            )

        line_total = round(
            price * item.qty,
            2
        )

        total += line_total

        normalized_items.append(
            (
                item,
                product,
                price,
                line_total,
            )
        )

    total = round(
        total,
        2
    )

    if abs(
        total - order.total
    ) > 0.02:
        raise HTTPException(
            400,
            "Invalid total"
        )

    order_code = make_order_code()

    telegram_user_id = (
        extract_telegram_user_id(
            order.init_data
        )
    )

    order_items = []

    for (
        item,
        product,
        price,
        line_total,
    ) in normalized_items:

        product_title = (
            item.title.strip()
            or product.get("title_uz")
            or product["id"]
        )

        order_items.append({
            "id": product["id"],
            "title": product_title,
            "qty": item.qty,
            "price": price,
            "line_total": line_total,
            "size": item.size,
            "color": item.color,
        })

    # -----------------------------------------
    # SAVE ORDER TO SUPABASE
    # -----------------------------------------

    ensure_supabase_write()

    order_payload = {
        "order_code": order_code,
        "telegram_user_id": telegram_user_id,
        "customer_name": order.customer_name,
        "phone": order.phone,
        "address": order.address,
        "comment": order.comment.strip(),
        "items": order_items,
        "total": total,
        "currency": "USD",
        "order_status": "waiting_payment",
        "payment_status": "pending",
    }

    try:
        async with httpx.AsyncClient(
            timeout=20
        ) as client:

            save_response = await client.post(
                f"{SUPABASE_URL}/rest/v1/orders",
                headers=write_headers(
                    representation=True
                ),
                json=order_payload,
            )

            save_response.raise_for_status()

    except httpx.HTTPStatusError as exc:
        detail = exc.response.text

        print(
            "Supabase order save error:",
            detail
        )

        raise HTTPException(
            502,
            "Order database write failed. "
            "Configure SUPABASE_SERVICE_ROLE_KEY "
            "on Render if RLS blocks writes."
        )


    # -----------------------------------------
    # TELEGRAM NOTIFICATION
    # -----------------------------------------

    lines = [
        "🛍 <b>YANGI BURANDO BUYURTMA</b>",
        "",
        f"🧾 <b>Buyurtma:</b> {escape(order_code)}",
        f"👤 <b>Mijoz:</b> {escape(order.customer_name)}",
        f"📞 <b>Telefon:</b> {escape(order.phone)}",
        f"📍 <b>Manzil:</b> {escape(order.address)}",
    ]

    if order.comment.strip():
        lines.append(
            f"💬 <b>Izoh:</b> "
            f"{escape(order.comment.strip())}"
        )

    lines += [
        "",
        "📦 <b>Mahsulotlar:</b>",
    ]

    for (
        item,
        product,
        price,
        line_total,
    ) in normalized_items:

        product_title = (
            item.title.strip()
            or product.get("title_uz")
            or product["id"]
        )

        details = []

        if item.size:
            details.append(
                f"O‘lcham: {escape(item.size)}"
            )

        if item.color:
            details.append(
                f"Rang: {escape(item.color)}"
            )

        detail_text = (
            f" ({', '.join(details)})"
            if details
            else ""
        )

        lines.append(
            f"• {escape(product_title)}"
            f"{detail_text} "
            f"× {item.qty} "
            f"— ${line_total:.2f}"
        )

    lines += [
        "",
        f"💵 <b>Jami:</b> ${total:.2f}",
        "💳 <b>To‘lov:</b> KUTILMOQDA",
    ]

    telegram_sent = False

    if BOT_TOKEN and ADMIN_CHAT_ID:
        try:
            async with httpx.AsyncClient(
                timeout=20
            ) as client:

                response = await client.post(
                    f"https://api.telegram.org/"
                    f"bot{BOT_TOKEN}/sendMessage",
                    json={
                        "chat_id": ADMIN_CHAT_ID,
                        "text": "\n".join(lines),
                        "parse_mode": "HTML",
                    },
                )

                telegram_sent = (
                    response.is_success
                )

        except Exception as exc:
            print(
                "Telegram send error:",
                exc
            )

    elif DEV_MODE:
        print(
            "\n".join(lines)
        )

    return {
        "ok": True,
        "order_code": order_code,
        "total": total,
        "currency": "USD",
        "order_status": "waiting_payment",
        "payment_status": "pending",
        "telegram_sent": telegram_sent,
    }



# =========================================================
# ADMIN IMAGE UPLOAD
# =========================================================

@app.post("/api/admin/upload")
async def admin_upload_image(
    file: UploadFile = File(...),
    x_admin_key: str = Header(default="")
):
    require_admin(x_admin_key)
    ensure_supabase_write()

    allowed_types = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }

    content_type = (file.content_type or "").lower()

    if content_type not in allowed_types:
        raise HTTPException(
            400,
            "Faqat JPG, PNG, WEBP yoki GIF rasm yuklash mumkin"
        )

    data = await file.read()

    if not data:
        raise HTTPException(400, "Rasm bo'sh")

    # 10 MB
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(
            400,
            "Rasm hajmi 10 MB dan oshmasligi kerak"
        )

    ext = allowed_types[content_type]

    now = datetime.now(timezone.utc)

    object_name = (
        f"admin/"
        f"{now.strftime('%Y/%m/%d')}/"
        f"{uuid.uuid4().hex}{ext}"
    )

    key = write_key()

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
        "x-upsert": "false",
    }

    upload_url = (
        f"{SUPABASE_URL}/storage/v1/object/"
        f"product-images/{object_name}"
    )

    async with httpx.AsyncClient(timeout=40) as client:
        response = await client.post(
            upload_url,
            headers=headers,
            content=data,
        )

    if not response.is_success:
        print(
            "Supabase image upload error:",
            response.status_code,
            response.text
        )

        raise HTTPException(
            502,
            "Rasmni Supabase Storage'ga yuklab bo'lmadi"
        )

    public_url = (
        f"{SUPABASE_URL}/storage/v1/object/public/"
        f"product-images/{object_name}"
    )

    return {
        "ok": True,
        "url": public_url,
        "path": object_name,
    }


# =========================================================
# ADMIN PRODUCTS
# =========================================================

@app.get("/api/admin/products")
async def admin_products(
    x_admin_key: str = Header(default="")
):
    require_admin(
        x_admin_key
    )

    ensure_supabase_write()

    async with httpx.AsyncClient(
        timeout=20
    ) as client:

        response = await client.get(
            f"{SUPABASE_URL}/rest/v1/products",
            headers=write_headers(),
            params={
                "select": "*",
                "order": "id.desc",
            },
        )

        response.raise_for_status()

        return response.json()


@app.post("/api/admin/products")
async def admin_add_product(
    product: AdminProduct,
    x_admin_key: str = Header(default="")
):
    require_admin(
        x_admin_key
    )

    ensure_supabase_write()

    description_uz = (
        product.description_uz
        or product.description
        or ""
    ).strip()

    description_ru = (
        product.description_ru
        or ""
    ).strip()

    payload = {
        "name": product.name.strip(),
        "price": product.price,
        "category": product.category.strip(),
        "description": description_uz,
        "description_uz": description_uz,
        "description_ru": description_ru,
        "images": product.images,
        "sizes": product.sizes,
        "colors": product.colors,
        "active": product.active,
    }

    # Faqat eski/manual kod yuborilgan bo'lsa ishlatamiz.
    # Yangi mahsulotlarda code bo'sh qoladi va Supabase yaratadi.
    manual_code = product.code.strip()

    if manual_code:
        payload["code"] = manual_code

    async with httpx.AsyncClient(
        timeout=20
    ) as client:

        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/products",
            headers=write_headers(
                representation=True
            ),
            json=payload,
        )

        response.raise_for_status()

        rows = response.json()

    return {
        "ok": True,
        "product": (
            rows[0]
            if rows
            else payload
        ),
    }


@app.put("/api/admin/products/{code}")
async def admin_update_product(
    code: str,
    product: AdminProduct,
    x_admin_key: str = Header(default="")
):
    require_admin(
        x_admin_key
    )

    ensure_supabase_write()

    description_uz = (
        product.description_uz
        or product.description
        or ""
    ).strip()

    description_ru = (
        product.description_ru
        or ""
    ).strip()

    payload = {
        "code": code,
        "name": product.name.strip(),
        "price": product.price,
        "category": product.category.strip(),
        "description": description_uz,
        "description_uz": description_uz,
        "description_ru": description_ru,
        "images": product.images,
        "sizes": product.sizes,
        "colors": product.colors,
        "active": product.active,
    }

    async with httpx.AsyncClient(
        timeout=20
    ) as client:

        response = await client.patch(
            f"{SUPABASE_URL}/rest/v1/products",
            headers=write_headers(
                representation=True
            ),
            params={
                "code": f"eq.{code}"
            },
            json=payload,
        )

        response.raise_for_status()

        rows = response.json()

    if not rows:
        raise HTTPException(
            404,
            "Product not found"
        )

    return {
        "ok": True,
        "product": rows[0],
    }


@app.delete("/api/admin/products/{code}")
async def admin_delete_product(
    code: str,
    x_admin_key: str = Header(default="")
):
    require_admin(
        x_admin_key
    )

    ensure_supabase_write()

    async with httpx.AsyncClient(
        timeout=20
    ) as client:

        response = await client.patch(
            f"{SUPABASE_URL}/rest/v1/products",
            headers=write_headers(
                representation=True
            ),
            params={
                "code": f"eq.{code}"
            },
            json={
                "active": False
            },
        )

        response.raise_for_status()

        rows = response.json()

    if not rows:
        raise HTTPException(
            404,
            "Product not found"
        )

    return {
        "ok": True,
        "hidden": True,
        "code": code,
    }


# =========================================================
# ADMIN ORDERS
# =========================================================

@app.get("/api/admin/orders")
async def admin_orders(
    x_admin_key: str = Header(default="")
):
    require_admin(
        x_admin_key
    )

    ensure_supabase_write()

    async with httpx.AsyncClient(
        timeout=20
    ) as client:

        response = await client.get(
            f"{SUPABASE_URL}/rest/v1/orders",
            headers=write_headers(),
            params={
                "select": "*",
                "order": "created_at.desc",
            },
        )

        response.raise_for_status()

        return response.json()


@app.patch("/api/admin/orders/{order_code}")
async def admin_update_order(
    order_code: str,
    update: OrderStatusUpdate,
    x_admin_key: str = Header(default="")
):
    require_admin(
        x_admin_key
    )

    ensure_supabase_write()

    allowed_order_status = {
        "new",
        "waiting_payment",
        "paid",
        "processing",
        "shipped",
        "completed",
        "cancelled",
    }

    allowed_payment_status = {
        "pending",
        "paid",
        "failed",
        "cancelled",
        "refunded",
    }

    payload = {}

    if update.order_status is not None:
        if (
            update.order_status
            not in allowed_order_status
        ):
            raise HTTPException(
                400,
                "Invalid order status"
            )

        payload[
            "order_status"
        ] = update.order_status

    if update.payment_status is not None:
        if (
            update.payment_status
            not in allowed_payment_status
        ):
            raise HTTPException(
                400,
                "Invalid payment status"
            )

        payload[
            "payment_status"
        ] = update.payment_status

        if (
            update.payment_status == "paid"
            and update.order_status is None
        ):
            payload[
                "order_status"
            ] = "paid"

    if not payload:
        raise HTTPException(
            400,
            "Nothing to update"
        )

    async with httpx.AsyncClient(
        timeout=20
    ) as client:

        response = await client.patch(
            f"{SUPABASE_URL}/rest/v1/orders",
            headers=write_headers(
                representation=True
            ),
            params={
                "order_code":
                    f"eq.{order_code}"
            },
            json=payload,
        )

        response.raise_for_status()

        rows = response.json()

    if not rows:
        raise HTTPException(
            404,
            "Order not found"
        )

    return {
        "ok": True,
        "order": rows[0],
    }
