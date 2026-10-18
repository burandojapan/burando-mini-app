"""Synthetic bot/menu tests; no live Telegram messages or customer data."""
import asyncio
from types import SimpleNamespace
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from entry_menu import install, ENTRY


def setup(monkeypatch, bot='burando_news_bot', environment='production'):
    calls=[]; menus={};
    async def request(self, method, url, **kwargs):
        body=kwargs.get('json',{})
        if url.startswith(ENTRY):
            return httpx.Response(200,text='window.BurandoLiveStore',headers={'content-type':'text/javascript'},request=httpx.Request(method,url))
        if '/rest/' in url:
            assert kwargs['params']['select']=='telegram_user_id'
            data=[{'telegram_user_id':'42'}]
        else:
            action=url.rsplit('/',1)[1];calls.append((action,body))
            if action=='getMe': data={'ok':True,'result':{'username':bot}}
            elif action=='getChatMenuButton':data={'ok':True,'result':menus.get(body.get('chat_id'),{'type':'web_app','web_app':{'url':'https://old.invalid'}})}
            elif action=='setChatMenuButton':menus[body.get('chat_id')]=body['menu_button'];data={'ok':True,'result':True}
            else:raise AssertionError('Unexpected Telegram operation')
        return httpx.Response(200,json=data,request=httpx.Request(method,url))
    monkeypatch.setattr(httpx.AsyncClient,'request',request)
    def validate(raw):
        if raw!='signed':raise HTTPException(401,'Invalid Telegram data')
        return {'id':42}
    app=FastAPI();ns=SimpleNamespace(ENVIRONMENT=SimpleNamespace(name=environment),BOT_TOKEN='synthetic',
        SUPABASE_URL='https://synthetic.invalid',SUPABASE_SERVICE_KEY='synthetic',sb_headers=lambda *a:{},validate=validate)
    install(app,ns)
    return app,calls,menus


def test_signed_account_can_only_repair_its_own_menu(monkeypatch):
    app,calls,menus=setup(monkeypatch);c=TestClient(app)
    assert c.post('/api/telegram/entry',json={'init_data':'forged','chat_id':'99'}).status_code==401
    assert not calls
    assert c.post('/api/telegram/entry',json={'init_data':'signed','chat_id':'99'}).status_code==200
    assert menus['42']['web_app']['url']==ENTRY
    assert '99' not in menus
    before=len(calls)
    assert c.post('/api/telegram/entry',json={'init_data':'signed'}).status_code==200
    assert len(calls)==before,'bounded account check cache'
    assert all(action in {'getMe','getChatMenuButton','setChatMenuButton'} for action,_ in calls)


def test_wrong_bot_fails_closed_and_staging_has_no_menu_repair(monkeypatch):
    app,calls,menus=setup(monkeypatch,bot='brnd_test_bot')
    assert TestClient(app).post('/api/telegram/entry',json={'init_data':'signed'}).status_code==503
    assert not menus
    app,calls,menus=setup(monkeypatch,environment='staging')
    assert TestClient(app).post('/api/telegram/entry',json={'init_data':'signed'}).status_code==404
    assert not calls


def test_startup_repairs_default_and_prior_verified_accounts_without_messages(monkeypatch):
    app,calls,menus=setup(monkeypatch)
    # Exercise the lifespan directly so the bounded startup task can finish deterministically.
    async def run():
        async with app.router.lifespan_context(app):
            for _ in range(30):await asyncio.sleep(0)
    asyncio.run(run())
    assert menus[None]['web_app']['url']==ENTRY
    assert menus['42']['web_app']['url']==ENTRY
    assert not any(action in {'sendMessage','setWebhook','getUpdates'} for action,_ in calls)
