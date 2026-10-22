/* Reuse the store's cart/orders. Only the photo canvas consumes zoom gestures. */
(() => {
  const $ = (s) => document.querySelector(s);
  const nav = $('#bottomNav'), viewer = $('#imageViewer'), stage = $('#viewerStage');
  const image = $('#viewerImage'), mainImage = $('#detailMainImage');
  const text = (uz, ru) => document.documentElement.lang === 'ru' ? ru : uz;
  let previousFocus, previousOverflow, isolated = [], photos = [], index = 0;
  let scale = 1, x = 0, y = 0, gesture, lastTap = 0, hadPinch = false;
  const pointers = new Map();
  const labels = {home:['Bosh sahifa','Главная'],cart:['Savat','Корзина'],orders:['Buyurtmalar','Заказы'],info:['Ma’lumot','Инфо']};
  function infoContacts() {
    const container = $('#infoContacts'); container.replaceChildren();
    for (const [key, label] of [
      ['telegram_url', text('Adminga yozish ↗','Написать администратору ↗')],
      ['instagram_url','Instagram ↗']
    ]) {
      const value = V7.settings[key];
      if (!value) continue;
      const a=document.createElement('a'); a.href=value; a.textContent=label;
      a.target='_blank'; a.rel='noopener noreferrer'; container.append(a);
    }
    $('#infoContactUnavailable').hidden = !!V7.settings.telegram_url;
    $('#infoContactUnavailable').textContent=text('Adminning Telegram havolasi hozircha ko‘rsatilmagan. Buyurtmada bog‘lanish uchun to‘g‘ri telefon raqamingizni kiriting.','Ссылка администратора в Telegram пока не указана. Укажите верный номер телефона при оформлении заказа.');
  }
  function translateUI() {
    nav.setAttribute('aria-label', text('Asosiy menyu','Главное меню'));
    nav.querySelectorAll('button').forEach(b => b.querySelector('span').textContent = text(...labels[b.dataset.page]));
    $('#infoTitle').textContent = text('Buyurtma va yordam','Заказ и помощь');
    $('#infoDescription').textContent = text('Yaponiyadan original mahsulotlar.','Оригинальные товары из Японии.');
    $('#infoContactTitle').textContent=text('Savolingiz bormi?','Есть вопросы?');
    $('#infoHowTitle').textContent=text('Qanday buyurtma beriladi?','Как оформить заказ?');
    const steps = [
      [['Mahsulotni tanlang','Выберите товар'],['O‘lcham va rangni tanlab, savatga qo‘shing.','Выберите размер, цвет и добавьте товар в корзину.']],
      [['Buyurtma bering','Оформите заказ'],['Savatni tekshiring. Ism, telefon va manzilni yozib, buyurtmani tasdiqlang.','Проверьте корзину. Укажите имя, телефон, адрес и подтвердите заказ.']],
      [['To‘lang va chekni yuboring','Оплатите и отправьте чек'],['Checkoutdagi saqlangan kursda 50% oldindan to‘lang va chekni yuklang. Qolgan 50% — O‘zbekistonga kelganda.','Внесите предоплату 50% по зафиксированному курсу и загрузите чек. Остаток — после прибытия в Узбекистан.']],
      [['Buyurtmangizni kuzating','Следите за заказом'],['Admin to‘lovni tekshiradi. Keyingi holatlarni «Buyurtmalar» bo‘limidan ko‘rasiz.','Администратор проверит оплату. Дальнейшие статусы смотрите в разделе «Заказы».']]
    ];
    $('#infoHowSteps').replaceChildren(...steps.map(([title, description]) => {
      const li=document.createElement('li'), strong=document.createElement('strong'), span=document.createElement('span');
      strong.textContent=text(...title);span.textContent=text(...description);li.append(strong,span);return li;
    }));
    $('#infoPaymentNote').textContent=text('Chek yuborish to‘lov tasdig‘i emas. Admin hisobga pul tushganini tekshiradi.','Загрузка чека не подтверждает оплату. Администратор проверит поступление денег.');
    $('#infoMoreTitle').textContent=text('Ko‘p so‘raladigan savollar','Частые вопросы');
    $('#infoReceiptTitle').textContent=text('Chekni qanday yuboraman?','Как отправить чек?');
    $('#infoReceiptDescription').textContent=text('To‘lov sahifasida galereyadan rasm yoki skrinshot tanlang, yoki kamera bilan oling. JPEG, PNG, WebP — 5 MB gacha. Tekshirish boshlanmaguncha chekni almashtirishingiz mumkin. Rekvizitlar ko‘rsatilmagan bo‘lsa, avval adminga yozing. TESTda haqiqiy pul yubormang.','На странице оплаты выберите фото или скриншот из галереи либо сделайте снимок камерой. JPEG, PNG, WebP — до 5 МБ. До начала проверки чек можно заменить. Если реквизиты не указаны, сначала напишите администратору. Не отправляйте реальные деньги в TEST.');
    $('#infoTrackingTitle').textContent=text('Buyurtmamni qayerdan topaman?','Где найти мой заказ?');
    $('#infoTrackingDescription').textContent=text('Pastdagi «Buyurtmalar»ni bosing. Telegramdan kirgan bo‘lsangiz, buyurtma akkauntingizga bog‘lanadi. Brauzerda esa o‘sha qurilma va brauzerdan foydalaning yoki to‘lov sahifasidagi maxfiy havolani saqlang. Uni boshqalarga bermang. Instagramdan kirganda Telegramni ulash ixtiyoriy.','Нажмите «Заказы» внизу. При входе через Telegram заказ привязывается к аккаунту. В браузере используйте то же устройство и браузер или сохраните личную ссылку со страницы оплаты. Никому её не передавайте. При входе из Instagram подключение Telegram необязательно.');
    $('#infoNotificationsTitle').textContent=text('Telegram xabarlariga ruxsat nima uchun?','Зачем разрешать сообщения Telegram?');
    $('#infoNotificationsDescription').textContent=text('Bot buyurtma holatini shaxsiy chattingizga yubora olishi uchun. Boshqa yozishmalar va kontaktlaringizga kirish bermaydi. Xabarlar do‘kon bildirishnomalari yoqilganida keladi. Ruxsat bermasangiz ham holatni «Buyurtmalar»da ko‘rasiz.','Чтобы бот мог писать вам о статусе заказа. Доступа к другим перепискам и контактам это не даёт. Сообщения приходят, когда уведомления магазина включены. Без разрешения статус всё равно можно смотреть в разделе «Заказы».');
    $('#infoDeliveryTitle').textContent=text('Yetkazish muddati va narxi qancha?','Сколько стоит доставка и каковы сроки?');
    $('#infoDeliveryDescription').textContent=text('Muddati va narxini to‘lovdan oldin admin bilan aniqlashtiring. Quyidagi «Adminga yozish» tugmasidan foydalaning.','Уточните сроки и стоимость у администратора до оплаты. Используйте кнопку «Написать администратору» ниже.');
    infoContacts();
    mainImage.setAttribute('aria-label',text('Rasmni ochish va kattalashtirish','Открыть и увеличить фото'));
    $('#viewerHint').textContent = text('Surib almashtiring. Ikki barmoq bilan kattalashtiring. Ikki marta bosing: 3× / asl holat.','Листайте свайпом. Масштабируйте двумя пальцами. Двойное касание: 3× / исходный размер.');
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
      infoContacts();
      $('#infoModal').classList.add('open'); document.body.style.overflow='hidden'; $('#closeInfo').focus();
    }
    syncNav();
  };
  function closeInfo() { $('#infoModal').classList.remove('open'); document.body.style.overflow=''; nav.querySelector('[data-page="info"]').focus(); }
  $('#closeInfo').onclick = closeInfo;
  document.addEventListener('burando:settings', infoContacts);
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
  }
  function reset() { scale=1;x=0;y=0;pointers.clear();gesture=null;lastTap=0;hadPinch=false;draw(); }
  function showPhoto(delta=0) {
    index=(index+delta+photos.length)%photos.length; reset();
    image.src=photos[index]; image.alt=mainImage.alt;
    $('#viewerCounter').textContent=`${index+1} / ${photos.length}`;
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
    translateUI(); viewer.hidden=false; document.body.style.overflow='hidden'; showPhoto(); $('#viewerClose').focus();
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
  image.onload=draw;
  image.onerror=()=>$('#viewerHint').textContent=text('Rasm yuklanmadi. Oynani yopib qayta oching.','Фото не загрузилось. Закройте и откройте снова.');
  function rebase() {
    const points=[...pointers.values()];
    if(points.length>=2){
      hadPinch=true;
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
    const dx=e.clientX-gesture?.px, dy=e.clientY-gesture?.py;
    if(e.type==='pointerup'&&pointers.size===1&&!hadPinch&&scale===1&&Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)*1.4){
      showPhoto(dx<0?1:-1);return;
    }
    if(e.type==='pointerup'&&pointers.size===1&&!hadPinch&&!gesture?.moved&&!gesture?.multi){
      const now=Date.now();if(now-lastTap<300){scale=scale>1?1:3;x=0;y=0;draw();lastTap=0;}else lastTap=now;
    }else lastTap=0;
    const wasMulti=gesture?.multi;pointers.delete(e.pointerId);rebase();if(wasMulti&&gesture)gesture.moved=true;if(!pointers.size)hadPinch=false;
  }
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,release);
  stage.addEventListener('dblclick',e=>e.preventDefault());
  // Keep the storefront viewport fixed during touch pinch. The image canvas
  // implements its own PointerEvent zoom; single-finger page scroll stays native.
  function blockPagePinch(e) {
    if(e.touches?.length > 1 && (viewer.hidden || !stage.contains(e.target))) e.preventDefault();
  }
  for(const name of ['touchstart','touchmove']) document.addEventListener(name,blockPagePinch,{passive:false,capture:true});
  // iOS WebViews also emit proprietary native viewport gesture events.
  for(const name of ['gesturestart','gesturechange','gestureend']) document.addEventListener(name,e=>e.preventDefault(),{passive:false,capture:true});
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
