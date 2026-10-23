from decimal import Decimal
import pytest
from smart_import import validate_on_url, proposed_usd, stable_usd

def test_price_includes_flat_fifty():
    assert proposed_usd(Decimal("18000"), Decimal("150")) == Decimal("170.00")

def test_stable_price_threshold():
    assert stable_usd(Decimal("24000"), Decimal("150"), Decimal("205")) == (Decimal("205"), False)
    assert stable_usd(Decimal("24000"), Decimal("150"), Decimal("200")) == (Decimal("200"), False)
    assert stable_usd(Decimal("24000"), Decimal("150"), Decimal("199")) == (Decimal("210.00"), True)

def test_only_official_japanese_product_urls():
    assert validate_on_url("https://www.on.com/ja-jp/products/cloud-6-m-3mf1007").startswith("https://www.on.com/")
    for url in ("http://www.on.com/ja-jp/products/x", "https://evil.com/ja-jp/products/x", "https://www.on.com.evil.com/ja-jp/products/x", "https://www.on.com/other"):
        with pytest.raises(ValueError): validate_on_url(url)

from types import SimpleNamespace
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import smart_import as module
from web_security import install as install_security

URL = 'https://www.on.com/ja-jp/products/cloud-6-m-3mf1007'
PATH = '/api/admin/smart-import/preview'
KEY = 'a' * 40

@pytest.fixture
def preview_client(monkeypatch):
    monkeypatch.setenv('ADMIN_API_KEY', KEY)
    monkeypatch.delenv('ADMIN_KEY', raising=False)
    monkeypatch.setenv('STAGING_SITE_USER', 'tester')
    monkeypatch.setenv('STAGING_SITE_PASSWORD', 'b' * 40)
    calls = []
    cfg = {'status': 200, 'type': 'text/html; charset=utf-8', 'body': b'<meta property="og:title" content="Cloud 6"><meta property="og:image" content="https://images.example/shoe.jpg">'}
    def respond(request):
        calls.append(request)
        assert request.method == 'GET' and request.url.host == 'www.on.com'
        assert 'x-admin-key' not in request.headers
        if cfg.get('timeout'): raise httpx.ReadTimeout('mock timeout', request=request)
        return httpx.Response(cfg['status'], content=cfg['body'], headers={'content-type':cfg['type'], 'location':'https://evil.example/'})
    real_client = httpx.AsyncClient
    def factory(**kwargs):
        assert kwargs['follow_redirects'] is False
        return real_client(**kwargs, trust_env=False, transport=httpx.MockTransport(respond))
    monkeypatch.setattr(module.httpx, 'AsyncClient', factory)
    app = FastAPI(); environment = SimpleNamespace(name='staging')
    install_security(app, environment)
    module.install(app, environment, {'SMART_IMPORT_PREVIEW_ENABLED':'true'})
    yield TestClient(app, base_url='https://testserver'), calls, cfg

def request_preview(client):
    return client.post(PATH, json={'url':URL,'usd_jpy':'150'}, headers={'X-Admin-Key':KEY}, auth=('tester','b'*40))

@pytest.mark.parametrize('name,flag,expected', [('production','true',404),('test','true',404),('staging','false',404),('staging',None,404),('staging','true',403)])
def test_router_is_staging_opt_in(name,flag,expected,monkeypatch):
    monkeypatch.delenv('ADMIN_API_KEY',raising=False); monkeypatch.delenv('ADMIN_KEY',raising=False)
    app=FastAPI();module.install(app,SimpleNamespace(name=name),{'SMART_IMPORT_PREVIEW_ENABLED':flag})
    assert TestClient(app).post(PATH,json={'url':URL,'usd_jpy':'150'}).status_code==expected

def test_actual_app_wiring():
    import app as store
    assert store.install_smart_import is module.install
    assert not any(getattr(r,'path','')==PATH for r in store.app.routes)

def test_both_auth_layers_required(preview_client,monkeypatch):
    c,calls,_=preview_client; payload={'url':URL,'usd_jpy':'150'}
    assert c.post(PATH,json=payload,headers={'X-Admin-Key':KEY}).status_code==401
    for key in ['', 'wrong']:
        assert c.post(PATH,json=payload,headers={'X-Admin-Key':key},auth=('tester','b'*40)).status_code==403
    monkeypatch.delenv('ADMIN_API_KEY')
    assert request_preview(c).status_code==403
    assert not calls

