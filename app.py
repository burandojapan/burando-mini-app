import os, json, hmac, hashlib, secrets
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import parse_qsl

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv()
BASE = Path(__file__).resolve().parent
BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "").strip()
ADMIN_KEY = os.getenv("ADMIN_KEY", "").strip()
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", SUPABASE_KEY).strip()

app = FastAPI(title="BURANDO Mini App V6 Orders")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


def load_local_products():
    return json.loads((BASE / "data/products.json").read_text(encoding="utf-8"))


def as_list(value):
    if value is None: return []
    if isinstance(value, list): return value
    if isinstance(value, str):
        value = value.strip()
        if not value: return []
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else [str(parsed)]
        except Exception: return [value]
    return [value]


def category_slug(value):
    value = (value or "").strip().lower()
    aliases = {"oyoq kiyim":"shoes","shoes":"shoes","soat":"watches","watches":"watches","kiyim":"clothes","clothes":"clothes","kosmetika":"beauty","beauty":"beauty","aksessuar":"accessories","aksessuarlar":"accessories","accessories":"accessories"}
    return aliases.get(value, value or "accessories")


def normalize_product(row):
    images = [str(x) for x in as_list(row.get("images")) if str(x).strip()]
    sizes = [str(x) for x in as_list(row.get("sizes")) if str(x).strip()]
    colors = [str(x) for x in as_list(row.get("colors")) if str(x).strip()]
    code = str(row.get("code") or row.get("id") or "")
    name = str(row.get("name") or code)
    description = str(row.get("description") or "")
    description_uz = str(row.get("description_uz") or description)
    description_ru = str(row.get("description_ru") or description)
    return {"id":code,"title_uz":name,"title_ru":name,"price":float(row.get("price") or 0),"category":category_slug(row.get("category")),"brand":str(row.get("brand") or ""),"image":images[0] if images else "","images":images,"desc_uz":description_uz,"desc_ru":description_ru,"sizes":sizes,"colors_uz":colors,"colors_ru":colors,"badge_uz":"Original Japan","badge_ru":"Original Japan","active":bool(row.get("active", True))}


def sb_headers(write=False, prefer=""):
    key = SUPABASE_SERVICE_KEY if write else SUPABASE_KEY
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Accept":"application/json", "Content-Type":"application/json"}
    if prefer: h["Prefer"] = prefer
    return h


async def load_products():
    if not SUPABASE_URL or not SUPABASE_KEY: return load_local_products()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(f"{SUPABASE_URL}/rest/v1/products", headers=sb_headers(), params={"select":"*","active":"eq.true","order":"id.desc"})
            response.raise_for_status(); rows = response.json()
        return [normalize_product(row) for row in rows]
    except Exception as exc:
        print(f"Supabase products error: {exc}"); return load_local_products()


class Item(BaseModel):
    id: str; title: str = ""; qty: int = Field(ge=1, le=99); price: float = Field(ge=0); size: str = ""; color: str = ""

class Order(BaseModel):
    customer_name: str = Field(min_length=2,max_length=100)
    phone: str = Field(min_length=5,max_length=50)
    backup_phone: str = Field(default="",max_length=50)
    address: str = Field(min_length=3,max_length=300)
    comment: str = Field(default="",max_length=500)
    items: list[Item]; total: float; init_data: str = ""


def validate(init_data: str):
    if DEV_MODE and not init_data:
        return {"id":"dev-user","username":"dev","first_name":"DEV"}
    if not BOT_TOKEN or not init_data: raise HTTPException(401,"Telegram authorization required")
    data = dict(parse_qsl(init_data, keep_blank_values=True)); received_hash = data.pop("hash",None)
    if not received_hash: raise HTTPException(401,"Invalid Telegram data")
    check_string = "\n".join(f"{k}={v}" for k,v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated_hash, received_hash): raise HTTPException(401,"Invalid Telegram data")
    try: return json.loads(data.get("user") or "{}")
    except Exception: return {}


def require_db():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY: raise HTTPException(500,"Supabase write key is not configured")


def order_code():
    return f"BR-{datetime.now(timezone.utc).strftime('%y%m%d')}-{secrets.token_hex(2).upper()}"


@app.get("/")
async def home(): return FileResponse(BASE / "static/index.html")

@app.get("/api/products")
async def get_products(): return await load_products()


