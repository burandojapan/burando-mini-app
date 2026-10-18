/* Optional cross-browser pairing. Telegram identity is validated only on the server. */
(() => {
  const key = 'burando_telegram_link';
  const root = document.createElement('section');
  root.className = 'telegram-connect';
  root.setAttribute('aria-label', 'Telegram');
  document.querySelector('#checkoutForm').prepend(root);
  const text = (uz, ru) => V7.text(uz, ru);
  let pairing = null;
  try { pairing = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (_) {}
  if (pairing && Date.parse(pairing.expires_at) <= Date.now()) pairing = null;
  let account = null, checking = false, starting = false;
  const save = () => pairing ? sessionStorage.setItem(key, JSON.stringify(pairing)) : sessionStorage.removeItem(key);
  const button = (label, fn) => {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.onclick = fn;
    return el;
  };
  const note = value => { const p = document.createElement('p'); p.textContent = value; root.append(p); };
  const request = (path, body) => V7.request('/api/telegram-link/'+path, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  function render() {
    root.replaceChildren();
    // Signed WebApp checkout already attaches the verified identity server-side.
    if (tg?.initData) {
      note(text('Telegram orqali ochilgan — akkaunt buyurtmaga tekshirib biriktiriladi.', 'Открыто через Telegram — аккаунт будет проверен и привязан к заказу.'));
      return;
    }
    if (pairing?.selected && account) {
      note(text('Telegram ulandi: ', 'Telegram подключён: ')+(account.username?'@'+account.username:account.account));
      root.append(button(text('Uzish', 'Отключить'), clear));
    } else if (account) {
      note(text('Shu akkaunt siznikimi? ', 'Это ваш аккаунт? ')+(account.username?'@'+account.username:account.account));
      root.append(button(text('Ha, buyurtmaga ulash', 'Да, привязать к заказу'), () => {
        pairing.selected = true; save(); render();
      }), button(text('Boshqa akkaunt', 'Другой аккаунт'), clear));
    } else if (pairing) {
      note(text('Tasdiqlash kodi: ', 'Код подтверждения: ')+pairing.code);
      note(text('Telegramda shu kodni tekshirib tasdiqlang. Keyin shu do‘konga qayting.', 'Сверьте код в Telegram и подтвердите. Затем вернитесь в этот магазин.'));
      const link = document.createElement('a'); link.href = pairing.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = text('Telegramda ochish ↗', 'Открыть в Telegram ↗');
      root.append(link, button(text('Tasdiqni tekshirish', 'Проверить подтверждение'), () => check(true)), button(text('Bekor qilish', 'Отменить'), clear));
    } else {
      root.append(button(text('Telegramni ulash — buyurtmani kuzatish', 'Подключить Telegram — отслеживать заказ'), start));
      note(text('Ixtiyoriy. Telegramsiz ham buyurtma bera olasiz.', 'Необязательно. Можно заказать и без Telegram.'));
    }
  }
  async function clear() {
    const previous = pairing; pairing = null; account = null; save(); render();
    if (previous) request('revoke', {token:previous.token}).catch(() => {});
  }
  async function start() {
    if (starting) return;
    starting = true;
    try {
      root.querySelector('button').disabled = true;
      pairing = await request('start', {}); account = null; save(); render();
    } catch (e) { showToast(e.message); render(); }
    finally { starting = false; }
  }
  async function check(manual = false) {
    if (!pairing || checking || tg?.initData) return;
    const previous = pairing;
    if (Date.parse(previous.expires_at) <= Date.now()) {
      await clear(); showToast(text('Ulash vaqti tugadi. Qayta ulang yoki Telegramsiz davom eting.', 'Время подключения истекло. Подключите снова или продолжите без Telegram.')); return;
    }
    checking = true;
    try {
      const result = await request('status', {token:previous.token});
      if (pairing !== previous) return;
      if (result.state === 'confirmed') { account = result; render(); }
      else if (manual) showToast(text('Telegramda hali tasdiqlanmagan', 'Ещё не подтверждено в Telegram'));
    } catch (e) {
      // Retain the pairing across temporary connection errors; never silently switch a selected account to guest.
      if (manual) showToast(e.message);
    } finally { checking = false; }
  }
  // Keep the in-progress form in this browser tab for the app switch (30 minutes).
  const draftKey = 'burando_checkout_draft';
  const fields = ['customerName','customerPhone','customerBackupPhone','customerAddress','customerComment'];
  if (!tg?.initData) {
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
      if (draft?.until > Date.now()) for (const id of fields) {
        const input=document.getElementById(id);
        if (!input.value) input.value=String(draft.values[id] || '');
      }
      else sessionStorage.removeItem(draftKey);
    } catch (_) {}
    document.querySelector('#checkoutForm').addEventListener('input', () => {
      sessionStorage.setItem(draftKey,JSON.stringify({until:Date.now()+1800000,
        values:Object.fromEntries(fields.map(id=>[id,document.getElementById(id).value]))}));
    });
  }
  window.BurandoTelegramLink = {
    checkoutDone() { sessionStorage.removeItem(draftKey); },
    async checkoutToken() {
      if (tg?.initData || !pairing?.selected) return '';
      const result = await request('status', {token:pairing.token});
      if (result.state !== 'confirmed') throw Error(text('Telegramni qayta ulang', 'Подключите Telegram снова'));
      return pairing.token;
    }
  };
  const translateBefore = translate;
  translate = function () { translateBefore(); render(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', () => check());
  // Bound polling, only while the checkout is visible. No background timers across hidden pages.
  const timer = setInterval(() => {
    if (!document.hidden && document.querySelector('#checkoutModal').classList.contains('open') && !account) check();
  }, 10000);
  window.addEventListener('pagehide', () => clearInterval(timer), {once:true});
  render(); if (pairing) check();

  async function telegramConfirmation() {
    if (!tg?.initData) return;
    const signedStart = new URLSearchParams(tg.initData).get('start_param') || '';
    if (!/^link_[A-Za-z0-9_-]{43}$/.test(signedStart)) return;
    const proof = {init_data:tg.initData, approval:signedStart.slice(5)};
    const modal = document.createElement('div'); modal.className='modal open telegram-pair-modal';
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','telegramPairTitle');
    const card = document.createElement('div'); card.className='modal-card';
    const title = document.createElement('h2'); title.id='telegramPairTitle'; title.textContent=text('Telegramni do‘konga ulash', 'Подключение Telegram к магазину');
    const copy = document.createElement('p'); const code = document.createElement('strong'); code.className='telegram-pair-code';
    const result = document.createElement('p'); result.setAttribute('role','status');
    const previousOverflow = document.body.style.overflow;
    const close = () => { modal.remove(); document.body.style.overflow = previousOverflow; };
    const cancel = button(text('Bekor qilish', 'Отменить'), close);
    const approve = button(text('Kod mos — tasdiqlayman', 'Код совпадает — подтверждаю'), async () => {
      approve.disabled=true;
      try {
        await request('confirm', proof);
        result.textContent=text('Tasdiqlandi. Instagramdagi do‘konga qayting va akkauntni ulashni yakunlang.', 'Подтверждено. Вернитесь в магазин в Instagram и завершите подключение аккаунта.');
        approve.hidden=true; cancel.textContent=text('Yopish', 'Закрыть');
        if (typeof tg.requestWriteAccess === 'function') {
          try { tg.requestWriteAccess(allowed => {
            if (!allowed) result.textContent += text(' Xabar olish uchun botni ochib Start bosing.', ' Для уведомлений откройте бота и нажмите Start.');
          }); } catch (_) {}
        }
      } catch(e) { result.textContent=e.message; approve.disabled=false; }
    });
    approve.disabled=true;
    card.append(title,copy,code,result,approve,cancel); modal.append(card); document.body.append(modal);
    document.body.style.overflow='hidden'; cancel.focus();
    modal.addEventListener('keydown', e => {
      if (e.key==='Escape') close();
      if(e.key==='Tab') {
        const buttons=[...modal.querySelectorAll('button')].filter(b=>!b.disabled&&!b.hidden);
        if(e.shiftKey&&document.activeElement===buttons[0]) {e.preventDefault();buttons.at(-1).focus();}
        else if(!e.shiftKey&&document.activeElement===buttons.at(-1)) {e.preventDefault();buttons[0].focus();}
      }
    });
    try {
      const data=await request('preview',proof);
      copy.textContent=text('Faqat o‘zingiz Instagram yoki brauzerda boshlagan so‘rovni tasdiqlang. Kod ikkala joyda bir xil bo‘lsin. Akkaunt: ', 'Подтверждайте только запрос, который вы сами начали в Instagram или браузере. Коды должны совпадать. Аккаунт: ')+(data.username?'@'+data.username:data.account);
      code.textContent=data.code; approve.disabled=false;
    } catch(e) {result.textContent=e.message;}
  }
  telegramConfirmation();
})();
