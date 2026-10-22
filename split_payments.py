"""Signed, expiring FX quotes. Prices and both instalments freeze at order creation."""
import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP

import httpx
from fastapi import HTTPException

RATE_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/'


async def fetch_rate():
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(RATE_URL)
        response.raise_for_status()
        rows = response.json()
        row = next(x for x in rows if x['Ccy'] == 'USD')
        rate = Decimal(row['Rate']) / Decimal(row['Nominal'])
        date = datetime.strptime(row['Date'], '%d.%m.%Y').date()
        today = (datetime.now(timezone.utc) + timedelta(hours=5)).date()
        if not rate.is_finite() or not 1000 <= rate <= 100000 or not 0 <= (today-date).days <= 7:
            raise ValueError()
        return str(rate), date.isoformat()
    except (httpx.HTTPError, ValueError, KeyError, TypeError, StopIteration, ArithmeticError):
        raise HTTPException(503, 'Valyuta kursi olinmadi. Qayta urinib ko‘ring / Курс недоступен. Повторите попытку') from None


def cart_hash(items):
    cart = sorted([(i['product_code'], i['size'], i['color'], i['qty'], str(i['unit_price'])) for i in items])
    return hashlib.sha256(json.dumps(cart, separators=(',', ':')).encode()).hexdigest()


def sign_quote(secret, payload):
    if not secret:
        raise HTTPException(503, 'Checkout signing is unavailable')
    body = base64.urlsafe_b64encode(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).decode().rstrip('=')
    signature = hmac.new(secret.encode(), ('burando-fx-v1:'+body).encode(), hashlib.sha256).hexdigest()
    return body+'.'+signature


def read_quote(secret, token, items, total):
    try:
        body, signature = token.split('.')
        expected = hmac.new(secret.encode(), ('burando-fx-v1:'+body).encode(), hashlib.sha256).hexdigest()
        if not secret or not hmac.compare_digest(expected, signature):
            raise ValueError()
        quote = json.loads(base64.urlsafe_b64decode(body+'='*(-len(body)%4)))
        if quote['expires_at'] < time.time() or quote['cart_hash'] != cart_hash(items) or Decimal(quote['total_usd']) != total:
            raise ValueError()
        return quote
    except (ValueError, KeyError, TypeError, ArithmeticError):
        raise HTTPException(409, 'Hisob muddati tugagan yoki savat o‘zgargan. Hisobni yangilang / Обновите расчёт заказа') from None


async def make_quote(secret, items, total):
    rate, date = await fetch_rate()
    # Round once for the entire cart. Remainder subtraction keeps the two parts exact.
    total_uzs = (total*Decimal(rate)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    deposit = (total_uzs/2).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    if total_uzs <= 1:
        raise HTTPException(400, 'Order amount must be positive')
    payload = dict(cart_hash=cart_hash(items), total_usd=str(total), total_uzs=str(total_uzs),
                   deposit_uzs=str(deposit), balance_uzs=str(total_uzs-deposit),
                   exchange_rate=rate, exchange_date=date, exchange_source='CBU', expires_at=int(time.time())+900)
    return {**payload, 'quote_token': sign_quote(secret, payload)}


def payment_summary(order):
    if order.get('payment_plan') != 'split_50':
        return {}
    phase = order.get('payment_phase', 'deposit')
    return {k: order.get(k) for k in (
        'payment_plan', 'payment_phase', 'exchange_rate', 'exchange_date', 'exchange_source',
        'deposit_uzs', 'balance_uzs', 'deposit_paid_at', 'balance_paid_at') } | {
        'amount_due_uzs': 0 if order['payment_status'] in ('paid', 'deposit_paid') else order.get('deposit_uzs' if phase == 'deposit' else 'balance_uzs'),
        'balance_available': bool(order.get('deposit_paid_at')) and order['order_status'] in ('arrived_uz','out_for_delivery','delivered'),
    }