async def telegram_order_notice(order_code_value, order, user, normalized_items, total):
    if not BOT_TOKEN or not ADMIN_CHAT_ID:
        if DEV_MODE: print(f"NEW ORDER {order_code_value} ${total:.2f}")
        return
    username = user.get("username") or ""
    tg_text = f"@{username}" if username else f"ID {user.get('id','-')}"
    summary = ["🛍 <b>YANGI BURANDO BUYURTMA</b>", f"🧾 <b>{escape(order_code_value)}</b>", "", f"👤 <b>Mijoz:</b> {escape(order.customer_name)}", f"📞 <b>Telefon:</b> {escape(order.phone)}", f"💬 <b>Telegram:</b> {escape(tg_text)}", f"📍 <b>Manzil:</b> {escape(order.address)}"]
    if order.backup_phone.strip(): summary.append(f"☎️ <b>Qo‘shimcha:</b> {escape(order.backup_phone.strip())}")
    if order.comment.strip(): summary.append(f"📝 <b>Izoh:</b> {escape(order.comment.strip())}")
    summary += ["", "📦 <b>Mahsulotlar:</b>"]
    for item, product, price, line_total in normalized_items:
        details = [x for x in [f"Razmer: {escape(item.size)}" if item.size else "", f"Rang: {escape(item.color)}" if item.color else ""] if x]
        summary.append(f"• <b>{escape(product['id'])}</b> — {escape(item.title.strip() or product.get('title_uz') or product['id'])} × {item.qty} — ${line_total:.2f}" + (f" ({', '.join(details)})" if details else ""))
    summary += ["", f"💵 <b>Jami:</b> ${total:.2f}", "💳 <b>To‘lov:</b> CLICK ulanmoqda / PENDING", "📍 <b>Status:</b> Buyurtma qabul qilindi"]
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", json={"chat_id":ADMIN_CHAT_ID,"text":"\n".join(summary),"parse_mode":"HTML"})
        if not r.is_success: print("Telegram summary error:", r.text)
        for item, product, _, _ in normalized_items:
            image = product.get("image")
            if not image: continue
            cap = f"📦 <b>{escape(order_code_value)}</b>\n🏷 <b>{escape(product['id'])}</b>\n{escape(item.title.strip() or product.get('title_uz') or product['id'])}\nRazmer: {escape(item.size or '-')} | Rang: {escape(item.color or '-')} | Soni: {item.qty}"
            rr = await client.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto", json={"chat_id":ADMIN_CHAT_ID,"photo":image,"caption":cap,"parse_mode":"HTML"})
            if not rr.is_success: print("Telegram photo error:", rr.text)


@app.post("/api/order")
async def create_order(order: Order):
    user = validate(order.init_data); require_db()
    if not order.items: raise HTTPException(400,"Cart is empty")
    products = await load_products(); catalog = {p["id"]:p for p in products}; normalized_items=[]; total=0.0
    for item in order.items:
        product = catalog.get(item.id)
        if not product: raise HTTPException(400,f"Unknown product: {item.id}")
        price=float(product["price"])
        if abs(price-item.price)>0.01: raise HTTPException(400,"Invalid product price")
        line_total=round(price*item.qty,2); total+=line_total; normalized_items.append((item,product,price,line_total))
    total=round(total,2)
    if abs(total-order.total)>0.02: raise HTTPException(400,"Invalid total")
    code=order_code(); tg_id=str(user.get("id") or ""); username=str(user.get("username") or "")
    order_payload={"order_code":code,"telegram_user_id":tg_id,"telegram_username":username,"customer_name":order.customer_name.strip(),"phone":order.phone.strip(),"backup_phone":order.backup_phone.strip(),"address":order.address.strip(),"comment":order.comment.strip(),"total":total,"currency":"USD","payment_method":"CLICK","payment_status":"pending","order_status":"received"}
    async with httpx.AsyncClient(timeout=25) as client:
        r=await client.post(f"{SUPABASE_URL}/rest/v1/orders",headers=sb_headers(True,"return=representation"),json=order_payload); r.raise_for_status(); saved=r.json()[0]; oid=saved["id"]
        rows=[]
        for item,product,price,line_total in normalized_items:
            rows.append({"order_id":oid,"product_code":product["id"],"title":item.title.strip() or product.get("title_uz") or product["id"],"image":product.get("image") or "","size":item.size,"color":item.color,"qty":item.qty,"unit_price":price,"line_total":line_total})
        ir=await client.post(f"{SUPABASE_URL}/rest/v1/order_items",headers=sb_headers(True,"return=minimal"),json=rows); ir.raise_for_status()
    await telegram_order_notice(code,order,user,normalized_items,total)
    return {"ok":True,"total":total,"order_code":code,"payment_status":"pending","order_status":"received"}


@app.get("/api/my-orders")
async def my_orders(init_data: str = ""):
    user=validate(init_data); require_db(); uid=str(user.get("id") or "")
    if not uid: raise HTTPException(401,"Telegram user not found")
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.get(f"{SUPABASE_URL}/rest/v1/orders",headers=sb_headers(True),params={"select":"*","telegram_user_id":f"eq.{uid}","order":"created_at.desc"}); r.raise_for_status(); orders=r.json()
        if not orders: return []
        ids=",".join(str(x["id"]) for x in orders)
        ir=await client.get(f"{SUPABASE_URL}/rest/v1/order_items",headers=sb_headers(True),params={"select":"*","order_id":f"in.({ids})","order":"id.asc"}); ir.raise_for_status(); items=ir.json()
    by={}
    for x in items: by.setdefault(x["order_id"],[]).append(x)
    for o in orders: o["items"]=by.get(o["id"],[])
    return orders


@app.patch("/api/admin/orders/{code}/status")
async def admin_status(code: str, payload: dict, x_admin_key: str = Header(default="")):
    if not ADMIN_KEY or not hmac.compare_digest(x_admin_key,ADMIN_KEY): raise HTTPException(401,"Admin authorization required")
    status=str(payload.get("status") or "").strip()
    allowed={"received","preparing_japan","shipped_japan","in_transit","arrived_uz","out_for_delivery","delivered","cancelled"}
    if status not in allowed: raise HTTPException(400,"Invalid status")
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.patch(f"{SUPABASE_URL}/rest/v1/orders",headers=sb_headers(True,"return=representation"),params={"order_code":f"eq.{code}"},json={"order_status":status,"updated_at":datetime.now(timezone.utc).isoformat()}); r.raise_for_status(); rows=r.json()
    if not rows: raise HTTPException(404,"Order not found")
    return {"ok":True,"order":rows[0]}
