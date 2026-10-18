/* Repair this account's legacy menu and move Telegram launches onto the CDN origin. */
(() => {
  const raw=window.Telegram?.WebApp?.initData;
  if (!raw) return;
  const entry='https://burando-live-entry.onrender.com/';
  const repair=fetch('/api/telegram/entry',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({init_data:raw}),cache:'no-store',signal:AbortSignal.timeout(5000)
  }).then(response=>response.ok?response.json():null).catch(()=>null);
  if(location.origin==='https://burando-mini-app.onrender.com') {
    // Existing guest order credentials stay on their original origin; only Telegram launches move.
    repair.then(result=>{
      if(!result?.cdn_ready) return;
      let hash=location.hash;
      try {
        const cart=localStorage.getItem('burando_cart_v5');
        if(cart && cart!=='{}' && cart.length<=8192) {
          const encoded=encodeURIComponent(cart);
          if(encoded.length<=12000) hash+=(hash?'&':'#')+'burando_cart_handoff='+encoded;
        }
      } catch (_) {}
      location.replace(entry+location.search+hash);
    });
  }
})();
