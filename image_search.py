"""Bounded, local visual resemblance search. No model/brand recognition claims."""
import asyncio
import time
from collections import OrderedDict, defaultdict, deque
from io import BytesIO
from urllib.parse import urlsplit

import httpx
from fastapi import File, HTTPException, Request, UploadFile
from PIL import Image, ImageOps, ImageChops
from starlette.concurrency import run_in_threadpool
from v7_security import MAX_RECEIPT_BYTES, clean_receipt


def descriptor(data, content_type):
    clean = clean_receipt(data, content_type)
    with Image.open(BytesIO(clean)) as source:
        small=source.convert('RGB');small.thumbnail((256,256))
        mask=ImageChops.difference(small,Image.new('RGB',small.size,'white')).convert('L').point(lambda v:255 if v>25 else 0)
        bounds=mask.getbbox()
        if bounds and bounds[2]-bounds[0]>2 and bounds[3]-bounds[1]>2: small=small.crop(bounds)
        im = ImageOps.pad(small, (32, 32), color='white')
        spatial = tuple(v / 255 for v in im.resize((4, 4)).tobytes())
        hist = im.histogram()
        colors = tuple(sum(hist[channel*256+i:channel*256+i+32]) / 1024
                       for channel in range(3) for i in range(0,256,32))
        gray = list(im.convert('L').resize((9, 8)).tobytes())
        shape = tuple(gray[y*9+x] > gray[y*9+x+1] for y in range(8) for x in range(8))
        return spatial, colors, shape


def resemblance(a, b):
    spatial = sum(abs(x-y) for x,y in zip(a[0],b[0])) / len(a[0])
    color = sum(abs(x-y) for x,y in zip(a[1],b[1])) / 6
    shape = sum(x != y for x,y in zip(a[2],b[2])) / 64
    return max(0, 1 - (.45*spatial + .35*color + .20*shape))


def safe_catalog_url(url, supabase_url):
    try:
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None,443):
            return False
        if parsed.hostname == 'images.unsplash.com':
            return parsed.path.startswith('/photo-')
        if parsed.hostname == 'image.uniqlo.com':
            return parsed.path.startswith('/UQ/ST3/')
        host = urlsplit(supabase_url).hostname
        return bool(host and host.endswith('.supabase.co') and parsed.hostname == host
                    and parsed.path.startswith('/storage/v1/object/public/product-images/'))
    except (ValueError, TypeError):
        return False


def install(app, ns):
    cache = OrderedDict()
    busy = asyncio.Lock()
    attempts = defaultdict(deque)
    workers = asyncio.Semaphore(2)

    async def feature(client, url):
        if not safe_catalog_url(url, ns.SUPABASE_URL):
            return None
        cached = cache.get(url)
        if cached and cached[0] > time.monotonic()-3600:
            cache.move_to_end(url)
            return cached[1]
        async with workers:
            try:
                async with client.stream('GET',url,follow_redirects=False) as response:
                    if response.status_code != 200:
                        return None
                    content_type=response.headers.get('content-type','').split(';')[0].strip().lower()
                    if content_type not in {'image/jpeg','image/png','image/webp'}:
                        return None
                    data=bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data)>MAX_RECEIPT_BYTES:
                            return None
                value=await run_in_threadpool(descriptor,bytes(data),content_type)
                cache[url]=(time.monotonic(),value);cache.move_to_end(url)
                while len(cache)>400: cache.popitem(last=False)
                return value
            except (httpx.HTTPError, HTTPException, ValueError):
                return None

    @app.post('/api/search/image')
    async def search(request: Request, file: UploadFile = File(...)):
        now=time.monotonic();ip=request.client.host if request.client else 'unknown'
        for old in list(attempts):
            if not attempts[old] or attempts[old][-1]<now-60: del attempts[old]
        recent=attempts[ip]
        while recent and recent[0]<now-60: recent.popleft()
        if len(recent)>=5 or busy.locked():
            raise HTTPException(429,'Image search busy; try again shortly',headers={'Retry-After':'60'})
        recent.append(now)
        async with busy:
            query=await run_in_threadpool(descriptor,await file.read(MAX_RECEIPT_BYTES+1),(file.content_type or '').lower())
            products=await ns.load_products()
            candidates=[p for p in products if p.get('active',True)]
            scores={};scanned=set()
            async with httpx.AsyncClient(timeout=6) as client:
                async def compare(p):
                    urls=(p.get('images') or [p.get('image')])[:2]
                    for url in dict.fromkeys(u for u in urls if u):
                        value=await feature(client,url)
                        if value is not None:
                            scanned.add(p['id'])
                            scores[p['id']]=max(scores.get(p['id'],0),resemblance(query,value))
                try:
                    async with asyncio.timeout(20):
                        await asyncio.gather(*(compare(p) for p in candidates[:120]))
                except TimeoutError:
                    pass
            if not scanned:
                raise HTTPException(503,'Catalog images unavailable for comparison')
            matches=sorted((code for code,score in scores.items() if score>=.82),key=scores.get,reverse=True)[:20]
            return {'ids':matches,'mode':'visual_resemblance','indexed_products':len(scanned),
                    'total_products':len(candidates),'partial':len(scanned)<len(candidates)}
