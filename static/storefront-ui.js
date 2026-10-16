/* Reuse the store's cart/orders. Only the photo canvas consumes zoom gestures. */
(() => {
  const $ = (s) => document.querySelector(s);
  const nav = $('#bottomNav'), viewer = $('#imageViewer'), stage = $('#viewerStage');
  const image = $('#viewerImage'), mainImage = $('#detailMainImage');
  const text = (uz, ru) => document.documentElement.lang === 'ru' ? ru : uz;
  let previousFocus, previousOverflow, isolated = [], photos = [], index = 0;
  let scale = 1, x = 0, y = 0, gesture, lastTap = 0;
  const pointers = new Map();
  const labels = {home:['Bosh sahifa','Главная'],cart:['Savat','Корзина'],orders:['Buyurtmalar','Заказы'],info:['Ma’lumot','Инфо']};
  function translateUI() {
    nav.setAttribute('aria-label', text('Asosiy menyu','Главное меню'));
    nav.querySelectorAll('button').forEach(b => b.querySelector('span').textContent = text(...labels[b.dataset.page]));
    $('#infoTitle').textContent = text('Ma’lumot','Информация');
    $('#infoDescription').textContent = text('Yaponiya endi yanada yaqin. Yaponiyadan original mahsulotlar.','Япония стала ближе. Оригинальные товары из Японии.');
    mainImage.setAttribute('aria-label',text('Rasmni ochish va kattalashtirish','Открыть и увеличить фото'));
    $('#viewerHint').textContent = text('Ikki barmoq yoki + / − bilan kattalashtiring. Ikki marta bosish: 3×.','Масштабируйте двумя пальцами или + / −. Двойное касание: 3×.');
  }
  function syncNav() {
    const active = $('#cartDrawer').classList.contains('open') ? 'cart' : $('#ordersModal').classList.contains('open') ? 'orders' : $('#infoModal').classList.contains('open') ? 'info' : 'home';
    nav.querySelectorAll('button').forEach(b => {
      if (b.dataset.page === active) b.setAttribute('aria-current','page');
      else b.removeAttribute('aria-current');
    });
    const count = $('#cartCount').textContent;
    $('#bottomCartCount').textContent = count;
    $('#bottomCartCount').hidden = !Number(count);
  }
  nav.onclick = event => {
    const button = event.target.closest('button[data-page]');
    if (!button) return;
    if (button.dataset.page === 'cart') openCart();
    if (button.dataset.page === 'orders') openOrders();
    if (button.dataset.page === 'home') window.scrollTo({top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    if (button.dataset.page === 'info') {
      $('#infoContacts').replaceChildren(...[...$('#v7Contacts').children].map(a=>a.cloneNode(true)));
      $('#infoModal').classList.add('open'); document.body.style.overflow='hidden'; $('#closeInfo').focus();
    }
    syncNav();
  };
  function closeInfo() { $('#infoModal').classList.remove('open'); document.body.style.overflow=''; nav.querySelector('[data-page="info"]').focus(); }
  $('#closeInfo').onclick = closeInfo;
  $('#infoModal').onclick = e => { if(e.target === $('#infoModal')) closeInfo(); };
  new MutationObserver(translateUI).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  for(const selector of ['#cartDrawer','#ordersModal','#infoModal']) new MutationObserver(syncNav).observe($(selector),{attributes:true,attributeFilter:['class']});
  new MutationObserver(syncNav).observe($('#cartCount'),{childList:true,characterData:true,subtree:true});
  function draw() {
    scale = Math.max(1,Math.min(5,scale));
    const maxX = Math.max(0,(image.clientWidth*scale-stage.clientWidth)/2);
    const maxY = Math.max(0,(image.clientHeight*scale-stage.clientHeight)/2);
    x = Math.max(-maxX,Math.min(maxX,x)); y = Math.max(-maxY,Math.min(maxY,y));
    image.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
    $('#viewerReset').textContent=Math.round(scale*100)+'%';
    $('#viewerMinus').disabled=scale<=1; $('#viewerPlus').disabled=scale>=5;
  }
  function reset() { scale=1;x=0;y=0;pointers.clear();gesture=null;lastTap=0;draw(); }
  function showPhoto(delta=0) {
    index=(index+delta+photos.length)%photos.length; reset();
    image.src=photos[index]; image.alt=mainImage.alt;
    $('#viewerCounter').textContent=`${index+1} / ${photos.length}`;
    $('#viewerPrev').hidden=$('#viewerNext').hidden=photos.length<2;
    if(typeof selectDetailImage==='function') selectDetailImage(index);
  }
  function open() {
    if(!mainImage.getAttribute('src')) return;
    const thumbs=[...document.querySelectorAll('.detail-thumb img')];
    photos=thumbs.length?thumbs.map(img=>img.src):[mainImage.src];
    index=Math.max(0,photos.indexOf(mainImage.src));
    previousFocus=mainImage; previousOverflow=document.body.style.overflow;
    isolated=[...document.body.children].filter(el=>el!==viewer&&!['SCRIPT','STYLE'].includes(el.tagName)).map(el=>[el,el.inert]);
    isolated.forEach(([el])=>el.inert=true);
    viewer.hidden=false; document.body.style.overflow='hidden'; showPhoto(); $('#viewerClose').focus();
  }
  function close() {
    viewer.hidden=true; reset(); image.removeAttribute('src');
    isolated.forEach(([el,wasInert])=>el.inert=wasInert); isolated=[];
    document.body.style.overflow=previousOverflow||''; previousFocus?.focus();
  }
  mainImage.tabIndex=0; mainImage.setAttribute('role','button');
  $('#zoomDetail').onclick=open;
  let detailStart;
  mainImage.addEventListener('pointerdown',e=>detailStart={x:e.clientX,y:e.clientY});
  mainImage.addEventListener('click',e=>{ if(!detailStart||Math.hypot(e.clientX-detailStart.x,e.clientY-detailStart.y)<12) open(); detailStart=null; });
  mainImage.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();open();}});
  $('#viewerClose').onclick=close;
  $('#viewerPrev').onclick=()=>showPhoto(-1); $('#viewerNext').onclick=()=>showPhoto(1);
  $('#viewerPlus').onclick=()=>{scale+=.5;draw();}; $('#viewerMinus').onclick=()=>{scale-=.5;draw();}; $('#viewerReset').onclick=reset;
  image.onload=draw;
  image.onerror=()=>$('#viewerHint').textContent=text('Rasm yuklanmadi. Oynani yopib qayta oching.','Фото не загрузилось. Закройте и откройте снова.');
  function rebase() {
    const points=[...pointers.values()];
    if(points.length>=2){
      const rect=stage.getBoundingClientRect();
      const cx=(points[0].x+points[1].x)/2-rect.left-rect.width/2, cy=(points[0].y+points[1].y)/2-rect.top-rect.height/2;
      gesture={distance:Math.max(1,Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)),scale,ax:(cx-x)/scale,ay:(cy-y)/scale,multi:true};
    } else if(points.length) gesture={px:points[0].x,py:points[0].y,x,y,moved:false};
    else gesture=null;
  }
  stage.addEventListener('pointerdown',e=>{e.preventDefault();stage.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});rebase();if(pointers.size>1)lastTap=0;});
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const points=[...pointers.values()];
    if(points.length>=2){
      const rect=stage.getBoundingClientRect();
      scale=Math.max(1,Math.min(5,gesture.scale*Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)/gesture.distance));
      x=(points[0].x+points[1].x)/2-rect.left-rect.width/2-gesture.ax*scale;
      y=(points[0].y+points[1].y)/2-rect.top-rect.height/2-gesture.ay*scale;
    }else{ x=gesture.x+e.clientX-gesture.px;y=gesture.y+e.clientY-gesture.py;if(Math.hypot(e.clientX-gesture.px,e.clientY-gesture.py)>8)gesture.moved=true; }
    draw();
  });
  function release(e) {
    if(!pointers.has(e.pointerId))return;
    if(e.type==='pointerup'&&pointers.size===1&&!gesture?.moved&&!gesture?.multi){
      const now=Date.now();if(now-lastTap<300){scale=scale>1?1:3;x=0;y=0;draw();lastTap=0;}else lastTap=now;
    }else lastTap=0;
    const wasMulti=gesture?.multi;pointers.delete(e.pointerId);rebase();if(wasMulti&&gesture)gesture.moved=true;
  }
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,release);
  stage.addEventListener('dblclick',e=>e.preventDefault());
  // Prevent native page pinch on iOS only within the photo viewer.
  for(const name of ['gesturestart','gesturechange','gestureend'])viewer.addEventListener(name,e=>e.preventDefault(),{passive:false});
  stage.addEventListener('wheel',e=>{e.preventDefault();scale+=e.deltaY<0?.25:-.25;draw();},{passive:false});
  window.addEventListener('resize',()=>{if(!viewer.hidden)draw();});
  document.addEventListener('keydown',e=>{
    if(viewer.hidden){if(e.key==='Escape'&&$('#infoModal').classList.contains('open'))closeInfo();return;}
    if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key==='ArrowLeft')showPhoto(-1);if(e.key==='ArrowRight')showPhoto(1);
    if(e.key==='+'||e.key==='='){scale+=.5;draw();}if(e.key==='-'){scale-=.5;draw();}
    if(e.key==='Tab'){
      const buttons=[...viewer.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled), first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  translateUI();syncNav();
})();
