/* Public staging entrance. No credentials, customer data, trackers or API access. */
(() => {
  'use strict';
  const backend = 'https://burando-v7-staging.onrender.com';
  const copy = {
    uz: {headline:'Yaponiya endi<br>yanada yaqin.',description:'Yaponiyadan original mahsulotlar — BURANDO bilan.',connecting:'Do‘kon bilan bog‘lanmoqdamiz…',waiting:'Do‘kon tayyorlanmoqda. Biroz kuting…',error:'Hozircha ulanib bo‘lmadi. Qayta urinib ko‘ring.',offline:'Internet aloqasini tekshiring va qayta urinib ko‘ring.',retry:'Qayta urinish',test:'TEST MUHITI · Haqiqiy pul yubormang'},
    ru: {headline:'Япония стала<br>ещё ближе.',description:'Оригинальные товары из Японии — вместе с BURANDO.',connecting:'Подключаемся к магазину…',waiting:'Магазин запускается. Пожалуйста, подождите…',error:'Пока не удалось подключиться. Попробуйте ещё раз.',offline:'Проверьте интернет и попробуйте ещё раз.',retry:'Повторить',test:'ТЕСТОВАЯ СРЕДА · Не отправляйте реальные деньги'}
  };
  // The Telegram launch fragment and order access fragment stay in memory only.
  // Forward them unchanged after readiness; never send them in the health request.
  const target = backend + '/' + location.search + location.hash;
  let lang = 'uz', state = 'connecting', timer, controller, generation = 0;
  try { lang = localStorage.getItem('burando_entry_lang') === 'ru' ? 'ru' : 'uz'; } catch (_) {}
  const el = id => document.getElementById(id);
  function paint() {
    const t = copy[lang];
    document.documentElement.lang = lang;
    el('headline').innerHTML = t.headline;
    el('description').textContent = t.description;
    el('status').textContent = t[state];
    el('language').textContent = lang === 'uz' ? 'RU' : 'UZ';
    el('retry').textContent = t.retry;
    el('testNotice').textContent = t.test;
    const failed = state === 'error' || state === 'offline';
    el('retry').hidden = !failed;
    el('spinner').hidden = failed;
  }
  function stop() { generation++; clearTimeout(timer); if (controller) controller.abort(); }
  async function start() {
    stop();
    const run = generation, deadline = Date.now() + 120000;
    let attempts = 0;
    state = 'connecting'; paint();
    async function check() {
      if (run !== generation || document.hidden) return;
      if (navigator.onLine === false) { state = 'offline'; paint(); return; }
      const active = new AbortController();
      controller = active;
      const timeout = setTimeout(() => active.abort(), 8000);
      try {
        const response = await fetch(backend + '/healthz', {mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:active.signal,referrerPolicy:'no-referrer'});
        const data = response.ok && await response.json();
        if (run !== generation) return;
        if (data && data.ok === true && data.environment === 'staging') {
          stop(); location.replace(target); return;
        }
      } catch (_) { /* Render wake-up HTML, timeout and network failures are retried. */ }
      finally { clearTimeout(timeout); }
      if (run !== generation) return;
      state = Date.now() >= deadline ? 'error' : 'waiting'; paint();
      if (state === 'waiting') timer = setTimeout(check, Math.min(2000 + attempts++ * 1000, 6000));
    }
    await check();
  }
  el('retry').addEventListener('click', start);
  el('language').addEventListener('click', () => {
    lang = lang === 'uz' ? 'ru' : 'uz';
    try { localStorage.setItem('burando_entry_lang', lang); } catch (_) {}
    paint();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  window.addEventListener('pagehide', stop);
  start();
})();
