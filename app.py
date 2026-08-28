import os
import json
import hmac
import hashlib
from html import escape
from pathlib import Path
from urllib.parse import parse_qsl

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv()
BASE = Path(__file__).resolve().parent
BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "").strip()
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

app = FastAPI(title="BURANDO Mini App V5")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


def load_products():
    return json.loads((BASE / "data/products.json").read_text(encoding="utf-8"))


class Item(BaseModel):
    id: str
    title: str = ""
    qty: int = Field(ge=1, le=99)
    price: float = Field(ge=0)
    size: str = ""
    color: str = ""


class Order(BaseModel):
    customer_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=5, max_length=50)
    address: str = Field(min_length=3, max_length=300)
    comment: str = Field(default="", max_length=500)
    items: list[Item]
    total: float
    init_data: str = ""


def validate(init_data: str):
    if DEV_MODE and not init_data:
        return
    if not BOT_TOKEN or not init_data:
        raise HTTPException(401, "Telegram authorization required")

    data = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = data.pop("hash", None)
    if not received_hash:
        raise HTTPException(401, "Invalid Telegram data")

    check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise HTTPException(401, "Invalid Telegram data")


@app.get("/")
async def home():
    return FileResponse(BASE / "static/index.html")


@app.get("/api/products")
async def get_products():
    return load_products()


@app.post("/api/order")
async def create_order(order: Order):
    validate(order.init_data)
    if not order.items:
        raise HTTPException(400, "Cart is empty")

    catalog = {p["id"]: p for p in load_products()}
    normalized_items = []
    total = 0.0

    for item in order.items:
        product = catalog.get(item.id)
        if not product:
            raise HTTPException(400, f"Unknown product: {item.id}")

        price = float(product["price"])
        if abs(price - item.price) > 0.01:
            raise HTTPException(400, "Invalid product price")

        line_total = round(price * item.qty, 2)
        total += line_total
        normalized_items.append((item, product, price, line_total))

    total = round(total, 2)
    if abs(total - order.total) > 0.02:
        raise HTTPException(400, "Invalid total")

    lines = [
        "🛍 <b>YANGI BURANDO BUYURTMA</b>",
        "",
        f"👤 <b>Mijoz:</b> {escape(order.customer_name)}",
        f"📞 <b>Telefon:</b> {escape(order.phone)}",
        f"📍 <b>Manzil:</b> {escape(order.address)}",
    ]

    if order.comment.strip():
        lines.append(f"💬 <b>Izoh:</b> {escape(order.comment.strip())}")

    lines += ["", "📦 <b>Mahsulotlar:</b>"]

    for item, product, price, line_total in normalized_items:
        product_title = item.title.strip() or product.get("title_uz") or product["id"]
        details = []
        if item.size:
            details.append(f"O‘lcham: {escape(item.size)}")
        if item.color:
            details.append(f"Rang: {escape(item.color)}")
        detail_text = f" ({', '.join(details)})" if details else ""
        lines.append(
            f"• {escape(product_title)}{detail_text} × {item.qty} — ${line_total:.2f}"
        )

    lines += ["", f"💵 <b>Jami:</b> ${total:.2f}"]

    if BOT_TOKEN and ADMIN_CHAT_ID:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                json={
                    "chat_id": ADMIN_CHAT_ID,
                    "text": "\n".join(lines),
                    "parse_mode": "HTML",
                },
            )
            if not response.is_success:
                raise HTTPException(502, "Telegram send error")
    elif DEV_MODE:
        print("\n".join(lines))
    else:
        raise HTTPException(500, "Bot is not configured")

    return {"ok": True, "total": total}
