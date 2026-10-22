"""Pairing and checkout integration: synthetic identities, no real Telegram messages."""
import copy
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode, urlparse, parse_qs

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from types import SimpleNamespace
from split_payments import sign_quote, cart_hash
from v7_api import install
from v7_security import telegram_user

BOT = 'synthetic-token'

def signed(approval, uid=42, age=0, start=None):
    data = {'auth_date': str(int(time.time())-age),
            'user': json.dumps({'id': uid, 'first_name': 'Synthetic', 'username': 'synthetic'}),
            'start_param': start or 'link_'+approval}
    key = hmac.new(b'WebAppData', BOT.encode(), hashlib.sha256).digest()
    data['hash'] = hmac.new(key, '\n'.join(f'{k}={v}' for k,v in sorted(data.items())).encode(), hashlib.sha256).hexdigest()
    return urlencode(data)

@pytest.fixture
def client(monkeypatch):
    rows = {}; calls=[]; mode={'bot':'burando_news_bot'}
    async def request(self, method, url, **kw):
        body=kw.get('json',{}); params=kw.get('params',{}); calls.append((method,url,kw))
        if url.endswith('/getMe'):
            data={'ok':True,'result':{'username':mode['bot']}}
        elif url.endswith('/telegram_links'):
            def matches(row):
                for key,value in params.items():
                    if key=='select': continue
                    op,val=value.split('.',1)
                    if op=='eq' and row[key]!=val: return False
                    if op=='gt' and row[key]<=val: return False
                    if op=='lt' and row[key]>=val: return False
                return True
            found=[r for r in rows.values() if matches(r)]
            if method=='POST':
                row=dict(state='pending',telegram_user_id='',telegram_username='',display_name='',**body)
                rows[row['browser_hash']]=row; data=[copy.deepcopy(row)]
            elif method=='DELETE':
                for row in found: del rows[row['browser_hash']]
                data=[]
            elif method=='PATCH':
                for row in found: row.update(body)
                data=copy.deepcopy(found)
            else: data=copy.deepcopy(found)
        elif url.endswith('/products'):
            data=[{'id':'SYN-1','price':49,'sizes':[],'colors_uz':[],'image':'','title_uz':'Synthetic'}]
        elif url.endswith('/orders'): data=[]
        elif url.endswith('/burando_create_order'): data={'order_code':'BR-SYNTHETIC'}
        else: raise AssertionError('Unexpected external request')
        return httpx.Response(200,json=data,request=httpx.Request(method,url))
    monkeypatch.setattr(httpx.AsyncClient,'request',request)
    from app import Item
    app=FastAPI()
    ns=SimpleNamespace(require_db=lambda:None, SUPABASE_URL='https://synthetic.invalid',
        ADMIN_KEY='pairing-test-key', BOT_TOKEN=BOT, ENVIRONMENT=SimpleNamespace(name='production'),sb_headers=lambda *a:{},
        validate=lambda raw:telegram_user(raw,BOT),Item=Item,normalize_product=lambda x:x,
        order_code=lambda:'BR-SYNTHETIC')
    install(app,ns)
    return TestClient(app),rows,calls,mode

def begin(c):
    r=c.post('/api/telegram-link/start'); assert r.status_code==200,r.text
    data=r.json(); approval=parse_qs(urlparse(data['url']).query)['startapp'][0][5:]
    return data,approval

def order(token=''):
    return dict(customer_name='Synthetic buyer',phone='12345',address='Synthetic address',
        items=[{'id':'SYN-1','qty':1,'price':49}],total=49,lookup_token='a'*64,
        quote_token=sign_quote('pairing-test-key',dict(cart_hash=cart_hash([dict(product_code='SYN-1',size='',color='',qty=1,unit_price=49.0)]),total_usd='49.00',total_uzs='588000',deposit_uzs='294000',balance_uzs='294000',exchange_rate='12000',exchange_date='2026-10-22',exchange_source='CBU',expires_at=int(time.time())+900)),
        idempotency_key='b43b27db-10c8-49ba-a279-413751055e71',telegram_link_token=token)

def test_pairing_two_proofs_verified_checkout_and_guest(client):
    c,rows,calls,_=client; d,a=begin(c)
    assert a not in json.dumps(rows) and d['token'] not in json.dumps(rows), 'only token hashes persisted'
    proof={'approval':a,'init_data':signed(a)}
    assert c.post('/api/telegram-link/preview',json=proof).json()['code']==d['code']
    assert c.post('/api/order',json=order(d['token'])).status_code==409
    assert c.post('/api/telegram-link/confirm',json=proof).status_code==200
    assert c.post('/api/telegram-link/confirm',json=proof).status_code==200, 'same account retry safe'
    status=c.post('/api/telegram-link/status',json={'token':d['token']}).json()
    assert status['state']=='confirmed' and status['username']=='synthetic'
    assert c.post('/api/order',json=order(d['token'])).status_code==200
    rpc=[x[2]['json'] for x in calls if x[1].endswith('/burando_create_order')][-1]
    assert rpc['p_order']['telegram_verified'] is True
    assert rpc['p_order']['telegram_user_id']=='42'
    assert d['token'] not in json.dumps(rpc)
    assert c.post('/api/order',json=order()).status_code==200
    rpc=[x[2]['json'] for x in calls if x[1].endswith('/burando_create_order')][-1]
    assert rpc['p_order']['telegram_verified'] is False
    assert not any('sendMessage' in u or 'setWebhook' in u for _,u,_ in calls)

def test_forgery_mismatched_launch_account_takeover_and_bearer_separation(client):
    c,rows,calls,_=client; d,a=begin(c)
    assert c.post('/api/telegram-link/confirm',json={'approval':a,'init_data':'user=fake'}).status_code==401
    assert c.post('/api/telegram-link/confirm',json={'approval':a,'init_data':signed(a,start='link_'+'X'*43)}).status_code==403
    assert c.post('/api/telegram-link/confirm',json={'approval':a,'init_data':signed(a,age=4000)}).status_code==401
    assert c.post('/api/telegram-link/status',json={'token':a}).status_code==422
    assert c.post('/api/telegram-link/status',json={'token':'b'*64}).status_code==410
    assert c.post('/api/telegram-link/confirm',json={'approval':a,'init_data':signed(a)}).status_code==200
    assert c.post('/api/telegram-link/confirm',json={'approval':a,'init_data':signed(a,uid=99)}).status_code==410
    assert next(iter(rows.values()))['telegram_user_id']=='42'
    assert c.post('/api/order',json={**order(d['token']),'init_data':'user=fake'}).status_code==401

def test_expiry_revocation_and_bot_isolation(client):
    c,rows,calls,_=client; d,a=begin(c)
    next(iter(rows.values()))['expires_at']='2000-01-01T00:00:00+00:00'
    assert c.post('/api/telegram-link/confirm',json={'approval':a,'init_data':signed(a)}).status_code==410
    assert c.post('/api/order',json=order(d['token'])).status_code==410
    d,a=begin(c)
    assert c.post('/api/telegram-link/revoke',json={'token':d['token']}).status_code==200
    assert c.post('/api/telegram-link/status',json={'token':d['token']}).status_code==410
    assert not rows

def test_wrong_bot_fails_closed(client):
    c,rows,calls,mode=client; mode['bot']='brnd_test_bot'
    assert c.post('/api/telegram-link/start').status_code==503
    assert not rows
