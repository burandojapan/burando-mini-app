"""Authorized normalized feed integration. No scraping or Telegram transport.

The provider must supply the documented v1 contract; configuration is server-only.
No public UNIQLO endpoint is assumed to be licensed or inventory-authoritative.
"""
import os
import re
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import urlparse
import httpx
from fastapi import Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

ID = r'^[A-Za-z0-9_-]{1,80}$'
GROUPS = {
 'men': ['t-shirts','shirts','pants','jeans','shorts','jackets-coats','hoodies-sweatshirts','knitwear','innerwear','sportswear','accessories'],
 'women': ['t-shirts','shirts-blouses','dresses','skirts','pants','jeans','jackets-coats','knitwear','innerwear','sportswear','accessories'],
 'kids': ['t-shirts','shirts','pants','dresses-skirts','jackets','sweatshirts','innerwear','accessories'],
 'baby': ['bodysuits','tops','bottoms','rompers','sets','outerwear','accessories'],
}
LABELS = {
 'uniqlo': ('UNIQLO','UNIQLO'), 'men':('Erkaklar','Мужчины'), 'women':('Ayollar','Женщины'), 'kids':('Bolalar','Дети'), 'baby':('Chaqaloqlar','Малыши'),
 't-shirts':('Futbolkalar','Футболки'), 'shirts':('Ko‘ylaklar','Рубашки'), 'pants':('Shimlar','Брюки'), 'jeans':('Jinsilar','Джинсы'), 'shorts':('Shortilar','Шорты'), 'jackets-coats':('Kurtka va paltolar','Куртки и пальто'), 'hoodies-sweatshirts':('Hudi va svitshotlar','Худи и свитшоты'), 'knitwear':('Trikotaj','Трикотаж'), 'innerwear':('Ichki kiyim','Нижнее бельё'), 'sportswear':('Sport kiyimlari','Спортивная одежда'), 'accessories':('Aksessuarlar','Аксессуары'), 'shirts-blouses':('Ko‘ylak va bluzkalar','Рубашки и блузки'), 'dresses':('Ko‘ylaklar','Платья'), 'skirts':('Yubkalar','Юбки'), 'dresses-skirts':('Ko‘ylak va yubkalar','Платья и юбки'), 'jackets':('Kurtkalar','Куртки'), 'sweatshirts':('Svitshotlar','Свитшоты'), 'bodysuits':('Bodilar','Боди'), 'tops':('Ustki kiyimlar','Верх'), 'bottoms':('Shim va ishtonlar','Низ'), 'rompers':('Kombinezonlar','Комбинезоны'), 'sets':('To‘plamlar','Комплекты'), 'outerwear':('Tashqi kiyimlar','Верхняя одежда'),
}

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class Variant(Strict):
    color_id: str = Field(pattern=ID)
    size_id: str = Field(pattern=ID)
    color_uz: str = Field(min_length=1, max_length=100)
    color_ru: str = Field(min_length=1, max_length=100)
    size: str = Field(min_length=1, max_length=40)
    available: bool  # absence is never a stock signal
    images: list[str] = Field(min_length=1, max_length=30)

class SourceProduct(Strict):
    product_id: str = Field(pattern=ID)
    url: str = Field(max_length=2000)
    name_uz: str = Field(min_length=1, max_length=300)
    name_ru: str = Field(min_length=1, max_length=300)
    description_uz: str = Field(min_length=1, max_length=20000)
    description_ru: str = Field(min_length=1, max_length=20000)
    category_id: str = Field(min_length=1, max_length=150)
    category_verified: bool
    inventory_verified: bool
    content_usage_verified: bool
    regular_jpy: Decimal = Field(gt=0, le=100000000)
    discounted_jpy: Decimal | None = Field(default=None, gt=0)
    observed_at: datetime
    variants: list[Variant] = Field(min_length=1, max_length=2000)

    @model_validator(mode='after')
    def coherent(self):
        u=urlparse(self.url)
        if u.scheme!='https' or u.hostname not in {'www.uniqlo.com','uniqlo.com'} or not u.path.startswith('/jp/') or u.username or u.password:
            raise ValueError('UNIQLO Japan product URL required')
        now=datetime.now(timezone.utc)
        if not self.observed_at.tzinfo or not now-timedelta(hours=26) <= self.observed_at <= now+timedelta(minutes=5):
            raise ValueError('Fresh timestamp with timezone required')
        if self.discounted_jpy is not None and self.discounted_jpy>=self.regular_jpy:
            raise ValueError('Invalid discount')
        seen=set(); labels={}; sizes={}
        for v in self.variants:
            key=(v.color_id,v.size_id)
            if key in seen: raise ValueError('Duplicate variant')
            seen.add(key)
            label=(v.color_uz,v.color_ru,tuple(v.images))
            if v.color_id in labels and labels[v.color_id]!=label: raise ValueError('Inconsistent color')
            labels[v.color_id]=label
            if v.size_id in sizes and sizes[v.size_id]!=v.size: raise ValueError('Inconsistent size')
            sizes[v.size_id]=v.size
            for image in v.images:
                parsed=urlparse(image)
                if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:
                    raise ValueError('HTTPS media required')
        return self

