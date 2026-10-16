"""Security and price rules shared by V7 endpoints."""

import hashlib, hmac, json, time, warnings
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
from urllib.parse import parse_qsl
from datetime import datetime, timezone
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException

MAX_RECEIPT_BYTES = 5 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 16_000_000


def telegram_user(raw, token, now=None):
    if not token or not raw:
        raise HTTPException(401, "Telegram authorization required")
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True)
        if len(pairs) != len(dict(pairs)):
            raise ValueError()
        data = dict(pairs)
        signature = data.pop("hash")
        check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
        key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
        expected = hmac.new(key, check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise ValueError()
        age = (time.time() if now is None else now) - int(data["auth_date"])
        if not -30 <= age <= 3600:
            raise ValueError()
        user = json.loads(data["user"])
        if (
            not isinstance(user, dict)
            or type(user.get("id")) is not int
            or user["id"] <= 0
        ):
            raise ValueError()
        return user
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, "Invalid or expired Telegram data")


def amount(value):
    try:
        result = Decimal(str(value))
        if not result.is_finite() or result < 0 or result > 999999999:
            raise ValueError()
        return result.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    except (ValueError, InvalidOperation):
        raise HTTPException(400, "Invalid price")


def sale_price(row, now=None):
    original = amount(row.get("price") or 0)
    discount = row.get("sale_price")
    result = {
        "original_price": float(original),
        "price": float(original),
        "is_sale": False,
        "discount_percent": 0,
    }
    if discount is None:
        return result
    discounted = amount(discount)
    if not 0 < discounted < original:
        raise HTTPException(400, "Sale price must be below original price")

    def dt(v):
        if not v:
            return None
        try:
            d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
            if d.tzinfo is None:
                raise ValueError()
            return d
        except ValueError:
            raise HTTPException(400, "Dates must include timezone")

    start, end = dt(row.get("sale_start")), dt(row.get("sale_end"))
    if start and end and end <= start:
        raise HTTPException(400, "Invalid sale date range")
    current = now or datetime.now(timezone.utc)
    if (not start or current >= start) and (not end or current < end):
        result.update(
            price=float(discounted),
            is_sale=True,
            discount_percent=int((original - discounted) * 100 / original),
        )
    return result


def clean_receipt(data, content_type):
    expected = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
    if content_type not in expected or not data or len(data) > MAX_RECEIPT_BYTES:
        raise HTTPException(400, "JPEG, PNG, WebP; maximum 5 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as im:
                if (
                    im.format != expected[content_type]
                    or getattr(im, "n_frames", 1) != 1
                ):
                    raise ValueError()
                im.verify()
            with Image.open(BytesIO(data)) as im:
                im.load()
                output = BytesIO()
                oriented = ImageOps.exif_transpose(im).convert("RGBA")
                flattened = Image.new("RGB", oriented.size, "white")
                flattened.paste(oriented, mask=oriented.getchannel("A"))
                flattened.save(output, "JPEG", quality=92)
                result = output.getvalue()
                if len(result) > MAX_RECEIPT_BYTES:
                    raise ValueError()
                return result
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise HTTPException(400, "Invalid or oversized image content")


def token_hash(token):
    if not token or len(token) < 43 or len(token) > 128:
        raise HTTPException(401, "Order access token required")
    return hashlib.sha256(token.encode()).hexdigest()
