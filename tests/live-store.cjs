const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
async function scenario(mode='ready') {
  const cart=encodeURIComponent(JSON.stringify({'old-line':{id:'BD-TEST',qty:2,size:'42',color:'White',price:1}}));
  const dom=new JSDOM('<html><body><h1 id="brand">BURANDO</h1></body></html>',{url:'https://burando-live-entry.onrender.com/?product=BD-TEST#tgWebAppData=private'+(mode==='cart'?'&burando_cart_handoff='+cart:''),runScripts:'outside-only'});
  const w=dom.window,calls=[],scripts=[];
  w.AbortSignal=AbortSignal;
  w.fetch=async(url,options={})=>{
    calls.push({url,options});
    if(url.endsWith('/healthz')) return {ok:true,json:async()=>({ok:true,environment:'production'})};
    return {ok:true,headers:{get:()=> 'text/html; charset=utf-8'},text:async()=>mode==='cold'?'<h1>Render waking up</h1>':fs.readFileSync('static/index.html','utf8').replace(mode==='evil'?'/static/app.js':'never-match',mode==='evil'?'https://evil.example/app.js':'never-match')};
  };
  const replace=w.Element.prototype.replaceWith;
  w.Element.prototype.replaceWith=function(...args){
    replace.apply(this,args);
    for(const link of w.document.querySelectorAll('link[rel="stylesheet"]'))Object.defineProperty(link,'sheet',{value:{}});
    const append=w.document.head.append.bind(w.document.head);
    w.document.head.append=(el)=>{append(el);scripts.push(el.src);queueMicrotask(()=>el.dispatchEvent(new w.Event(mode==='asset-failure'?'error':'load')));};
  };
  w.eval(fs.readFileSync('entry/live-store.js','utf8'));
  const before=w.location.href;
  if(['cold','evil'].includes(mode)) {
    await assert.rejects(w.BurandoLiveStore.open('https://burando-mini-app.onrender.com'));
    assert.equal(w.BurandoLiveStore.active,false);assert.ok(w.document.querySelector('#brand'));assert.equal(scripts.length,0);
  }else{
    await w.BurandoLiveStore.open('https://burando-mini-app.onrender.com');
    assert.equal(w.location.href,mode==='cart'?before.split('&burando_cart_handoff=')[0]:before,'native Telegram launch origin and auth hash are preserved');
    if(mode==='cart'){
      const saved=JSON.parse(w.localStorage.getItem('burando_cart_v5'));
      assert.equal(saved['BD-TEST__42__White'].qty,2);assert.equal(saved['BD-TEST__42__White'].price,undefined,'prices are not imported');
    }
    assert.equal(calls[0].url,'https://burando-mini-app.onrender.com/shop','no launch credentials in HTML request');
    if(mode==='asset-failure'){
      assert.match(w.document.body.textContent,/Qayta urinish/);assert.doesNotMatch(w.document.body.textContent,/Render/);
    }else{
      assert.ok(w.document.querySelector('#checkoutForm'));assert.ok(scripts.every(s=>s.startsWith('https://burando-mini-app.onrender.com/static/')||s==='https://telegram.org/js/telegram-web-app.js'));
      assert.equal(w.document.querySelector('.brand').getAttribute('href'),'/','home remains on CDN');
      await w.fetch('/api/orders/BR-TEST/receipt',{headers:{'X-Order-Token':'synthetic'},credentials:'include'});
      const privateCall=calls.at(-1);assert.equal(privateCall.url,'https://burando-mini-app.onrender.com/api/orders/BR-TEST/receipt');
      assert.equal(privateCall.options.headers['X-Order-Token'],'synthetic');assert.equal(privateCall.options.credentials,'omit');
      await w.fetch('/api/order',{method:'POST',body:'synthetic'});assert.equal(calls.filter(c=>c.url.endsWith('/api/order')).length,1,'payment/order writes never automatically retried');
      const later=w.Date.now()+60000;w.Date.now=()=>later;
      await w.fetch('/api/order',{method:'POST',body:'synthetic-after-idle'});
      assert.equal(calls.at(-2).url,'https://burando-mini-app.onrender.com/healthz','wake up with read-only probe before a write after idle');
      assert.equal(calls.filter(c=>c.url.endsWith('/api/order')).length,2);
    }
  }
  dom.window.close();
}
async function legacyHandoff(ready,origin='https://burando-mini-app.onrender.com'){
  const redirects=[],calls=[];
  const context={window:{Telegram:{WebApp:{initData:'synthetic-signed'}}},location:{origin,search:'?product=BD-TEST',hash:'#launch',replace:url=>redirects.push(url)},
    fetch:async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>({ok:true,cdn_ready:ready})}},localStorage:{getItem:()=>null},AbortSignal,JSON};
  require('node:vm').runInNewContext(fs.readFileSync('static/entry-link.js','utf8'),context);
  for(let n=0;n<12;n++)await Promise.resolve();
  assert.equal(calls.length,1);
  assert.equal(redirects.length,ready&&origin.includes('mini-app')?1:0,'legacy handoff waits for confirmed new CDN deployment');
}
(async()=>{for(const mode of ['ready','cart','cold','evil','asset-failure'])await scenario(mode);await legacyHandoff(false);await legacyHandoff(true);await legacyHandoff(true,'https://burando-live-entry.onrender.com');console.log('Live CDN: same origin/hash, trusted HTML/assets, cold-start rejection, credential-free API bridge, no write replay, asset error recovery, rollout loop prevention, cart handoff PASS');})().catch(e=>{console.error(e);process.exit(1)});