class SyncSettings(Strict):
    paused: bool = True
    approved: bool = False
    permission_reference: str = Field(default='', max_length=2000)
    markup_percent: Decimal = Field(default=50, ge=0, le=500)
    price_policy: str = Field(default='review', pattern='^(review|automatic)$')
    usdjpy_rate: Decimal = Field(default=150, ge=1, le=1000)
    rate_mode: str = Field(default='manual', pattern='^(manual|feed)$')
    rate_source: str = Field(default='', max_length=300)
    rate_observed_at: datetime | None = None
    rate_approved: bool = False
    @model_validator(mode='after')
    def approval(self):
        if self.approved and (not self.permission_reference.strip() or not self.rate_approved or not self.rate_source.strip() or self.rate_observed_at is None or self.rate_observed_at.tzinfo is None):
            raise ValueError('Permission reference and approved timestamped rate required')
        return self

class Mapping(Strict):
    source_category_id: str = Field(min_length=1,max_length=150)
    audience: str
    category: str
    verified: bool = False
    @model_validator(mode='after')
    def valid(self):
        if self.category not in GROUPS.get(self.audience,[]): raise ValueError('Unknown category')
        return self

class ImportURL(Strict):
    url: str = Field(max_length=2000)


def category_rows():
    result=[dict(slug='uniqlo',parent=None,title_uz='UNIQLO',title_ru='UNIQLO')]
    for group, cats in GROUPS.items():
        slug='uniqlo/'+group
        result.append(dict(slug=slug,parent='uniqlo',title_uz=LABELS[group][0],title_ru=LABELS[group][1]))
        result.extend(dict(slug=slug+'/'+c,parent=slug,title_uz=LABELS[c][0],title_ru=LABELS[c][1]) for c in cats)
    return result


def prices(product, config):
    factor=(Decimal(1)+Decimal(str(config['markup_percent']))/100)/Decimal(str(config['usdjpy_rate']))
    money=lambda x: float((x*factor).quantize(Decimal('.01'),rounding=ROUND_HALF_UP))
    base=money(product.regular_jpy)
    sale=money(product.discounted_jpy) if product.discounted_jpy is not None else None
    if base<=0 or (sale is not None and not 0<sale<base): raise ValueError('Unrepresentable USD price')
    return dict(price=base,sale_price=sale)


def normalized(product, config, mappings):
    if not all((product.category_verified,product.inventory_verified,product.content_usage_verified)):
        raise ValueError('Unverified source metadata, inventory or content permissions')
    mapping=mappings.get(product.category_id)
    if not mapping or not mapping['verified']: raise ValueError('Unclassified source category')
    Mapping(**{k:mapping[k] for k in ('source_category_id','audience','category','verified')})
    return dict(**product.model_dump(mode='json'),**prices(product,config),category='uniqlo/'+mapping['audience']+'/'+mapping['category'])


def ensure_test(ns):
    # Explicit project allowlist; production database cannot be enabled by a UI flag.
    expected=os.getenv('UNIQLO_TEST_PROJECT_REF','').strip()
    if ns.ENVIRONMENT.name not in {'staging','test'} or not expected or urlparse(ns.SUPABASE_URL).hostname!=expected+'.supabase.co' or expected=='rnzubppxzbpbubacpfno':
        raise HTTPException(403,'UNIQLO integration is restricted to its isolated TEST database')

class Feed:
    def __init__(self):
        self.url=os.getenv('UNIQLO_FEED_URL','')
        self.token=os.getenv('UNIQLO_FEED_TOKEN','')
        host=os.getenv('UNIQLO_FEED_ALLOWED_HOST','')
        u=urlparse(self.url)
        if u.scheme!='https' or not host or u.hostname!=host or u.username or u.password or u.fragment:
            raise ValueError('Authorized HTTPS feed URL and exact allowed host must be configured')
    async def read(self, url=None):
        # User URL is a query value, never a request destination. Redirects forbidden.
        headers={'Accept':'application/json'}
        if self.token: headers['Authorization']='Bearer '+self.token
        async with httpx.AsyncClient(timeout=60,follow_redirects=False,trust_env=False) as client:
            async with client.stream('GET',self.url,headers=headers,params={'product_url':url} if url else {}) as r:
                r.raise_for_status()
                data=bytearray()
                async for chunk in r.aiter_bytes():
                    data.extend(chunk)
                    if len(data)>25_000_000: raise ValueError('Feed exceeds 25 MB limit')
        import json
        body=json.loads(data)
        if body.get('schema_version')!=1 or body.get('complete') is not True or not isinstance(body.get('products'),list):
            raise ValueError('Incomplete or unsupported feed')
        if len(body['products'])>10000: raise ValueError('Feed exceeds 10000 products')
        self.forex=body.get('forex')
        return body['products']

