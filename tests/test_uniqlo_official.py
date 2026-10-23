import asyncio
import copy
import json
from datetime import datetime, timezone
import httpx
import pytest
from uniqlo_official import canonical_url, snapshot, inspect_url, SourceUnavailable

URL='https://www.uniqlo.com/jp/ja/products/E123456-000/00'
def state():
    return {'fetchStatus':{'PRODUCT/GET_PRODUCT':{'status':'loaded'}},'entity':{'pdpEntity':{'E123456-000-00':{'product':{
        'productId':'E123456-000','priceGroup':'00','name':'Synthetic product',
        'prices':{'base':{'currency':{'code':'JPY'},'value':3000},'promo':None},
        'breadcrumbs':{'gender':{'id':'men-id','name':'MEN'},'category':{'id':'tees-id','name':'t-shirts'}},
        'colors':[{'code':'COL09','displayCode':'09','name':'BLACK','display':{'showFlag':True}}],
        'sizes':[{'code':'SMA004','displayCode':'004','name':'M','display':{'showFlag':True}}],
    }}}}}
def html(data):return '<html><script>window.__PRELOADED_STATE__ = '+json.dumps(data)+';</script></html>'

def test_safe_structured_snapshot_never_invents_stock():
    d=snapshot(html(state()),URL)
    assert d['product_id']=='E123456-000' and d['regular_jpy']=='3000'
    assert d['colors'][0]['color_id']=='COL09' and d['sizes'][0]['size_id']=='SMA004'
    assert d['available_variants'] is None and not d['inventory_verified']
    assert not d['ready_to_import'] and d['status']=='review_required'
    assert not d['content_usage_verified'] and len(d['blockers'])==4

def test_explicit_source_discount():
    s=state();s['entity']['pdpEntity']['E123456-000-00']['product']['prices']['promo']={'currency':{'code':'JPY'},'value':2000}
    assert snapshot(html(s),URL)['discounted_jpy']=='2000'

@pytest.mark.parametrize('url',['http://www.uniqlo.com/jp/ja/products/E123456-000/00','https://www.uniqlo.com.evil.test/jp/ja/products/E123456-000/00','https://x:www@www.uniqlo.com/jp/ja/products/E123456-000/00','https://www.uniqlo.com:8443/jp/ja/products/E123456-000/00','https://www.uniqlo.com/jp/ja/search'])
def test_destination_pinning(url):
    with pytest.raises(SourceUnavailable):canonical_url(url)

def test_strip_tracking_only():
    assert canonical_url(URL+'?utm_source=app#detail')==URL
    assert canonical_url(URL.replace('www.uniqlo','uniqlo'))==URL

@pytest.mark.parametrize('change',['identity','currency','not_loaded','invalid_price'])
def test_changed_or_inconsistent_state_fails_closed(change):
    s=state();p=s['entity']['pdpEntity']['E123456-000-00']['product']
    if change=='identity':p['productId']='E999999-000'
    if change=='currency':p['prices']['base']['currency']['code']='USD'
    if change=='not_loaded':s['fetchStatus']['PRODUCT/GET_PRODUCT']['status']='error'
    if change=='invalid_price':p['prices']['base']['value']='NaN'
    with pytest.raises(SourceUnavailable):snapshot(html(s),URL)

def test_no_eval_no_regex_inventory_fallback():
    with pytest.raises(SourceUnavailable):snapshot('<html>BLACK XS S M L Available</html>',URL)
    with pytest.raises(SourceUnavailable):snapshot('<script>window.__PRELOADED_STATE__ = malicious()</script>',URL)
    with pytest.raises(SourceUnavailable):snapshot(html(state())+html(state()),URL)

@pytest.mark.parametrize('status',[403,429,302])
def test_block_redirect_rate_limit_never_retried(monkeypatch,status):
    calls=[]
    def handler(request):
        calls.append(str(request.url))
        if request.url.path=='/robots.txt':return httpx.Response(200,headers={'content-type':'text/plain'},text='User-agent: *\nAllow: /')
        return httpx.Response(status,headers={'location':'https://evil.test/'})
    original=httpx.AsyncClient
    monkeypatch.setattr('uniqlo_official.httpx.AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handler),trust_env=False,**kw))
    with pytest.raises(SourceUnavailable):asyncio.run(inspect_url(URL))
    assert calls==['https://www.uniqlo.com/robots.txt',URL]

def test_robots_disallow_prevents_product_request(monkeypatch):
    calls=[]
    def handler(request):
        calls.append(str(request.url));return httpx.Response(200,headers={'content-type':'text/plain'},text='User-agent: *\nDisallow: /jp/ja/products/')
    original=httpx.AsyncClient
    monkeypatch.setattr('uniqlo_official.httpx.AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handler),trust_env=False,**kw))
    with pytest.raises(SourceUnavailable):asyncio.run(inspect_url(URL))
    assert len(calls)==1