def test_unicode_key_is_rejected(monkeypatch):
    monkeypatch.setenv('ADMIN_API_KEY',KEY)
    with pytest.raises(HTTPException) as error: module.require_preview_admin('é')
    assert error.value.status_code==403

def test_preview_does_not_write_or_calculate_unverified_price(preview_client):
    c,calls,_=preview_client;r=request_preview(c)
    assert r.status_code==200 and r.headers['cache-control']=='no-store'
    assert r.json()['title']=='Cloud 6'
    assert r.json()['image_reference']=='https://images.example/shoe.jpg'
    assert r.json()['status'].startswith('needs_verified_') and 'price' not in r.json()
    assert len(calls)==1  # No DB writes or image downloads.

@pytest.mark.parametrize('status,ctype,body,timeout,expected',[(302,'text/html',b'',False,502),(404,'text/html',b'',False,502),(200,'application/json',b'{}',False,422),(200,'text/html',b'x'*(module.MAX_HTML_BYTES+1),False,422),(200,'text/html',b'',True,502)])
def test_upstream_failures(preview_client,status,ctype,body,timeout,expected):
    c,calls,cfg=preview_client;cfg.update(status=status,type=ctype,body=body,timeout=timeout)
    assert request_preview(c).status_code==expected
    assert len(calls)==1

@pytest.mark.parametrize('value',['0','-1','NaN','Infinity','-Infinity','1000000000'])
def test_invalid_prices_and_rates(value):
    with pytest.raises(ValueError): proposed_usd(Decimal(value),Decimal('150'))
    with pytest.raises(ValueError): proposed_usd(Decimal('18000'),Decimal(value))

def test_rounding_and_both_threshold_directions():
    assert proposed_usd(Decimal('100.5'),Decimal('100'))==Decimal('51.01')
    for current in ['200','220']:
        assert stable_usd(Decimal('24000'),Decimal('150'),Decimal(current))==(Decimal(current),False)
    for current in ['199.99','220.01']:
        assert stable_usd(Decimal('24000'),Decimal('150'),Decimal(current))==(Decimal('210.00'),True)
    assert stable_usd(Decimal('24000'),Decimal('150'),None)==(Decimal('210.00'),True)
    with pytest.raises(ValueError): stable_usd(Decimal('24000'),Decimal('150'),Decimal('NaN'))

@pytest.mark.parametrize('suffix',['','../admin','x/../../other','x%2fy','x\\y','x#fragment'])
def test_reject_ambiguous_paths(suffix):
    with pytest.raises(ValueError): validate_on_url('https://www.on.com/ja-jp/products/'+suffix)

@pytest.mark.parametrize('field,value',[('usd_jpy','0'),('usd_jpy','NaN'),('current_usd','Infinity')])
def test_invalid_request_does_not_fetch(preview_client,field,value):
    c,calls,_=preview_client;payload={'url':URL,'usd_jpy':'150',field:value}
    assert c.post(PATH,json=payload,headers={'X-Admin-Key':KEY},auth=('tester','b'*40)).status_code==422
    assert not calls

def test_price_quote_auth_and_threshold(preview_client):
    c, _, _ = preview_client
    payload = {'jpy_price': '24000', 'usd_jpy': '150', 'current_usd': '205'}
    response = c.post('/api/admin/smart-import/price-quote', json=payload,
                      headers={'X-Admin-Key': KEY}, auth=('tester', 'b'*40))
    assert response.status_code == 200
    assert response.json()['effective_usd'] == '205'
    assert response.json()['price_changed'] is False
    payload['current_usd'] = '199'
    response = c.post('/api/admin/smart-import/price-quote', json=payload,
                      headers={'X-Admin-Key': KEY}, auth=('tester', 'b'*40))
    assert response.status_code == 200
    assert response.json()['effective_usd'] == '210.00'
    assert response.json()['price_changed'] is True
    assert c.post('/api/admin/smart-import/price-quote', json=payload,
                  auth=('tester', 'b'*40)).status_code == 403
