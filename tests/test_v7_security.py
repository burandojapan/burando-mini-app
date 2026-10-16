import hashlib, hmac, json, time, unittest
from io import BytesIO
from datetime import datetime, timezone, timedelta
from PIL import Image
from fastapi import HTTPException
from v7_security import telegram_user, clean_receipt, sale_price, token_hash, amount


def signed(user=None, age=0, token="test-bot"):
    data = {
        "auth_date": str(int(time.time()) - age),
        "user": json.dumps(user or {"id": 42, "username": "demo_user"}),
    }
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    from urllib.parse import urlencode

    return urlencode(data)


class SecurityTests(unittest.TestCase):
    def test_telegram_valid_signature(self):
        self.assertEqual(telegram_user(signed(), "test-bot")["id"], 42)

    def test_telegram_tampered_expired_future_missing_and_duplicate(self):
        for raw in [
            signed(age=7200),
            signed(age=-120),
            signed(user={"id": "42"}),
            signed() + "&auth_date=1",
            "user={}",
            signed(token="wrong"),
        ]:
            with self.subTest(raw=raw), self.assertRaises(HTTPException):
                telegram_user(raw, "test-bot")

    def test_receipt_formats_reencoded_and_metadata_removed(self):
        for fmt, mime in [
            ("JPEG", "image/jpeg"),
            ("PNG", "image/png"),
            ("WEBP", "image/webp"),
        ]:
            stream = BytesIO()
            Image.new("RGB", (20, 20), "white").save(stream, fmt)
            data = clean_receipt(stream.getvalue(), mime)
            self.assertEqual(Image.open(BytesIO(data)).format, "JPEG")

    def test_invalid_receipts(self):
        stream = BytesIO()
        Image.new("RGB", (20, 20)).save(stream, "PNG")
        for content, mime in [
            (b"<svg>script</svg>", "image/png"),
            (stream.getvalue(), "image/jpeg"),
            (b"x" * (5 * 1024 * 1024 + 1), "image/jpeg"),
            (b"", "image/png"),
            (stream.getvalue(), "image/gif"),
        ]:
            with self.subTest(mime=mime), self.assertRaises(HTTPException):
                clean_receipt(content, mime)

    def test_receipt_pixel_bomb(self):
        stream = BytesIO()
        Image.new("1", (4100, 4100)).save(stream, "PNG")
        with self.assertRaises(HTTPException):
            clean_receipt(stream.getvalue(), "image/png")

    def test_sale_schedule_and_expiry(self):
        now = datetime.now(timezone.utc)
        row = dict(
            price=200,
            sale_price=150,
            sale_start=now - timedelta(hours=1),
            sale_end=now + timedelta(hours=1),
        )
        self.assertEqual(sale_price(row, now)["discount_percent"], 25)
        self.assertFalse(sale_price(row, now + timedelta(hours=2))["is_sale"])

    def test_invalid_prices(self):
        for price in ["NaN", "Infinity", -1, "bad"]:
            with self.subTest(price=price), self.assertRaises(HTTPException):
                amount(price)
        for row in [
            dict(price=10, sale_price=20),
            dict(price=10, sale_price=0),
            dict(price=10, sale_price=5, sale_start="2026-01-01"),
        ]:
            with self.assertRaises(HTTPException):
                sale_price(row)

    def test_tokens_and_money(self):
        with self.assertRaises(HTTPException):
            token_hash("short")
        self.assertEqual(str(amount("1.235")), "1.24")
        self.assertEqual(len(token_hash("x" * 64)), 64)
