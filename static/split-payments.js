/* Checkout confirms the frozen server quote before creating an order. */
(() => {
  const cartItems = () => cartData().map(x => ({id:x.id, qty:x.qty, price:x.price, size:x.size||'', color:x.color||''}));
  const key = items => JSON.stringify(items.map(x=>[x.id,x.qty,x.price,x.size||'',x.color||'']).sort());
  let quote, quotedCart, generation=0;
  V7.ensureSplitQuote = async function(items, total) {
    if (!quote || quotedCart!==key(items) || quote.expires_at*1000<=Date.now()) {
      await this.loadSplitQuote();
      throw Error(this.text('Hisob yangilandi. Summalarni tekshirib, yana tasdiqlang.','Расчёт обновлён. Проверьте суммы и подтвердите снова.'));
    }
    if (Number(quote.total_usd)!==Number(total)) throw Error(this.text('Savat o‘zgardi','Корзина изменилась'));
    return quote;
  };
  V7.loadSplitQuote = async function() {
    const root=document.querySelector('#splitQuote'), button=document.querySelector('#confirmOrder');
    const current=++generation, items=cartItems();
    button.disabled=true; quote=null;
    root.textContent=this.text('Kurs va 50/50 summalar hisoblanmoqda…','Рассчитываем курс и платежи 50/50…');
    try {
      const result=await this.request('/api/checkout/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items,total:items.reduce((s,x)=>s+x.qty*x.price,0)})});
      if (current!==generation) return;
      if(key(items)!==key(cartItems())) throw Error(this.text('Savat o‘zgardi. Hisobni yangilang.','Корзина изменилась. Обновите расчёт.'));
      quote=result; quotedCart=key(items);
      root.innerHTML=`<h3>${this.text('50/50 to‘lov','Оплата 50/50')}</h3><p>${this.text('Buyurtma jami','Всего')}: <b>${esc(money(result.total_usd))} · ${esc(moneyUzs(result.total_uzs))}</b></p><p>${this.text('Hozir 50% oldindan','Сейчас предоплата 50%')}: <strong>${esc(moneyUzs(result.deposit_uzs))}</strong></p><p>${this.text('O‘zbekistonga kelganda qolgan 50%','Остальные 50% после прибытия в Узбекистан')}: <b>${esc(moneyUzs(result.balance_uzs))}</b></p><small>1 USD = ${esc(moneyUzs(result.exchange_rate))} · CBU · ${esc(result.exchange_date)}</small><p>${this.text('Mahsulot va yetkazish narxi summaga kiritilgan. Kurs buyurtma uchun saqlanadi. Hisob 15 daqiqa amal qiladi.','Стоимость товара и доставки включена. Курс фиксируется в заказе. Расчёт действует 15 минут.')}</p><label class="split-consent"><input id="splitConsent" type="checkbox" required> <span>${this.text('50% hozir, qolgan 50% O‘zbekistonga kelgandan keyin to‘lashga roziman.','Согласен оплатить 50% сейчас и остальные 50% после прибытия в Узбекистан.')}</span></label><button id="refreshSplitQuote" type="button">↻ ${this.text('Hisobni yangilash','Обновить расчёт')}</button>`;
      root.querySelector('#refreshSplitQuote').onclick=()=>this.loadSplitQuote();
      button.disabled=false;
    } catch(e) {
      if(current!==generation)return;
      root.textContent=e.message;
      const retry=document.createElement('button');retry.type='button';retry.textContent=this.text('Qayta hisoblash','Повторить расчёт');retry.onclick=()=>this.loadSplitQuote();root.append(retry);
    }
  };
})();
