const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync('entry/entry.js', 'utf8');
const html = fs.readFileSync('entry/index.html', 'utf8');
const settle = async () => { for (let n=0;n<12;n++) await Promise.resolve(); };
function launch(responses, options={}) {
  const dom = new JSDOM(html, {url:'https://burando-v7-entry.onrender.com/',pretendToBeVisual:true});
  const calls=[], redirects=[], timers=new Map(); let seq=0, now=0;
  const ctx = {
    document:dom.window.document, window:dom.window, navigator:{onLine:options.online!==false},
    localStorage:dom.window.localStorage, location:{search:'?product=TEST',hash:'#tgWebAppData=secret%26signature&tgWebAppVersion=8.0',replace:x=>redirects.push(x)},
    AbortController, Date:{now:()=>now},
    setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),
    fetch:async(url,config)=>{calls.push({url,config}); const r=responses.shift(); if(r instanceof Error)throw r; return r || {ok:false,json:async()=>({})};}
  };
  vm.runInNewContext(source,ctx);
  return {dom,calls,redirects,timers,ctx,advance:ms=>{now+=ms},async tick(){const t=[...timers].find(([,v])=>v.ms!==8000);assert.ok(t,'retry scheduled');timers.delete(t[0]);await t[1].fn();await settle();}};
}
(async()=>{
  let a=launch([{ok:true,json:async()=>({ok:true,environment:'staging'})}]);await settle();
  assert.equal(a.redirects[0],'https://burando-v7-staging.onrender.com/?product=TEST#tgWebAppData=secret%26signature&tgWebAppVersion=8.0');
  assert.equal(a.calls[0].url,'https://burando-v7-staging.onrender.com/healthz');
  assert.equal(a.calls[0].config.credentials,'omit');assert.equal(a.calls[0].config.referrerPolicy,'no-referrer');
  assert.equal(a.timers.size,0,'ready app has no artificial delay');
  a=launch([{ok:true,json:async()=>{throw new SyntaxError('Render HTML')}},{ok:true,json:async()=>({ok:true,environment:'production'})},{ok:true,json:async()=>({ok:true,environment:'staging'})}]);await settle();
  assert.equal(a.redirects.length,0);assert.match(a.dom.window.document.getElementById('status').textContent,/tayyorlanmoqda/);
  await a.tick();assert.equal(a.redirects.length,0);await a.tick();assert.equal(a.redirects.length,1);
  a=launch([new Error('network')]);await settle();a.advance(121000);await a.tick();
  assert.equal(a.dom.window.document.getElementById('retry').hidden,false);assert.equal(a.timers.size,0);
  a.dom.window.document.getElementById('language').click();assert.equal(a.dom.window.document.documentElement.lang,'ru');
  a=launch([],{online:false});await settle();assert.equal(a.calls.length,0);assert.equal(a.dom.window.document.getElementById('retry').hidden,false);
  a=launch([new Error('network')]);await settle();a.dom.window.dispatchEvent(new a.dom.window.Event('pagehide'));assert.equal(a.timers.size,0);
  console.log('Entry: instant handoff, cold-start HTML, wrong environment, secret-fragment preservation, network timeout, retry, RU and offline checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
