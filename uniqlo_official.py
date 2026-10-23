"""Read-only diagnostics for the official public JP product page.

Adapted from the user's legacy bot: sitemap/URL discovery is separate from stock.
This module does not publish products, translate unverified content, send Telegram
messages, evaluate site JavaScript or guess variant availability from option lists.
"""
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser
import httpx

ORIGIN = 'https://www.uniqlo.com'
USER_AGENT = 'BurandoCatalogDiagnostics/1.0'
PRODUCT_PATH = re.compile(r'^/jp/ja/products/(E\d{6}-\d{3})/(\d{2})/?$')

class SourceUnavailable(ValueError):
    """The source response cannot safely be used as product evidence."""


def canonical_url(value):
    u = urlsplit(value)
    if (u.scheme != 'https' or u.hostname not in {'www.uniqlo.com', 'uniqlo.com'}
            or u.username or u.password or u.port not in {None, 443}):
        raise SourceUnavailable('UNIQLO Japan mahsulot havolasi kerak')
    m = PRODUCT_PATH.fullmatch(u.path)
    if not m:
        raise SourceUnavailable('Mahsulot havolasi /jp/ja/products/E123456-000/00 ko‘rinishida bo‘lsin')
    # Tracking/filter parameters never become request targets or inventory evidence.
    return urlunsplit(('https', 'www.uniqlo.com', u.path.rstrip('/'), '', ''))

class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inside = False
        self.current = []
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.inside = True
            self.current = []
    def handle_endtag(self, tag):
        if tag == 'script' and self.inside:
            self.scripts.append(''.join(self.current))
            self.inside = False
    def handle_data(self, data):
        if self.inside:
            self.current.append(data)


def snapshot(html, url, fetched_at=None):
    url = canonical_url(url)
    match = PRODUCT_PATH.fullmatch(urlsplit(url).path)
    style, price_group = match.groups()
    parser = Scripts()
    parser.feed(html)
    states = []
    for script in parser.scripts:
        marker = re.search(r'(?:^|\s)window\.__PRELOADED_STATE__\s*=\s*', script)
        if marker:
            try:
                data, _ = json.JSONDecoder().raw_decode(script[marker.end():])
                states.append(data)
            except (ValueError, RecursionError):
                raise SourceUnavailable('Sahifadagi tuzilmali ma’lumotni o‘qib bo‘lmadi') from None
    if len(states) != 1:
        raise SourceUnavailable('Aniq mahsulot holati topilmadi; bloklangan yoki o‘zgargan sahifa bo‘lishi mumkin')
    state = states[0]
    try:
        if state['fetchStatus']['PRODUCT/GET_PRODUCT']['status'] != 'loaded':
            raise KeyError()
        envelope = state['entity']['pdpEntity'][style + '-' + price_group]
        p = envelope['product']
        if p['productId'] != style or p['priceGroup'] != price_group or not p['name']:
            raise KeyError()
        prices = p['prices']
        base = prices['base']
        if base['currency']['code'] != 'JPY':
            raise KeyError()
        regular = Decimal(str(base['value']))
        if not regular.is_finite() or regular <= 0:
            raise KeyError()
        promo = prices.get('promo')
        discounted = None
        if promo is not None:
            if promo['currency']['code'] != 'JPY':
                raise KeyError()
            discounted = Decimal(str(promo['value']))
            if not discounted.is_finite() or not 0 < discounted < regular:
                raise KeyError()
        breadcrumbs = p['breadcrumbs']
        category = breadcrumbs['category']
        gender = breadcrumbs['gender']
        if not category['id'] or not category['name'] or not gender['id']:
            raise KeyError()
        colors = [dict(color_id=c['code'], display_code=c['displayCode'], name=c['name'])
                  for c in p['colors'] if c['display']['showFlag'] is True]
        sizes = [dict(size_id=s['code'], display_code=s['displayCode'], name=s['name'])
                 for s in p['sizes'] if s['display']['showFlag'] is True]
        if (not colors or not sizes or len({c['color_id'] for c in colors}) != len(colors)
                or len({s['size_id'] for s in sizes}) != len(sizes)):
            raise KeyError()
    except (KeyError, TypeError, InvalidOperation, AttributeError):
        raise SourceUnavailable('Mahsulot identifikatori, narxi yoki kategoriya ma’lumoti tasdiqlanmadi') from None
    return dict(
        status='review_required', ready_to_import=False,
        source='official_public_page', product_id=style, url=url,
        source_name=p['name'], regular_jpy=str(regular), discounted_jpy=str(discounted) if discounted is not None else None,
        category_metadata=dict(gender_id=gender['id'], gender=gender.get('name'), category_id=category['id'], category=category['name']),
        colors=colors, sizes=sizes, available_variants=None, inventory_verified=False,
        content_usage_verified=False, translations_verified=False,
        observed_at=(fetched_at or datetime.now(timezone.utc)).isoformat(),
        blockers=[
            'Rang–razmer kesimida ishonchli qoldiq manbasi kerak',
            'Rasm, tavsif va tarjimadan foydalanish ruxsati tasdiqlanishi kerak',
            'UZ/RU mahsulot matnlari tekshirilishi kerak',
            'Manba kategoriya IDsi BURANDO turkumiga moslanishi kerak',
        ],
    )

async def bounded_get(client, url, limit):
    async with client.stream('GET', url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/html,text/plain,application/xml'}) as r:
        if r.status_code != 200:
            raise SourceUnavailable('Manba javobi olinmadi (HTTP ' + str(r.status_code) + '); qayta yo‘naltirish yoki blok chetlab o‘tilmaydi')
        kind = r.headers.get('content-type', '').lower()
        if not any(t in kind for t in ('text/html', 'text/plain', 'application/xml', 'text/xml')):
            raise SourceUnavailable('Manba javob formati o‘zgargan')
        body = bytearray()
        async for part in r.aiter_bytes():
            body.extend(part)
            if len(body) > limit:
                raise SourceUnavailable('Manba javobi ruxsat etilgan hajmdan katta')
        return body.decode('utf-8', errors='strict')

async def inspect_url(url):
    url = canonical_url(url)
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            robots = await bounded_get(client, ORIGIN + '/robots.txt', 256_000)
            if not re.search(r'(?im)^user-agent\s*:', robots):
                raise SourceUnavailable('Robots qoidalari tasdiqlanmadi')
            rules = RobotFileParser()
            rules.parse(robots.splitlines())
            if not rules.can_fetch(USER_AGENT, url):
                raise SourceUnavailable('Manba robots qoidalari bu sahifani o‘qishga ruxsat bermaydi')
            html = await bounded_get(client, url, 5_000_000)
        return snapshot(html, url)
    except (httpx.HTTPError, UnicodeError):
        raise SourceUnavailable('Manba vaqtincha ochilmadi; mavjud katalog o‘zgarmadi') from None
