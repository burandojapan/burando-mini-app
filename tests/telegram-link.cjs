const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
async function scenario(inside=false){
 const dom=new JSDOM('<form id="checkoutForm"><input id="customerName"><input id="customerPhone"><input id="customerBackupPhone"><input id="customerAddress"><input id="customerComment"></form><div id="checkoutModal"></div>',{url:'https://synthetic.invalid/shop',runScripts:'outside-only'});
 const w=dom.window, calls=[];let confirmed=false,closed=false;
 const launch=new URLSearchParams({start_param:'link_'+'a'.repeat(43)}).toString();
 w.eval('var lang="uz";function translate(){};function showToast(){};var tg={initData:'+JSON.stringify(inside?launch:'')+',requestWriteAccess:callback=>callback(false)};var V7={text:(u,r)=>lang==="ru"?r:u,request:(url,options)=>window.fakeRequest(url,options)};');
 w.fakeRequest=async(url,opts)=>{
  calls.push([url,JSON.parse(opts.body)]);
  if(url.endsWith('/start'))return{token:'b'.repeat(64),url:'https://t.me/burando_news_bot?startapp=link_'+'a'.repeat(43),code:'123456',expires_at:new Date(Date.now()+1800000).toISOString()};
  if(url.endsWith('/preview'))return{code:'123456',account:'<script>untrusted</script>',username:'synthetic'};
  if(url.endsWith('/confirm'))return{ok:true};
  if(url.endsWith('/revoke'))return{ok:true};
  if(url.endsWith('/status'))return confirmed?{state:'confirmed',account:'Synthetic',username:'synthetic'}:{state:'pending'};
  throw Error('Unexpected request');
 };
 w.eval(fs.readFileSync('static/telegram-link.js','utf8'));
 const settle=()=>new Promise(r=>setTimeout(r,5)); await settle();
 if(inside){
  const modal=w.document.querySelector('.telegram-pair-modal');assert.ok(modal);
  assert.match(modal.textContent,/123456/);
  assert.equal(calls.filter(([u])=>u.endsWith('/confirm')).length,0,'opening a link never confirms automatically');
  modal.querySelector('button').click();await settle();
  assert.equal(calls.filter(([u])=>u.endsWith('/confirm')).length,1);
  assert.equal(calls.find(([u])=>u.endsWith('/confirm'))[1].init_data,launch);
  assert.match(modal.textContent,/Instagram/);assert.match(modal.textContent,/Start/);
  modal.querySelectorAll('button')[1].click();assert.equal(w.document.querySelector('.telegram-pair-modal'),null);
 }else{
  const root=w.document.querySelector('.telegram-connect');
  assert.equal(await w.BurandoTelegramLink.checkoutToken(),'');
  root.querySelector('button').click();await settle();
  assert.match(root.textContent,/123456/);assert.equal(root.querySelector('a').target,'_blank');
  confirmed=true;w.dispatchEvent(new w.Event('focus'));await settle();
  assert.equal(await w.BurandoTelegramLink.checkoutToken(),'','browser account acceptance is explicit');
  root.querySelector('button').click();assert.equal(await w.BurandoTelegramLink.checkoutToken(),'b'.repeat(64));
  root.querySelector('button').click();await settle();
  assert.equal(await w.BurandoTelegramLink.checkoutToken(),'');assert.equal(w.sessionStorage.getItem('burando_telegram_link'),null);
  assert.ok(calls.some(([u])=>u.endsWith('/revoke')));
  w.eval('lang="ru";translate()');assert.match(root.textContent,/Подключить/);
 }
 dom.window.close();
}
(async()=>{await scenario();await scenario(true);console.log('Telegram pairing UI: guest fallback, explicit double confirmation, signed launch handoff, cancellation, permission refusal and UZ/RU PASS');})().catch(e=>{console.error(e);process.exit(1)});
