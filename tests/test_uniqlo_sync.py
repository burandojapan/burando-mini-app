from copy import deepcopy
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
import asyncio
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from uniqlo_sync import SourceProduct, SyncSettings, Mapping, prices, normalized, category_rows, ensure_test, Feed, Service


def sample():
    return dict(product_id='E123',url='https://www.uniqlo.com/jp/ja/products/E123',name_uz='Futbolka',name_ru='Футболка',description_uz='Paxta',description_ru='Хлопок',category_id='provider-men-tees',category_verified=True,inventory_verified=True,content_usage_verified=True,regular_jpy='3000',discounted_jpy='2000',observed_at=datetime.now(timezone.utc).isoformat(),variants=[dict(color_id='09',size_id='M',color_uz='Qora',color_ru='Чёрный',size='M',available=True,images=['https://images.example.org/black.jpg'])])


def test_pricing_and_verified_categories():
    p=SourceProduct(**sample());cfg={'markup_percent':50,'usdjpy_rate':150}
    assert prices(p,cfg)=={'price':30,'sale_price':20}
    mapping={'provider-men-tees':dict(source_category_id='provider-men-tees',audience='men',category='t-shirts',verified=True)}
    assert normalized(p,cfg,mapping)['category']=='uniqlo/men/t-shirts'
    with pytest.raises(ValueError): normalized(p,cfg,{})
    p.inventory_verified=False
    with pytest.raises(ValueError): normalized(p,cfg,mapping)
    cats=category_rows();assert len(cats)==42 and len({r['slug'] for r in cats})==42

@pytest.mark.parametrize('change',[{'regular_jpy':'NaN'},{'discounted_jpy':'4000'},{'observed_at':(datetime.now(timezone.utc)-timedelta(days=3)).isoformat()},{'url':'https://evil.test/jp/123'}])
def test_invalid_source(change):
    with pytest.raises(ValueError): SourceProduct(**(sample()|change))


def test_variants_require_explicit_inventory():
    raw=sample();del raw['variants'][0]['available']
    with pytest.raises(ValueError): SourceProduct(**raw)
    raw=sample();raw['variants']*=2
    with pytest.raises(ValueError): SourceProduct(**raw)


def test_config_and_mapping():
    assert SyncSettings().paused
    with pytest.raises(ValueError): SyncSettings(approved=True)
    with pytest.raises(ValueError): Mapping(source_category_id='x',audience='men',category='dresses')


def test_environment_and_feed_destination(monkeypatch):
    monkeypatch.setenv('UNIQLO_TEST_PROJECT_REF','staging')
    ns=SimpleNamespace(ENVIRONMENT=SimpleNamespace(name='test'),SUPABASE_URL='https://staging.supabase.co')
    ensure_test(ns)
    ns.SUPABASE_URL='https://rnzubppxzbpbubacpfno.supabase.co'
    with pytest.raises(HTTPException):ensure_test(ns)
    monkeypatch.setenv('UNIQLO_FEED_URL','https://provider.test/feed')
    monkeypatch.setenv('UNIQLO_FEED_ALLOWED_HOST','different.test')
    with pytest.raises(ValueError):Feed()


def test_endpoints_auth_and_live_block(monkeypatch):
    import app
    client=TestClient(app.app)
    monkeypatch.setattr(app,'ADMIN_KEY','secret')
    monkeypatch.setattr(app,'require_db',lambda:None)
    assert client.get('/api/admin/uniqlo').status_code==401
    monkeypatch.setattr(app,'ENVIRONMENT',SimpleNamespace(name='production'))
    assert client.post('/api/admin/uniqlo/sync',headers={'X-Admin-Key':'secret'}).status_code==403
    assert client.get('/api/uniqlo/categories').status_code==200


def test_failed_feed_never_applies_inventory(monkeypatch):
    monkeypatch.setenv('UNIQLO_TEST_PROJECT_REF','staging')
    ns=SimpleNamespace(ENVIRONMENT=SimpleNamespace(name='test'),SUPABASE_URL='https://staging.supabase.co')
    service=Service(ns);calls=[]
    async def db(method,path,**kw):
        calls.append(path)
        if path=='rpc/burando_uniqlo_start':return 'run'
    async def config():return dict(approved=True,paused=False,rate_approved=True,rate_observed_at=datetime.now(timezone.utc).isoformat(),version=0)
    class BadFeed:
        async def read(self,url):raise ValueError('incomplete')
    monkeypatch.setattr(service,'db',db);monkeypatch.setattr(service,'config',config)
    monkeypatch.setattr('uniqlo_sync.Feed',BadFeed)
    with pytest.raises(HTTPException):asyncio.run(service.run())
    assert calls==['rpc/burando_uniqlo_start','rpc/burando_uniqlo_finish']


def test_full_service_import_and_fx_snapshot(monkeypatch):
    monkeypatch.setenv('UNIQLO_TEST_PROJECT_REF','staging')
    ns=SimpleNamespace(ENVIRONMENT=SimpleNamespace(name='test'),SUPABASE_URL='https://staging.supabase.co')
    service=Service(ns);calls=[]
    async def config():return dict(approved=True,paused=False,rate_approved=True,rate_source='approved-fx',rate_mode='feed',rate_observed_at='2000-01-01T00:00:00+00:00',usdjpy_rate=140,markup_percent=50,version=0)
    class GoodFeed:
        forex=dict(usdjpy_rate=150,source='approved-fx',observed_at=datetime.now(timezone.utc).isoformat())
        async def read(self,url):return [sample()]
    async def db(method,path,**kw):
        calls.append((path,kw))
        if path=='rpc/burando_uniqlo_start':return 'run'
        if path=='uniqlo_category_mappings':return [dict(source_category_id='provider-men-tees',audience='men',category='t-shirts',verified=True)]
        if path=='rpc/burando_uniqlo_apply':return {'review':False}
    monkeypatch.setattr(service,'db',db);monkeypatch.setattr(service,'config',config);monkeypatch.setattr('uniqlo_sync.Feed',GoodFeed)
    result=asyncio.run(service.run(automatic=True))
    assert result['imported']==1 and result['status']=='success'
    payload=next(kw['json']['p_item'] for path,kw in calls if path=='rpc/burando_uniqlo_apply')
    assert payload['price']==30 and payload['sale_price']==20
    assert 'rpc/burando_uniqlo_rate' in [path for path,kw in calls]
