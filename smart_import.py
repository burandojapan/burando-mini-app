"""BURANDO Smart Import: safe On Japan preview and pricing rules.

Preview only: never publishes or copies copyrighted media automatically.
"""
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import urlparse
import ipaddress
import re

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
import httpx

router = APIRouter(prefix="/api/admin/smart-import", tags=["smart-import"])

class ImportRequest(BaseModel):
    url: str = Field(min_length=15, max_length=2048)
    usd_jpy: Decimal = Field(gt=0, le=1000)
    current_usd: Decimal | None = Field(default=None, ge=0)

def validate_on_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ("on.com", "www.on.com"):
        raise ValueError("Only official https://www.on.com product links are allowed")
    if parsed.username or parsed.password or parsed.port or parsed.fragment:
        raise ValueError("Invalid product URL")
    if not parsed.path.startswith("/ja-jp/products/"):
        raise ValueError("Use an On Japan product URL")
    if re.search(r"[%\\\\]", parsed.path):
        raise ValueError("Invalid URL path")
    return "https://www.on.com" + parsed.path

def proposed_usd(jpy: Decimal, usd_jpy: Decimal) -> Decimal:
    if jpy < 0 or usd_jpy <= 0:
        raise ValueError("Invalid price or rate")
    return (jpy / usd_jpy + Decimal("50")).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)

def stable_usd(jpy: Decimal, usd_jpy: Decimal, current: Decimal | None):
    candidate = proposed_usd(jpy, usd_jpy)
    if current is not None and abs(candidate - current) <= Decimal("10"):
        return current, False
    return candidate, True

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

@router.post("/preview")
async def preview(req: ImportRequest, x_admin_key: str = Header(default="")):
    # Imported lazily so the standalone pricing functions remain testable.
    import os
    import hmac
    admin_key = (os.getenv("ADMIN_API_KEY") or os.getenv("ADMIN_KEY") or "").strip()
    if not admin_key or not hmac.compare_digest(x_admin_key, admin_key):
        raise HTTPException(403, "Admin access required")
    try:
        url = validate_on_url(req.url)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    # Fixed trusted origin; redirects disabled to avoid SSRF.
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
            response = await client.get(url, headers={"User-Agent": "BURANDO-Import-Preview/1.0"})
            response.raise_for_status()
            if not response.headers.get("content-type", "").startswith("text/html"):
                raise HTTPException(422, "Product page is not HTML")
            metadata = extract_metadata(response.text)
    except httpx.HTTPError:
        raise HTTPException(502, "Could not retrieve official product page")
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
