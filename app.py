import os, json, hmac, hashlib, secrets, uuid, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl

import httpx
from dotenv import load_dotenv
from environment import validate_environment
from v7_security import telegram_user, sale_price, manual_uzs, clean_receipt, MAX_RECEIPT_BYTES
from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv()
ENVIRONMENT = validate_environment(os.environ)
BASE = Path(__file__).resolve().parent
BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "").strip()
ADMIN_KEY = (os.getenv("ADMIN_API_KEY") or os.getenv("ADMIN_KEY") or "").strip()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
SUPABASE_SERVICE_KEY = (os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY") or "").strip()

app = FastAPI(title="BURANDO V7", docs_url=None, redoc_url=None, openapi_url=None)
from web_security import install as install_security
install_security(app, ENVIRONMENT)
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
    prices = sale_price(row)
    prices.update(manual_uzs(row, prices['is_sale']))
    images = [str(x) for x in as_list(row.get("images")) if str(x).strip()]
    sizes = [str(x) for x in as_list(row.get("sizes")) if str(x).strip()]
    colors = [str(x) for x in as_list(row.get("colors")) if str(x).strip()]
    color_images = row.get("color_images") or {}
    color_images = {c: url for c, url in color_images.items() if c in colors and url in images} if isinstance(color_images, dict) else {}
    code = str(row.get("code") or row.get("id") or "")
    name = str(row.get("name") or code)
    description = str(row.get("description") or "")
    description_uz = str(row.get("description_uz") or description)
    description_ru = str(row.get("description_ru") or description)
    brand = str(row.get("brand") or "").strip()
    if not brand and "uniqlo" in f"{name} {description} {' '.join(images)}".lower(): brand = "UNIQLO"
    return {"id":code,"title_uz":name,"title_ru":str(row.get("name_ru") or name),**prices,"category":category_slug(row.get("category")),"brand":brand,"image":images[0] if images else "","images":images,"color_images":color_images,"desc_uz":description_uz,"desc_ru":description_ru,"sizes":sizes,"colors_uz":colors,"colors_ru":colors,"badge_uz":"Original Japan","badge_ru":"Original Japan","active":bool(row.get("active", True)),"variants":row.get("variants"),"external_source":row.get("external_source"),"last_synced_at":row.get("last_synced_at")}


def sb_headers(write=False, prefer=""):
    key = SUPABASE_SERVICE_KEY if write else SUPABASE_KEY
    h = {"apikey": key, "Accept":"application/json", "Content-Type":"application/json"}
    if not key.startswith(("sb_publishable_", "sb_secret_")): h["Authorization"] = f"Bearer {key}"
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
        raise HTTPException(503,"Catalog temporarily unavailable") from None


class Item(BaseModel):
    id: str; title: str = ""; qty: int = Field(ge=1, le=99); price: float = Field(ge=0); size: str = ""; color: str = ""; price_uzs: float | None = Field(default=None, ge=0, le=999999999999.99)

def validate(init_data: str):
    return telegram_user(init_data, BOT_TOKEN)


def require_db():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY: raise HTTPException(500,"Supabase write key is not configured")


def order_code():
    return f"BR-{datetime.now(timezone.utc).strftime('%y%m%d')}-{secrets.token_hex(4).upper()}"


@app.get("/")
@app.get("/shop", include_in_schema=False)
async def home(): return FileResponse(BASE / "static/index.html")

@app.get("/api/products")
async def get_products(): return await load_products()


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
    for o in orders:
        for key in ('lookup_token_hash','request_hash','idempotency_key','receipt_path'): o.pop(key,None)
    return orders


# ========================= BURANDO ADMIN =========================
class AdminProduct(BaseModel):
    code: str = ""
    name: str = Field(min_length=1, max_length=300)
    price: float = Field(ge=0)
    price_uzs: float | None = Field(default=None, ge=0, le=999999999999.99)
    sale_price_uzs: float | None = Field(default=None, gt=0, le=999999999999.99)
    category: str = "accessories"
    description: str = ""
    description_uz: str = ""
    description_ru: str = ""
    images: list[str] = []
    sizes: list[str] = []
    colors: list[str] = []
    color_images: dict[str, str] | None = None
    active: bool = True
    sale_price: float | None = Field(default=None, gt=0)
    sale_start: datetime | None = None
    sale_end: datetime | None = None

def require_admin_key(key: str):
    if not ADMIN_KEY: raise HTTPException(503, "ADMIN_API_KEY is not configured")
    if not hmac.compare_digest(key, ADMIN_KEY): raise HTTPException(401, "Admin authorization required")
    require_db()

@app.get("/admin")
async def admin_page():
    return FileResponse(BASE / "static/admin.html")

@app.post("/api/admin/upload")
async def admin_upload_image(file: UploadFile = File(...), x_admin_key: str = Header(default="")):
    require_admin_key(x_admin_key)
    content_type="image/jpeg"
    data=clean_receipt(await file.read(MAX_RECEIPT_BYTES+1),(file.content_type or "").lower())
    object_name=f"admin/{datetime.now(timezone.utc).strftime('%Y/%m/%d')}/{uuid.uuid4().hex}.jpg"
    headers={**sb_headers(True),"Content-Type":content_type,"x-upsert":"false"}
    async with httpx.AsyncClient(timeout=40) as client:
        r=await client.post(f"{SUPABASE_URL}/storage/v1/object/product-images/{object_name}",headers=headers,content=data)
    if not r.is_success:
        print("Supabase image upload error:",r.status_code,r.text); raise HTTPException(502,"Rasmni Supabase Storage'ga yuklab bo‘lmadi")
    return {"ok":True,"url":f"{SUPABASE_URL}/storage/v1/object/public/product-images/{object_name}","path":object_name}

@app.get("/api/admin/products")
async def admin_products(x_admin_key: str = Header(default="")):
    require_admin_key(x_admin_key)
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.get(f"{SUPABASE_URL}/rest/v1/products",headers=sb_headers(True),params={"select":"*","order":"id.desc"})
    if not r.is_success: raise HTTPException(502,"Mahsulotlarni olishda xato")
    return r.json()

def admin_product_payload(p: AdminProduct, include_code=True):
    uz=(p.description_uz or p.description).strip(); ru=p.description_ru.strip()
    data={"name":p.name.strip(),"price":p.price,"category":p.category.strip(),"description":uz,"description_uz":uz,"description_ru":ru,"images":p.images,"sizes":p.sizes,"colors":p.colors,"active":p.active}
    if p.color_images is not None:
        if len(p.color_images) > 100 or any(c not in p.colors or url not in p.images or not url.startswith('https://') for c, url in p.color_images.items()):
            raise HTTPException(400, "Rang rasmi mahsulot galereyasidan tanlanishi kerak")
        data['color_images'] = p.color_images
    sale_price({"price": p.price, "sale_price": p.sale_price, "sale_start": p.sale_start, "sale_end": p.sale_end})
    # Catalog prices are USD; UZS and instalments are frozen per checkout quote.
    data.update(price_uzs=None, sale_price_uzs=None)
    data.update(sale_price=p.sale_price, sale_start=p.sale_start.isoformat() if p.sale_start else None, sale_end=p.sale_end.isoformat() if p.sale_end else None)
    if include_code and p.code.strip(): data["code"]=p.code.strip()
    return data

@app.post("/api/admin/products")
async def admin_add_product(product: AdminProduct, x_admin_key: str = Header(default="")):
    require_admin_key(x_admin_key); payload=admin_product_payload(product,True)
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.post(f"{SUPABASE_URL}/rest/v1/products",headers=sb_headers(True,"return=representation"),json=payload)
    if not r.is_success:
        print("Admin product insert error:",r.status_code,r.text); raise HTTPException(502,"Mahsulotni saqlashda xato")
    rows=r.json(); return {"ok":True,"product":rows[0] if rows else payload}

@app.put("/api/admin/products/{code}")
async def admin_update_product(code: str, product: AdminProduct, x_admin_key: str = Header(default="")):
    require_admin_key(x_admin_key); payload=admin_product_payload(product,False)
    if 'price_uzs' not in product.model_fields_set: payload.pop('price_uzs',None)
    if 'sale_price_uzs' not in product.model_fields_set: payload.pop('sale_price_uzs',None)
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.patch(f"{SUPABASE_URL}/rest/v1/products",headers=sb_headers(True,"return=representation"),params={"code":f"eq.{code}"},json=payload)
    if not r.is_success: raise HTTPException(502,"Mahsulotni yangilashda xato")
    rows=r.json()
    if not rows: raise HTTPException(404,"Product not found")
    return {"ok":True,"product":rows[0]}

@app.delete("/api/admin/products/{code}")
async def admin_delete_product(code: str, x_admin_key: str = Header(default="")):
    require_admin_key(x_admin_key)
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.patch(f"{SUPABASE_URL}/rest/v1/products",headers=sb_headers(True,"return=representation"),params={"code":f"eq.{code}"},json={"active":False})
    if not r.is_success: raise HTTPException(502,"Mahsulotni yashirishda xato")
    rows=r.json()
    if not rows: raise HTTPException(404,"Product not found")
    return {"ok":True,"hidden":True,"code":code}

@app.get("/api/admin/orders")
async def admin_orders(x_admin_key: str = Header(default="")):
    require_admin_key(x_admin_key)
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.get(f"{SUPABASE_URL}/rest/v1/orders",headers=sb_headers(True),params={"select":"*","order":"created_at.desc"})
        if not r.is_success: raise HTTPException(502,"Buyurtmalarni olishda xato")
        orders=r.json()
        if orders:
            ids=",".join(str(o["id"]) for o in orders)
            ir=await client.get(f"{SUPABASE_URL}/rest/v1/order_items",headers=sb_headers(True),params={"select":"*","order_id":f"in.({ids})","order":"id.asc"})
            items=ir.json() if ir.is_success else []
        else: items=[]
    by={}
    for item in items: by.setdefault(item.get("order_id"),[]).append(item)
    for order in orders: order["items"]=by.get(order.get("id"),[])
    return orders


from v7_api import install as install_v7
install_v7(app, sys.modules[__name__])

from notifications import install as install_notifications
install_notifications(app, sys.modules[__name__])

from image_search import install as install_image_search
install_image_search(app, sys.modules[__name__])

from entry_menu import install as install_entry_menu
install_entry_menu(app, sys.modules[__name__])

from uniqlo_sync import install as install_uniqlo
install_uniqlo(app, sys.modules[__name__])
