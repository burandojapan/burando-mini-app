/* Keep the storefront on the CDN origin. Only authenticated API traffic goes to the backend. */
(() => {
  'use strict';
  const backend = 'https://burando-mini-app.onrender.com';
  const nativeFetch = window.fetch.bind(window);
  let lastReady=0;
  const api = window.BurandoLiveStore = {active:false};
  const ns = 'https://telegram.org/js/telegram-web-app.js';
  const validAsset = url => url === ns || (url.startsWith(backend + '/static/') && new URL(url).origin === backend);
  function restoreLegacyCart() {
    const parts=location.hash.slice(1).split('&');
    const raw=new URLSearchParams(location.hash.slice(1)).get('burando_cart_handoff');
    if(raw===null) return;
    try {
      if(raw.length<=8192) {
        const imported=JSON.parse(raw), stored=JSON.parse(localStorage.getItem('burando_cart_v5')||'{}');
        if(imported && !Array.isArray(imported) && typeof imported==='object') {
          const cart=Object.create(null);
          for(const source of [imported,stored]) for(const [key,value] of Object.entries(source||{}).slice(0,100)) {
            const line=typeof value==='number'?{id:key,qty:value}:value;
            if(!line || typeof line.id!=='string' || line.id.length>100 || !Number.isInteger(line.qty) || line.qty<1 || line.qty>99) continue;
            const size=typeof line.size==='string'?line.size.slice(0,100):'',color=typeof line.color==='string'?line.color.slice(0,100):'';
            cart[line.id+'__'+(size||'-')+'__'+(color||'-')]={id:line.id,qty:line.qty,size,color};
          }
          localStorage.setItem('burando_cart_v5',JSON.stringify(cart));
        }
      }
    } catch (_) {}
    const remaining=parts.filter(part=>!part.startsWith('burando_cart_handoff=')).join('&');
    history.replaceState(null,'',location.pathname+location.search+(remaining?'#'+remaining:''));
  }
  const timeout = (promise, ms) => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {timer=setTimeout(() => reject(Error('Asset unavailable')), ms);})]).finally(()=>clearTimeout(timer));
  };
  async function readyForRequest(signal) {
    if (Date.now()-lastReady<45000) return;
    const deadline=Date.now()+120000;
    while(Date.now()<deadline) {
      if(signal?.aborted) throw Error('Request cancelled');
      try {
        const own=AbortSignal.timeout(8000);
        const response=await nativeFetch(backend+'/healthz',{credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:signal?AbortSignal.any([own,signal]):own});
        const data=response.ok && await response.json();
        if(data?.ok===true && data.environment==='production') {lastReady=Date.now();return;}
      } catch (_) {if(signal?.aborted) throw Error('Request cancelled');}
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    throw Error('Do‘kon tayyorlanmoqda. Qayta urinib ko‘ring. / Магазин запускается. Повторите попытку.');
  }

  function showFailure() {
    const panel=document.createElement('section'), title=document.createElement('h1'), message=document.createElement('p'), retry=document.createElement('button');
    title.textContent='BURANDO';
    message.textContent='Do‘konni yuklab bo‘lmadi. Qayta urinib ko‘ring. / Не удалось загрузить магазин. Повторите попытку.';
    retry.textContent='Qayta urinish / Повторить'; retry.type='button'; retry.onclick=()=>location.reload();
    panel.append(title,message,retry); document.body.replaceChildren(panel);
    Object.assign(panel.style,{padding:'32px',fontFamily:'system-ui',lineHeight:'1.6',color:'#172635',background:'#fff',minHeight:'100vh'});
  }

  api.open = async configuredBackend => {
    if (configuredBackend !== backend || api.active) throw Error('Invalid storefront origin');
    api.active=true;
    let attached=false;
    try {
      const response=await nativeFetch(backend+'/shop', {credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),referrerPolicy:'no-referrer'});
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw Error('Storefront unavailable');
      const html=await response.text();
      const doc=new DOMParser().parseFromString(html,'text/html');
      if (!doc.querySelector('#checkoutForm') || !doc.querySelector('#v7Loading') || !doc.querySelector('script[src^="/static/app.js"]')) throw Error('Storefront not ready');
      lastReady=Date.now();
      const scripts=[...doc.querySelectorAll('script')].map(script => {
        const src=script.getAttribute('src');
        if (!src) throw Error('Inline scripts are not allowed');
        const url=new URL(src,backend).href;
        if (!validAsset(url)) throw Error('Unexpected script origin');
        script.remove(); return url;
      });
      for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
        const url=new URL(link.getAttribute('href'),backend).href;
        if (!url.startsWith(backend+'/static/') || new URL(url).origin!==backend) throw Error('Unexpected style origin');
        link.href=url;
      }
      // No browser credentials are sent cross-origin. Checkout identity and order access
      // continue to use the existing validated initData / X-Order-Token contracts.
      window.fetch=async(input, options={}) => {
        if (typeof input==='string' || input instanceof URL) {
          const url=new URL(String(input),location.origin);
          if (url.origin===location.origin && url.pathname.startsWith('/api/')) {
            // Wake with read-only requests first; never replay a checkout or receipt write.
            await readyForRequest(options.signal);
            return nativeFetch(backend+url.pathname+url.search,{...options,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
          }
        }
        return nativeFetch(input,options);
      };
      // Keep the launch hash in the address bar for the Telegram SDK and secure guest links.
      restoreLegacyCart();
      document.documentElement.replaceWith(document.adoptNode(doc.documentElement)); attached=true;
      const curtain=document.createElement('div');curtain.textContent='BURANDO · Yuklanmoqda… / Загрузка…';
      Object.assign(curtain.style,{position:'fixed',inset:'0',zIndex:'99999',display:'grid',placeItems:'center',background:'#172635',color:'white',fontFamily:'system-ui',fontSize:'20px',padding:'24px',textAlign:'center'});
      document.body.append(curtain);
      const css=[...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.sheet ? Promise.resolve() : new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=reject;}));
      await timeout(Promise.all(css),15000);
      const retry=document.querySelector('#v7Retry');
      retry?.removeAttribute('onclick');if(retry) retry.onclick=()=>location.reload();
      for (const src of scripts) {
        await timeout(new Promise((resolve,reject)=>{
          const script=document.createElement('script');script.src=src;script.async=false;
          script.onload=resolve;script.onerror=reject;document.head.append(script);
        }),20000);
      }
      curtain.remove();
    } catch (_) {
      if (attached) {showFailure();return;}
      api.active=false;throw Error('Storefront not ready');
    }
  };
})();
