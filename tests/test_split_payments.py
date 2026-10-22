import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import patch

import httpx
import pytest
from fastapi import HTTPException
from split_payments import fetch_rate, make_quote, read_quote
from test_v7_api import client, checkout, ORDER, TOKEN

ITEMS=[dict(product_code='BD-SYN',size='',color='',qty=1,unit_price=49.01)]


@pytest.mark.anyio
async def test_signed_quote_rounding_expiry_and_cart_binding():
    async def rate(): return '12000.02', '2026-10-22'
    with patch('split_payments.fetch_rate',rate):
        q=await make_quote('synthetic-secret',ITEMS,Decimal('49.01'))
    assert q['total_uzs']=='588121'
    assert q['deposit_uzs']=='294061' and q['balance_uzs']=='294060'
    assert read_quote('synthetic-secret',q['quote_token'],ITEMS,Decimal('49.01'))['exchange_source']=='CBU'
    for secret,token,items,total in [('wrong',q['quote_token'],ITEMS,Decimal('49.01')),('synthetic-secret',q['quote_token']+'x',ITEMS,Decimal('49.01')),('synthetic-secret',q['quote_token'],[{**ITEMS[0],'qty':2}],Decimal('49.01'))]:
        with pytest.raises(HTTPException):read_quote(secret,token,items,total)
    with patch('split_payments.time.time',return_value=time.time()+901):
        with pytest.raises(HTTPException):read_quote('synthetic-secret',q['quote_token'],ITEMS,Decimal('49.01'))


@pytest.mark.anyio
async def test_rate_staleness_and_upstream_failure_fail_closed():
    date=(datetime.now(timezone.utc)-timedelta(days=8)).strftime('%d.%m.%Y')
    async def request(self,method,url,**kw):
        return httpx.Response(200,json=[{'Ccy':'USD','Rate':'12000','Nominal':'1','Date':date}],request=httpx.Request(method,url))
    with patch.object(httpx.AsyncClient,'request',request):
        with pytest.raises(HTTPException) as e:await fetch_rate()
        assert e.value.status_code==503
    async def broken(self,*args,**kwargs):raise httpx.ConnectError('unavailable')
    with patch.object(httpx.AsyncClient,'request',broken):
        with pytest.raises(HTTPException) as e:await fetch_rate()
        assert e.value.status_code==503


def test_quote_endpoint_and_missing_quote_rejection(client):
    c,calls=client;p=checkout()
    q=c.post('/api/checkout/quote',json={'items':p['items'],'total':185})
    assert q.status_code==200,q.text
    assert q.json()['deposit_uzs']=='1110000'
    p['quote_token']=q.json()['quote_token'];assert c.post('/api/order',json=p).status_code==200
    p['quote_token']='';assert c.post('/api/order',json=p).status_code==409
    assert c.post('/api/checkout/quote',json={'items':p['items'],'total':1}).status_code==409


def test_phase_binding_rejects_stale_upload_before_storage(client,monkeypatch):
    c,calls=client
    monkeypatch.setitem(ORDER,'payment_plan','split_50');monkeypatch.setitem(ORDER,'payment_phase','balance')
    r=c.post('/api/orders/BR-TEST/receipt?phase=deposit',headers={'X-Order-Token':TOKEN},files={'file':('receipt.png',b'not a receipt','image/png')})
    assert r.status_code==409

    assert not any('/storage/' in u for _,u,_ in calls)
    r=c.post('/api/admin/orders/BR-TEST/payment',headers={'X-Admin-Key':'admin-test-key'},json={'action':'paid','version':0,'phase':'deposit','funds_confirmed':True})
    assert r.status_code==409


def test_committed_retry_survives_quote_expiry_and_price_change(client,monkeypatch):
    import hashlib, json
    from v7_security import token_hash
    from test_v7_api import PRODUCT
    c,calls=client;p=checkout()
    payload={k:v for k,v in p.items() if k not in ('lookup_token','quote_token','init_data','telegram_link_token')}
    payload.update(backup_phone='',comment='',total_uzs=None,language='uz')
    # Pydantic normalizes numeric total into a float before fingerprinting.
    payload['total']=float(payload['total'])
    fingerprint=hashlib.sha256(json.dumps({'checkout':payload,'telegram_id':None},sort_keys=True).encode()).hexdigest()
    original=httpx.AsyncClient.request
    async def request(self,method,url,**kw):
        if url.endswith('/orders') and kw.get('params',{}).get('idempotency_key'):
            return httpx.Response(200,json=[{**ORDER,'request_hash':fingerprint,'lookup_token_hash':token_hash(TOKEN)}],request=httpx.Request(method,url))
        return await original(self,method,url,**kw)
    monkeypatch.setattr(httpx.AsyncClient,'request',request)
    monkeypatch.setitem(PRODUCT,'price',999)
    p['quote_token']='expired.quote'
    result=c.post('/api/order',json=p)
    assert result.status_code==200,result.text
    assert result.json()['order_code']=='BR-TEST'
    assert not any(u.endswith('/rpc/burando_create_order') for _,u,_ in calls)