class Service:
    def __init__(self, ns): self.ns=ns
    async def db(self,method,path,**kw):
        self.ns.require_db()
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                r=await client.request(method,self.ns.SUPABASE_URL+'/rest/v1/'+path,headers=self.ns.sb_headers(True,'return=representation'),**kw)
                r.raise_for_status()
                return r.json() if r.content else None
        except httpx.HTTPError:
            raise HTTPException(503,'UNIQLO database operation failed') from None
    async def config(self):
        return (await self.db('GET','uniqlo_settings',params={'id':'eq.1'}))[0]
    async def run(self,url=None,automatic=False):
        ensure_test(self.ns)
        config=await self.config()
        if not config['approved'] or (automatic and config['paused']):
            raise HTTPException(409,'Approve source and pricing settings; automatic sync must be unpaused')
        feed=Feed()
        run=await self.db('POST','rpc/burando_uniqlo_start',json={'p_version':config['version']})
        errors=0; imported=0
        try:
            rows=await feed.read(url)
            if config.get('rate_mode') == 'feed':
                fx=feed.forex or {}
                observed=datetime.fromisoformat(str(fx.get('observed_at','')).replace('Z','+00:00'))
                rate=Decimal(str(fx.get('usdjpy_rate')))
                if fx.get('source') != config['rate_source'] or not rate.is_finite() or not 1<=rate<=1000:
                    raise ValueError('Unapproved FX source or invalid rate')
                await self.db('POST','rpc/burando_uniqlo_rate',json={'p_run':run,'p_version':config['version'],'p_rate':str(rate),'p_source':fx['source'],'p_observed':observed.isoformat()})
                config.update(usdjpy_rate=str(rate),rate_observed_at=observed.isoformat())
            observed=datetime.fromisoformat(config['rate_observed_at'].replace('Z','+00:00'))
            age=datetime.now(timezone.utc)-observed
            if not observed.tzinfo or not config['rate_approved'] or not -timedelta(minutes=5)<=age<=timedelta(hours=26):
                raise ValueError('Approved USD/JPY rate is stale')
            mappings={r['source_category_id']:r for r in await self.db('GET','uniqlo_category_mappings')}
            # Validate duplicate IDs before changing any products.
            ids=[r.get('product_id') for r in rows if isinstance(r,dict)]
            if len(ids)!=len(set(ids)): raise ValueError('Feed contains duplicate product IDs')
            for raw in rows:
                pid=str(raw.get('product_id','unknown'))[:80] if isinstance(raw,dict) else 'unknown'
                try:
                    p=SourceProduct.model_validate(raw)
                    if url and p.url!=url: raise ValueError('Provider returned a different product URL')
                    item=normalized(p,config,mappings)
                except (ValueError,TypeError,KeyError):
                    errors+=1
                    await self.db('POST','rpc/burando_uniqlo_review',json={'p_run':run,'p_external_id':pid,'p_reason':'Invalid, stale, unclassified or unverified source product'})
                    continue
                result=await self.db('POST','rpc/burando_uniqlo_apply',json={'p_run':run,'p_version':config['version'],'p_item':item})
                if result.get('review'): errors+=1
                else: imported+=1
            await self.finish(run,'partial' if errors else 'success',imported,errors)
            return dict(run_id=run,status='partial' if errors else 'success',imported=imported,errors=errors)
        except Exception:
            await self.finish(run,'failed',imported,errors+1)
            raise HTTPException(502,'Source sync failed; existing inventory was preserved. Check sync history.') from None
    async def finish(self,run,status,imported,errors):
        await self.db('POST','rpc/burando_uniqlo_finish',json={'p_run':run,'p_status':status,'p_imported':imported,'p_errors':errors})


def install(app,ns):
    service=Service(ns)
    def guard(key):
        ns.require_admin_key(key); ensure_test(ns)
    @app.get('/api/uniqlo/categories')
    async def categories(): return category_rows()
    @app.get('/api/admin/uniqlo')
    async def status(x_admin_key:str=Header(default='')):
        guard(x_admin_key)
        return await service.db('POST','rpc/burando_uniqlo_status',json={})
    @app.put('/api/admin/uniqlo/settings')
    async def settings(payload:SyncSettings,x_admin_key:str=Header(default='')):
        guard(x_admin_key)
        return await service.db('POST','rpc/burando_uniqlo_settings',json={'p_data':payload.model_dump(mode='json')})
    @app.put('/api/admin/uniqlo/mapping')
    async def mapping(payload:Mapping,x_admin_key:str=Header(default='')):
        guard(x_admin_key)
        return await service.db('POST','rpc/burando_uniqlo_mapping',json={'p_data':payload.model_dump()})
    @app.post('/api/admin/uniqlo/sync')
    async def sync(x_admin_key:str=Header(default='')):
        guard(x_admin_key)
        try: return await service.run()
        except ValueError: raise HTTPException(409,'Configure an authorized feed first') from None
    @app.post('/api/admin/uniqlo/import')
    async def single(payload:ImportURL,x_admin_key:str=Header(default='')):
        guard(x_admin_key)
        u=urlparse(payload.url)
        if u.scheme!='https' or u.hostname not in {'uniqlo.com','www.uniqlo.com'} or not u.path.startswith('/jp/') or u.username or u.password:
            raise HTTPException(400,'UNIQLO Japan URL required')
        try: return await service.run(payload.url)
        except ValueError: raise HTTPException(409,'Configure an authorized feed first') from None
