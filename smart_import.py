"""BURANDO Smart Import: safe On Japan preview and pricing rules.

Preview only: never publishes or copies copyrighted media automatically.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import urlparse
import asyncio
import hmac
import os
import re

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
import httpx

MAX_HTML_BYTES = 2_000_000

router = APIRouter(prefix="/api/admin/smart-import", tags=["smart-import"])

class ImportRequest(BaseModel):
    url: str = Field(min_length=15, max_length=2048)
    usd_jpy: Decimal = Field(gt=0, le=1000)
    current_usd: Decimal | None = Field(default=None, ge=0, le=999999999)

def validate_on_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ("on.com", "www.on.com"):
        raise ValueError("Only official https://www.on.com product links are allowed")
    if parsed.username or parsed.password or parsed.port or parsed.fragment:
        raise ValueError("Invalid product URL")
    if not parsed.path.startswith("/ja-jp/products/"):
        raise ValueError("Use an On Japan product URL")
    if not re.fullmatch(r"/ja-jp/products/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*/?", parsed.path):
        raise ValueError("Invalid URL path")
    return "https://www.on.com" + parsed.path

def finite_amount(value, *, positive=False, maximum=Decimal("999999999")):
    if not value.is_finite() or value < 0 or value > maximum or (positive and value == 0):
        raise ValueError("Invalid price or rate")
    return value


def proposed_usd(jpy: Decimal, usd_jpy: Decimal) -> Decimal:
    finite_amount(jpy, positive=True)
    finite_amount(usd_jpy, positive=True, maximum=Decimal("1000"))
    try:
        result = (jpy / usd_jpy + Decimal("50")).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError("Invalid price or rate") from exc
    return finite_amount(result)


def stable_usd(jpy: Decimal, usd_jpy: Decimal, current: Decimal | None):
    candidate = proposed_usd(jpy, usd_jpy)
    if current is not None:
        finite_amount(current)
        if abs(candidate - current) <= Decimal("10"):
            return current, False
    return candidate, True


def require_preview_admin(x_admin_key: str = Header(default="")):
    admin_key = (os.getenv("ADMIN_API_KEY") or os.getenv("ADMIN_KEY") or "").strip()
    if not admin_key or not hmac.compare_digest(x_admin_key.encode(), admin_key.encode()):
        raise HTTPException(403, "Admin access required")


def install(app, environment, env=None):
    """Never register the preview in production, even when the flag is set."""
    config = os.environ if env is None else env
    if environment.name == "staging" and config.get("SMART_IMPORT_PREVIEW_ENABLED") == "true":
        app.include_router(router)


async def fetch_metadata(url):
    # Bound decoded bytes as well as elapsed time. Redirects remain forbidden.
    try:
        async with asyncio.timeout(15):
            async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
                async with client.stream("GET", url, headers={"User-Agent": "BURANDO-Import-Preview/1.0"}) as response:
                    response.raise_for_status()
                    if response.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "text/html":
                        raise HTTPException(422, "Product page is not HTML")
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(body) + len(chunk) > MAX_HTML_BYTES:
                            raise HTTPException(422, "Product page is too large")
                        body.extend(chunk)
                    return extract_metadata(body.decode(response.encoding or "utf-8", errors="replace"))
    except (httpx.HTTPError, TimeoutError):
        raise HTTPException(502, "Could not retrieve official product page") from None


def extract_metadata(html: str):
    """Only descriptive preview; no image downloading or speculative stock."""
    from html.parser import HTMLParser
    class MetaParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.meta = {}
        def handle_starttag(self, tag, attrs):
            if tag != "meta": return
            d = dict(attrs)
            key = d.get("property") or d.get("name")
            if key in ("og:title", "og:description", "og:image"):
                self.meta[key] = d.get("content", "")
    parser = MetaParser()
    parser.feed(html[:2_000_000])
    return parser.meta

@router.post("/preview", dependencies=[Depends(require_preview_admin)])
async def preview(req: ImportRequest):
    try:
        url = validate_on_url(req.url)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    metadata = await fetch_metadata(url)
    return {
        "source_url": url,
        "title": metadata.get("og:title", ""),
        "description_preview": metadata.get("og:description", ""),
        "image_reference": metadata.get("og:image", ""),
        "usd_jpy": str(req.usd_jpy),
        "current_usd": str(req.current_usd) if req.current_usd is not None else None,
        "status": "needs_verified_jpy_price_sizes_colors_and_media_permission",
        "note": "No product has been published. Stock, discount and price require verified official data."
    }

class PriceQuoteRequest(BaseModel):
    jpy_price: Decimal = Field(gt=0)
    usd_jpy: Decimal = Field(gt=0, le=1000)
    current_usd: Decimal | None = Field(default=None, ge=0)

@router.post("/price-quote", dependencies=[Depends(require_preview_admin)])
async def price_quote(req: PriceQuoteRequest):
    """Verified manual price input only. No write, no unverified price extraction."""
    try:
        candidate = proposed_usd(req.jpy_price, req.usd_jpy)
        effective, changed = stable_usd(req.jpy_price, req.usd_jpy, req.current_usd)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {
        "jpy_price": str(req.jpy_price),
        "usd_jpy": str(req.usd_jpy),
        "proposed_usd": str(candidate),
        "current_usd": str(req.current_usd) if req.current_usd is not None else None,
        "effective_usd": str(effective),
        "price_changed": changed,
        "threshold_usd": "10.00",
        "note": "Admin-verified JPY input. No product published."
    }
