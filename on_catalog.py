"""Review-only On Japan import planner. Never fetches sites or writes a database.

Input must come from a permitted, complete official feed/export. Each record is
one gender/color SKU, with its own available sizes; no cross-color size merging.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import urlsplit
import re


class InvalidCatalog(ValueError):
    pass


def positive(value):
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number <= 0:
            raise InvalidCatalog("Expected a positive finite amount")
        return number
    except (InvalidOperation, TypeError):
        raise InvalidCatalog("Invalid amount") from None


def fresh(value, now, max_age):
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if stamp.tzinfo is None or not timedelta(0) <= now - stamp <= max_age:
            raise ValueError()
        return stamp
    except (ValueError, TypeError, AttributeError):
        raise InvalidCatalog("Missing, future or stale source timestamp") from None


def official_url(value, sku):
    try:
        url = urlsplit(value)
        return (url.scheme == "https" and url.netloc == "www.on.com"
                and url.path.startswith(("/en-jp/products/", "/ja-jp/products/"))
                and url.path.upper().endswith("-" + sku))
    except (ValueError, TypeError):
        return False


def image_url(value):
    try:
        url = urlsplit(value)
        return url.scheme == "https" and url.netloc == "images.ctfassets.net" and bool(url.path.strip("/"))
    except (ValueError, TypeError):
        return False


def selling_price(current_jpy, jpy_per_usd, previous=None):
    """Use current (possibly discounted) price; keep changes below $10 frozen."""
    candidate = (positive(current_jpy) / positive(jpy_per_usd) + Decimal("50")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)
    if previous is not None and abs(candidate - positive(previous)) < Decimal("10"):
        return positive(previous).quantize(Decimal("0.01"))
    return candidate


def plan_import(snapshot, existing, *, now=None):
    now = now or datetime.now(timezone.utc)
    if snapshot.get("source") != "on-japan" or snapshot.get("complete") is not True:
        raise InvalidCatalog("A complete official On Japan export is required")
    fresh(snapshot.get("fetched_at"), now, timedelta(hours=24))
    fx = snapshot.get("fx", {})
    fresh(fx.get("observed_at"), now, timedelta(days=7))
    rate = positive(fx.get("jpy_per_usd"))
    if not 10 <= rate <= 1000 or not str(fx.get("source", "")).startswith("https://"):
        raise InvalidCatalog("Missing or implausible JPY/USD rate provenance")
    records = snapshot.get("products")
    if not isinstance(records, list) or not records or len(records) != snapshot.get("expected_records"):
        raise InvalidCatalog("Incomplete product export")
    by_code = {row["code"]: row for row in existing}
    seen, changes, blocked = set(), [], []
    for row in records:
        sku = row.get("sku", "")
        if not isinstance(sku, str) or not re.fullmatch(r"[A-Z0-9]{6,32}", sku) or sku in seen:
            raise InvalidCatalog("Missing or duplicate SKU")
        seen.add(sku)
        if not official_url(row.get("url"), sku) or row.get("currency") != "JPY" or row.get("complete") is not True:
            raise InvalidCatalog("Invalid source, currency or incomplete variant")
        fresh(row.get("checked_at"), now, timedelta(hours=24))
        current = positive(row.get("current_price_jpy"))
        original = positive(row.get("original_price_jpy", current))
        if current > original:
            raise InvalidCatalog("Current price exceeds original price")
        sizes = row.get("available_sizes_jp")
        images = row.get("images")
        if (not isinstance(sizes, list) or len(sizes) != len(set(map(str, sizes)))
                or any(not re.fullmatch(r"\d{1,2}(?:\.\d)?", str(size)) or not 10 <= positive(size) <= 40 for size in sizes)
                or not isinstance(images, list) or not 1 <= len(images) <= 30
                or not all(image_url(url) for url in images)):
            raise InvalidCatalog("Invalid available sizes or official images")
        name, gender, color = row.get("name"), row.get("gender"), row.get("color")
        if (not isinstance(name, str) or not name.strip() or len(name) > 200
                or gender not in ("men", "women", "unisex", "kids")
                or not isinstance(color, str) or not color.strip() or len(color) > 100):
            raise InvalidCatalog("Missing model, gender or color")
        code = "ON-JP-" + sku
        old = by_code.get(code)
        # Legacy products require an explicit SKU mapping, never a name-only match.
        legacy = [p["code"] for p in existing if not p["code"].startswith("ON-JP-")
                  and name.casefold() in str(p.get("name", "")).casefold()]
        if legacy:
            blocked.append({"sku": sku, "legacy_codes": legacy, "reason": "SKU mapping required"})
            continue
        if not sizes:
            if old and old.get("active", True):
                changes.append({"action": "update", "code": code, "expected": old,
                                "values": {"active": False}})
            continue
        price = selling_price(current, rate, old.get("price") if old else None)
        title_gender = {"men": "Men", "women": "Women", "unisex": "Unisex", "kids": "Kids"}[gender]
        values = dict(name=f"On {name.strip()} · {title_gender} · {color.strip()}",
                      price=str(price), category="shoes", images=images,
                      sizes=[str(size) for size in sizes], colors=[color.strip()], active=True,
                      description=f"On Running · Japan · SKU {sku}\n{row['url']}",
                      sale_price=None, sale_start=None, sale_end=None,
                      price_uzs=None, sale_price_uzs=None)
        if not old or any(old.get(key) != value for key, value in values.items() if key != "price") or positive(old["price"]) != price:
            changes.append({"action": "update" if old else "insert", "code": code,
                            "expected": old, "values": values,
                            "source": {"sku": sku, "current_price_jpy": str(current),
                                       "original_price_jpy": str(original), "url": row["url"],
                                       "checked_at": row["checked_at"]}})
    return {"review_only": True, "source_timestamp": snapshot["fetched_at"], "fx": fx,
            "changes": changes, "blocked": blocked,
            "note": "No database writes. Missing SKUs do not deactivate existing products."}
