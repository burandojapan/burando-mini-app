"""No live Telegram calls. Isolated database and Bot API responses."""
from types import SimpleNamespace
import copy
import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from notifications import install


def make_client(monkeypatch, *, transport=True, bot='brnd_test_bot', fail_send=False):
    monkeypatch.setenv('STAGING_TEST_NOTIFICATIONS','true' if transport else 'false')
    monkeypatch.setenv('STAGING_BOT_USERNAME','brnd_test_bot')
    cfg={'enabled':True,'admin_chat_id':'42','test_recipient_ids':['42','43'],'enabled_since':'2026-10-17T00:00:00+00:00'}
    queue=[]; sends=[]; patches=[]; claims=[]
    async def request(self, method, url, **kw):
        params=kw.get('params',{});body=kw.get('json',{})
        if '/bot' in str(url):
            action=str(url).rsplit('/',1)[1]
            if action=='getMe': data={'ok':True,'result':{'username':bot}}
            elif action=='getChat': data={'ok':True,'result':{'id':int(body['chat_id'])}}
            else:
                sends.append(body)
                data={'ok':not fail_send,'result':{}}
            return httpx.Response(200,json=data,request=httpx.Request(method,url))
        if str(url).endswith('/notification_config'):
            if method=='PATCH': cfg.update(body); data=None
            else: data=[copy.deepcopy(cfg)]
        elif str(url).endswith('/burando_claim_notification_since'):
            claims.append(body);data=queue.pop(0) if queue else None
        elif str(url).endswith('/orders'):
            identity=params['id'].removeprefix('eq.')
            data=[{'telegram_verified':identity!='4','telegram_user_id':{'1':'42','2':'43','3':'44','4':'42'}[identity],'customer_name':'Synthetic'}]
        elif str(url).endswith('/order_items'): data=[]
        else: patches.append(body);data=None
        return httpx.Response(200,json=data,request=httpx.Request(method,url))
    monkeypatch.setattr(httpx.AsyncClient,'request',request)
    def auth(key):
        if key!='test-key':raise HTTPException(401,'Unauthorized')
    app=FastAPI();install(app,SimpleNamespace(ENVIRONMENT=SimpleNamespace(name='staging',notifications_enabled=False),BOT_TOKEN='not-a-real-token',SUPABASE_URL='https://test.supabase.co',sb_headers=lambda *args:{},require_admin_key=auth))
    return TestClient(app),cfg,queue,sends,patches,claims


def item(order,audience='customer',target='43'):
    return {'id':order,'order_id':order,'audience':audience,'telegram_user_id':target,'message':'Synthetic order notice','attempts':1}


def test_staging_default_off_and_no_public_configuration(monkeypatch):
    c,cfg,q,sends,patches,claims=make_client(monkeypatch,transport=False)
    assert c.get('/api/admin/notifications/config').status_code==401
    assert c.post('/api/admin/notifications/dispatch',headers={'X-Admin-Key':'test-key'}).json()['enabled'] is False
    assert not sends and not claims


def test_expected_test_bot_and_recipient_allowlist(monkeypatch):
    c,cfg,q,sends,patches,claims=make_client(monkeypatch)
    q.extend([item(1,'admin'),item(2),item(3,target='44'),item(4,target='42')])
    r=c.post('/api/admin/notifications/dispatch',headers={'X-Admin-Key':'test-key'})
    assert r.json()['processed']==4
    assert [x['chat_id'] for x in sends]==['42','43']
    assert all(x['text'].startswith('🧪 BURANDO TEST') for x in sends)
    assert [p['status'] for p in patches]==['sent','sent','blocked','blocked']
    assert claims[0]['p_since']==cfg['enabled_since']


def test_wrong_test_bot_never_claims_or_sends(monkeypatch):
    c,cfg,q,sends,patches,claims=make_client(monkeypatch,bot='production_bot')
    q.append(item(1,'admin'))
    assert c.post('/api/admin/notifications/dispatch',headers={'X-Admin-Key':'test-key'}).status_code==503
    assert not sends and not claims


def test_setup_requires_admin_and_safe_ids_and_new_window(monkeypatch):
    c,cfg,q,sends,patches,claims=make_client(monkeypatch)
    body={'enabled':True,'admin_chat_id':'42','test_recipient_ids':['43']}
    assert c.put('/api/admin/notifications/config',json=body).status_code==401
    assert c.put('/api/admin/notifications/config',json={**body,'admin_chat_id':'@someone'},headers={'X-Admin-Key':'test-key'}).status_code==400
    assert c.put('/api/admin/notifications/config',json=body,headers={'X-Admin-Key':'test-key'}).status_code==200
    assert '42' in cfg['test_recipient_ids'] and cfg['enabled_since']!='2026-10-17T00:00:00+00:00'
    assert not sends,'saving config is not a hidden test message'
    assert c.post('/api/admin/notifications/test',headers={'X-Admin-Key':'test-key'}).status_code==200
    assert sends[0]['chat_id']=='42'


def test_delivery_failure_is_retried_without_token_in_error(monkeypatch):
    c,cfg,q,sends,patches,claims=make_client(monkeypatch,fail_send=True)
    q.append(item(1,'admin'))
    assert c.post('/api/admin/notifications/dispatch',headers={'X-Admin-Key':'test-key'}).status_code==200
    assert patches[0]['status']=='pending' and 'available_at' in patches[0]
    assert 'not-a-real-token' not in str(patches)
