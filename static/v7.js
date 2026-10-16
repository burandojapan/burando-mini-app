/* V7 enhancements: use existing catalog/cart/detail components. */
const V7 = {
  settings: {},
  banners: [],
  bannerIndex: 0,
  bannerPaused: false,
  favorites: new Set(
    JSON.parse(localStorage.getItem("burando_favorites") || "[]"),
  ),
  orders: JSON.parse(localStorage.getItem("burando_order_access") || "[]"),
  text(uz, ru) {
    return lang === "ru" ? ru : uz;
  },
  status(s) {
    return (
      {
        pending: ["To‘lov kutilmoqda", "Ожидается оплата"],
        awaiting_payment: ["To‘lov kutilmoqda", "Ожидается оплата"],
        receipt_submitted: ["Chek yuborildi", "Чек отправлен"],
        under_review: ["Tekshirilmoqda", "На проверке"],
        paid: ["To‘landi", "Оплачено"],
        rejected: ["Rad etildi", "Отклонено"],
      }[s]?.[lang === "ru" ? 1 : 0] || s
    );
  },
  async request(url, options = {}) {
    const r = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json();
    if (!r.ok)
      throw Error(
        typeof data.detail === "string"
          ? data.detail
          : this.text("So‘rovda xatolik", "Ошибка запроса"),
      );
    return data;
  },
  access(code) {
    return this.orders.find((o) => o.code === code);
  },
  remember(code, token) {
    this.orders = this.orders.filter((o) => o.code !== code);
    this.orders.unshift({ code, token });
    localStorage.setItem(
      "burando_order_access",
      JSON.stringify(this.orders.slice(0, 50)),
    );
  },
  toggleFavorite(id) {
    this.favorites.has(id) ? this.favorites.delete(id) : this.favorites.add(id);
    localStorage.setItem(
      "burando_favorites",
      JSON.stringify([...this.favorites]),
    );
    renderProducts();
    if (detailProduct) renderProductDetail();
  },
  async share() {
    if (!detailProduct) return;
    const url = new URL(location.origin);
    url.searchParams.set("product", detailProduct.id);
    try {
      if (navigator.share)
        await navigator.share({ title: title(detailProduct), url: url.href });
      else {
        await navigator.clipboard.writeText(url.href);
        showToast(this.text("Havola nusxalandi", "Ссылка скопирована"));
      }
    } catch (e) {
      if (e.name !== "AbortError")
        showToast(
          this.text("Ulashish imkoni bo‘lmadi", "Не удалось поделиться"),
        );
    }
  },
  async pending(payload) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    const fingerprint = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    let entry = JSON.parse(
      localStorage.getItem("burando_pending_checkout") || "null",
    );
    if (!entry || entry.fingerprint !== fingerprint) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      entry = {
        fingerprint,
        idempotency_key: crypto.randomUUID(),
        lookup_token: Array.from(bytes, (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      };
      localStorage.setItem("burando_pending_checkout", JSON.stringify(entry));
    }
    return entry;
  },
  closePayment() {
    this.paymentGeneration = (this.paymentGeneration || 0) + 1;
    this.paymentCleanup?.(); this.paymentCleanup = null;
    document.querySelector('#paymentModal').classList.remove('open');
    this.paymentIsolation?.forEach(([el,was]) => el.inert = was); this.paymentIsolation = null;
    document.body.style.overflow = document.querySelector('.modal.open, .cart-drawer.open') ? 'hidden' : '';
    if (this.paymentReturnFocus?.isConnected && this.paymentReturnFocus.getClientRects().length) this.paymentReturnFocus.focus();
    else document.querySelector('#bottomNav [data-page="orders"]')?.focus();
  },
  async payment(code) {
    let access = this.access(code);
    if (!access && tg?.initData) {
      const token = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      try {
        await this.request(
          "/api/orders/" + encodeURIComponent(code) + "/access",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              init_data: tg.initData,
              lookup_token: token,
            }),
          },
        );
        this.remember(code, token);
        access = this.access(code);
      } catch (e) {
        showToast(e.message);
        return;
      }
    }
    if (!access) return;
    const modal = document.querySelector("#paymentModal");
    const generation = this.paymentGeneration = (this.paymentGeneration || 0) + 1;
    this.paymentCleanup?.();
    this.paymentCleanup = null;
    if (!modal.classList.contains('open')) {
      this.paymentReturnFocus = document.activeElement;
      this.paymentIsolation = [...document.body.children].filter(el => el !== modal && !['SCRIPT','STYLE'].includes(el.tagName)).map(el => [el, el.inert]);
      this.paymentIsolation.forEach(([el]) => el.inert = true);
    }
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    const root = document.querySelector("#paymentBody");
    root.removeAttribute('aria-busy');
    root.textContent = this.text("Yuklanmoqda…", "Загрузка…");
    document.querySelector('#closePayment').focus();
    try {
      const o = await this.request("/api/orders/" + encodeURIComponent(code), {
        headers: { "X-Order-Token": access.token },
      });
      if (generation !== this.paymentGeneration) return;
      const details =
        this.settings["payment_details_" + lang] ||
        this.text(
          "To‘lov rekvizitlari hali sozlanmagan.",
          "Реквизиты пока не настроены.",
        );
      const editable = ['pending','awaiting_payment','receipt_submitted','rejected'].includes(o.payment_status);
      const paid = o.payment_status === 'paid';
      const current = paid || ['receipt_submitted','under_review'].includes(o.payment_status) ? 3 : o.payment_status === 'rejected' ? 2 : 1;
      const total = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', {minimumFractionDigits:2, maximumFractionDigits:2}).format(Number(o.total));
      const guidance = paid ? this.text('To‘lovingiz tasdiqlandi. Yetkazib berish holatini Buyurtmalar bo‘limida kuzating.','Оплата подтверждена. Следите за доставкой в разделе заказов.')
        : o.payment_status === 'under_review' ? this.text('Chekingiz tekshirilmoqda. Natijani shu yerda kuzating.','Ваш чек проверяется. Следите за результатом здесь.')
        : o.payment_status === 'receipt_submitted' ? this.text('Chek qabul qilindi. To‘lov admin tekshiruvidan keyin tasdiqlanadi.','Чек получен. Оплата подтвердится после проверки администратором.')
        : o.payment_status === 'rejected' ? this.text('Quyidagi sababni tekshiring va to‘g‘ri chekni qayta yuboring.','Проверьте причину ниже и отправьте верный чек повторно.')
        : this.text('To‘lovdan keyin chek rasmini yuboring. Pul tushganini admin tekshirib, to‘lovni tasdiqlaydi.','После оплаты отправьте фото чека. Администратор проверит поступление и подтвердит оплату.');
      root.innerHTML = `
        <header class="payment-heading"><small>${this.text('BUYURTMA','ЗАКАЗ')} · ${esc(o.order_code)}</small><h2 id="paymentTitle">${this.text('To‘lov va chek','Оплата и чек')}</h2></header>
        <ol class="payment-steps">${[this.text('To‘lov','Оплата'),this.text('Chek','Чек'),this.text('Tasdiq','Проверка')].map((label,i)=>`<li class="${i+1<=current?'reached':''}" ${i+1===current?'aria-current="step"':''}><b>${paid?'✓':i+1}</b><span>${label}</span></li>`).join('')}</ol>
        <section class="payment-total"><span>${this.text('Buyurtma summasi','Сумма заказа')}</span><strong class="v7-amount">${esc(total)} <small>USD</small></strong><p class="v7-status" data-status="${escAttr(o.payment_status)}">${esc(this.status(o.payment_status))}</p></section>
        <p class="payment-guidance">${guidance}</p>
        <details class="payment-bank" ${current===1?'open':''} ${paid?'hidden':''}><summary>${this.text('To‘lov ma’lumotlari','Реквизиты для оплаты')}</summary><pre class="v7-details"></pre><button id="copyPayment" type="button">${this.text('Rekvizitlarni nusxalash','Копировать реквизиты')}</button></details>
        <section class="payment-receipt-section"><h3>${this.text(o.has_receipt?'Yuborilgan chek':'Chekni yuklash',o.has_receipt?'Отправленный чек':'Загрузить чек')}</h3><div id="savedReceipt"></div>
          <div class="v7-upload" ${editable?'':'hidden'}><label><span aria-hidden="true">▧</span><b>${this.text('Galereya','Галерея')}</b><small>${this.text('Rasm yoki skrinshot','Фото или скриншот')}</small><input id="receiptGallery" aria-label="${this.text('Galereyadan chek tanlash','Выбрать чек из галереи')}" type="file" accept="image/jpeg,image/png,image/webp"></label><label><span aria-hidden="true">◎</span><b>${this.text('Kamera','Камера')}</b><small>${this.text('Chekni suratga olish','Сфотографировать чек')}</small><input id="receiptCamera" aria-label="${this.text('Chekni suratga olish','Сфотографировать чек')}" type="file" accept="image/*" capture="environment"></label></div>
          <p class="payment-file-help">${editable?this.text('JPEG, PNG, WebP · 5 MB gacha','JPEG, PNG, WebP · до 5 МБ'):this.text('Chek tekshiruvga olingan. Hozir uni almashtirib bo‘lmaydi.','Чек принят на проверку. Заменить его сейчас нельзя.')}</p>
          <div id="receiptPreview" hidden><img id="receiptPreviewImage" alt="${this.text('Tanlangan chek','Выбранный чек')}"><p id="receiptFileName"></p><div class="receipt-preview-actions"><button id="cancelReceipt" type="button">${this.text('Bekor qilish','Отменить')}</button><button id="sendReceipt" type="button">${this.text('Chekni yuborish','Отправить чек')}</button></div></div>
          <p id="receiptFeedback" role="status" aria-live="polite"></p>
        </section>
        <button id="refreshPayment" type="button">↻ ${this.text('Holatni yangilash','Обновить статус')}</button>
        <details class="payment-access"><summary>${this.text('Buyurtma havolasini saqlash','Сохранить ссылку на заказ')}</summary><p>${this.text('Bu maxfiy havola. Uni olgan odam buyurtmaga kira oladi.','Это секретная ссылка. Её получатель получит доступ к заказу.')}</p><button id="copyOrderAccess" type="button">${this.text('Havolani nusxalash','Копировать ссылку')}</button></details>`;
      document.querySelector('#closePayment').focus();
      root.querySelector(".v7-details").textContent = details;
      if (o.has_receipt) {
        const view = document.createElement("button");
        view.textContent = this.text(
          "Yuborilgan chekni ko‘rish",
          "Посмотреть отправленный чек",
        );
        view.onclick = async () => {
          view.disabled = true;
          try {
            const response = await fetch(
              "/api/orders/" + encodeURIComponent(code) + "/receipt",
              { headers: { "X-Order-Token": access.token }, cache: "no-store" },
            );
            if (!response.ok)
              throw Error(
                this.text("Chekni olib bo‘lmadi", "Не удалось загрузить чек"),
              );
            const url = URL.createObjectURL(await response.blob());
            const image = document.createElement("img");
            image.src = url;
            image.alt = this.text("To‘lov cheki", "Платёжный чек");
            image.className = 'payment-saved-image';
            image.onload = () => URL.revokeObjectURL(url);
            if (generation !== this.paymentGeneration) return;
            root.querySelector('#savedReceipt .payment-saved-image')?.remove();
            root.querySelector('#savedReceipt').append(image);
          } catch (e) {
            showToast(e.message);
          } finally {
            view.disabled = false;
          }
        };
        root.querySelector('#savedReceipt').append(view);
      }

      if (o.rejection_reason) {
        const reason = document.createElement("p");
        reason.className = 'payment-rejection';
        reason.textContent = o.rejection_reason;
        root.querySelector('.payment-receipt-section').prepend(reason);
      }
      const copy = async value => {
        try { await navigator.clipboard.writeText(value); showToast(this.text('Nusxalandi','Скопировано')); }
        catch { showToast(this.text('Nusxalab bo‘lmadi. Matnni belgilab nusxalang.','Не удалось скопировать. Выделите текст и скопируйте.')); }
      };
      root.querySelector("#copyPayment").onclick = () => copy(details);
      root.querySelector("#refreshPayment").onclick = () => this.payment(code);
      root.querySelector("#copyOrderAccess").onclick = () =>
        copy(
          location.origin +
            "/#order=" +
            encodeURIComponent(code) +
            "&token=" +
            encodeURIComponent(access.token),
        );
      const locked = ![
        "pending",
        "awaiting_payment",
        "receipt_submitted",
        "rejected",
      ].includes(o.payment_status);
      let selectedFile, previewURL, uploading = false;
      const feedback = root.querySelector('#receiptFeedback');
      const clearPreview = () => {
        selectedFile = null;
        if (previewURL) URL.revokeObjectURL(previewURL);
        previewURL = null;
        if (!root.querySelector('#receiptPreview')) return;
        root.querySelector('#receiptPreview').hidden = true;
        root.querySelector('#receiptPreviewImage').removeAttribute('src');
        root.querySelector('#sendReceipt').disabled = true;
        root.querySelectorAll('input[type=file]').forEach(x => x.value = '');
      };
      this.paymentCleanup = clearPreview;
      root.querySelector('#cancelReceipt').onclick = () => { clearPreview(); feedback.textContent = ''; };
      root.querySelector('#sendReceipt').disabled = true;
      for (const input of root.querySelectorAll("input[type=file]")) {
        input.disabled = locked;
        input.onchange = () => {
          const f = input.files[0];
          if (!f) return;
          clearPreview(); feedback.textContent = '';
          if (
            f.size > 5 * 1024 * 1024 ||
            !["image/jpeg", "image/png", "image/webp"].includes(f.type)
          ) {
            feedback.textContent = this.text(
              "JPEG, PNG yoki WebP, 5 MB gacha. Kamera HEIC bersa JPEG formatiga o‘tkazing.",
              "JPEG, PNG или WebP до 5 МБ. Конвертируйте HEIC в JPEG.",
            );
            return;
          }
          selectedFile = f; previewURL = URL.createObjectURL(f);
          root.querySelector('#receiptPreviewImage').src = previewURL;
          root.querySelector('#receiptFileName').textContent = f.name;
          root.querySelector('#receiptPreview').hidden = false;
          root.querySelector('#sendReceipt').disabled = false;
        };
      }
      root.querySelector('#sendReceipt').onclick = async () => {
        if (!selectedFile || locked || uploading) return;
        uploading = true; root.setAttribute('aria-busy','true');
        root.querySelectorAll('input, #sendReceipt, #cancelReceipt, #refreshPayment').forEach(x => x.disabled = true);
        feedback.textContent = this.text('Chek yuborilmoqda…','Отправляем чек…');
        const form = new FormData(); form.append('file',selectedFile);
        try {
            await this.request(
              "/api/orders/" + encodeURIComponent(code) + "/receipt",
              {
                method: "POST",
                headers: { "X-Order-Token": access.token },
                body: form,
              },
            );
            if (generation === this.paymentGeneration) await this.payment(code);
        } catch (e) {
          if (generation === this.paymentGeneration) feedback.textContent = e.message;
        } finally {
          uploading = false;
          if (generation === this.paymentGeneration) {
            root.removeAttribute('aria-busy');
            root.querySelectorAll('input, #sendReceipt, #cancelReceipt, #refreshPayment').forEach(x => x.disabled = false);
          }
        }
      };
    } catch (e) {
      if (generation !== this.paymentGeneration) return;
      root.textContent = e.message;
      const retry = document.createElement("button");
      retry.textContent = this.text("Qayta urinish", "Повторить");
      retry.onclick = () => this.payment(code);
      root.append(retry);
    }
  },
  renderBanner() {
    const root = document.querySelector("#v7Banner");
    if (!this.banners.length) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const b = this.banners[this.bannerIndex % this.banners.length];
    root.replaceChildren();
    const image = document.createElement("img");
    image.src = b.image;
    image.alt = b["title_" + lang] || "";
    root.append(image);
    const label = document.createElement("strong");
    label.textContent = b["title_" + lang] || "";
    root.append(label);
    if (b.link) {
      const a = document.createElement("a");
      a.href = b.link;
      a.textContent = this.text("Ko‘rish →", "Смотреть →");
      root.append(a);
    }
    const controls = document.createElement("div");
    controls.className = "v7-banner-controls";
    for (const [text, delta] of [
      ["‹", -1],
      ["›", 1],
    ]) {
      const btn = document.createElement("button");
      btn.textContent = text;
      btn.setAttribute(
        "aria-label",
        delta < 0
          ? this.text("Oldingi", "Предыдущий")
          : this.text("Keyingi", "Следующий"),
      );
      btn.onclick = () => {
        this.bannerPaused = true;
        this.bannerIndex =
          (this.bannerIndex + delta + this.banners.length) %
          this.banners.length;
        this.renderBanner();
      };
      controls.append(btn);
    }
    if (this.banners.length > 1) root.append(controls);
    root.onpointerdown = (e) => {
      this.bannerPaused = true;
      this.touchX = e.clientX;
    };
    root.onpointerup = (e) => {
      if (Math.abs(e.clientX - this.touchX) > 40) {
        this.bannerIndex =
          (this.bannerIndex +
            (e.clientX < this.touchX ? 1 : -1) +
            this.banners.length) %
          this.banners.length;
        this.renderBanner();
      }
    };
    root.onfocusin = () => (this.bannerPaused = true);
  },
  translateExtras() {
    document.documentElement.lang = lang;
    document.querySelector("#favoritesFilter").textContent = this.text(
      "♡ Sevimlilar",
      "♡ Избранное",
    );
    document.querySelector("#sortProducts").options[0].text = this.text(
      "Yangi kelganlar",
      "Новинки",
    );
    document.querySelector("#sortProducts").options[1].text = this.text(
      "Narx: arzonroq",
      "Цена: по возрастанию",
    );
    document.querySelector("#sortProducts").options[2].text = this.text(
      "Narx: qimmatroq",
      "Цена: по убыванию",
    );
    document.querySelector("#brandFilter").options[0].text = this.text(
      "Barcha brendlar",
      "Все бренды",
    );
    document.querySelector("#sizeFilter").options[0].text = this.text(
      "Barcha razmerlar",
      "Все размеры",
    );
    this.renderBanner();
  },
  async boot() {
    const results = await Promise.allSettled([
      this.request("/api/settings"),
      this.request("/api/banners"),
    ]);
    if (results[0].status === "fulfilled") this.settings = results[0].value;
    if (results[1].status === "fulfilled") this.banners = results[1].value;
    const contacts = document.querySelector("#v7Contacts");
    for (const [key, label] of [
      ["instagram_url", "Instagram"],
      ["telegram_url", "Telegram"],
    ]) {
      const value = this.settings[key];
      if (!value) continue;
      const a = document.createElement("a");
      a.href = value;
      a.textContent = label;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      contacts.append(a);
      document.querySelector("#v7TopContacts").append(a.cloneNode(true));
    }
    this.renderBanner();
    setInterval(() => {
      if (
        !this.bannerPaused &&
        !document.hidden &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        this.bannerIndex++;
        this.renderBanner();
      }
    }, 7000);
    document.querySelector("#favoritesFilter").onclick = (e) => {
      e.target.classList.toggle("selected");
      renderProducts();
    };
    document.querySelector("#sortProducts").onchange = renderProducts;
    document.querySelector("#brandFilter").onchange = renderProducts;
    document.querySelector("#sizeFilter").onchange = renderProducts;
    document.querySelector("#minPrice").oninput = renderProducts;
    document.querySelector("#maxPrice").oninput = renderProducts;
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.get("order") && params.get("token")) {
      this.remember(params.get("order"), params.get("token"));
      history.replaceState(null, "", location.pathname + location.search);
      await this.payment(params.get("order"));
    }
  },
};
window.V7 = V7;
document.querySelector('#closePayment').addEventListener('click',()=>V7.closePayment());
document.querySelector('#paymentModal').addEventListener('click',e=>{if(e.target.id==='paymentModal')V7.closePayment();});
document.addEventListener('keydown',e=>{
  const modal=document.querySelector('#paymentModal');if(!modal.classList.contains('open'))return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();V7.closePayment();}
  if(e.key==='Tab'){
    const controls=[...modal.querySelectorAll('button,input,summary')].filter(el=>!el.disabled&&el.getClientRects().length);
    const first=controls[0]||document.querySelector('#closePayment'),last=controls.at(-1)||first;
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
const originalRender = renderProducts;
renderProducts = function () {
  const old = products;
  const favorites = document
    .querySelector("#favoritesFilter")
    ?.classList.contains("selected");
  const brand = document.querySelector("#brandFilter")?.value;
  const size = document.querySelector("#sizeFilter")?.value;
  const min = document.querySelector("#minPrice")?.value;
  const max = document.querySelector("#maxPrice")?.value;
  products = old.filter(
    (p) =>
      (!favorites || V7.favorites.has(p.id)) &&
      (!brand || p.brand === brand) &&
      (!size || p.sizes?.includes(size)) &&
      (!min || p.price >= Number(min)) &&
      (!max || p.price <= Number(max)),
  );
  const sort = document.querySelector("#sortProducts")?.value;
  if (sort === "asc") products.sort((a, b) => a.price - b.price);
  if (sort === "desc") products.sort((a, b) => b.price - a.price);
  const category = activeCategory;
  if (category === "sale") {
    products = products.filter((p) => p.is_sale);
    activeCategory = "All";
  }
  originalRender();
  products = old;
  activeCategory = category;
  document.querySelectorAll(".product-card").forEach((card) => {
    const id = card.querySelector(".product-code").textContent;
    const p = products.find((p) => p.id === id);
    if (!p) return;
    const fav = document.createElement("button");
    fav.className = "v7-favorite";
    fav.textContent = V7.favorites.has(id) ? "♥" : "♡";
    fav.setAttribute("aria-label", V7.text("Sevimlilarga", "В избранное"));
    fav.onclick = (e) => {
      e.stopPropagation();
      V7.toggleFavorite(id);
    };
    card.querySelector(".product-image-wrap").append(fav);
    if (p.is_sale) {
      const badge = document.createElement("span");
      badge.className = "v7-sale";
      badge.textContent = "−" + p.discount_percent + "%";
      card.querySelector(".product-image-wrap").append(badge);
      const old = document.createElement("del");
      old.textContent = money(p.original_price);
      card.querySelector(".product-price").append(" ", old);
    }
  });
};
const originalCategories = buildCategories;
buildCategories = function () {
  originalCategories();
  const btn = document.createElement("button");
  btn.className = "category-btn " + (activeCategory === "sale" ? "active" : "");
  btn.textContent = "SALE";
  btn.onclick = () => setCat("sale");
  document.querySelector("#categories").append(btn);
};
const originalDetail = renderProductDetail;
renderProductDetail = function () {
  originalDetail();
  let actions = document.querySelector("#v7DetailActions");
  if (!actions) {
    actions = document.createElement("div");
    actions.id = "v7DetailActions";
    actions.className = "v7-actions";
    document.querySelector(".detail-content").append(actions);
  }
  actions.replaceChildren();
  for (const [label, fn] of [
    [V7.text("Ulashish ↗", "Поделиться ↗"), () => V7.share()],
    [
      V7.favorites.has(detailProduct.id) ? "♥" : "♡",
      () => V7.toggleFavorite(detailProduct.id),
    ],
  ]) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = fn;
    actions.append(b);
  }
};
const originalTranslate = translate;
translate = function () {
  originalTranslate();
  V7.translateExtras();
};
const originalOrders = renderOrders;
renderOrders = function (orders) {
  originalOrders(orders);
  document.querySelectorAll(".order-card").forEach((el, i) => {
    const o = orders[i];
    el.querySelector(".order-foot").textContent = V7.status(o.payment_status);
    if (V7.access(o.order_code) || tg?.initData) {
      const b = document.createElement("button");
      b.textContent = V7.text("To‘lov va chek", "Оплата и чек");
      b.onclick = () => V7.payment(o.order_code);
      el.append(b);
    }
  });
};
const telegramOrders = openOrders;
openOrders = async function () {
  if (tg?.initData) {
    await telegramOrders();
    return;
  }
  document.querySelector("#ordersModal").classList.add("open");
  document.body.style.overflow = "hidden";
  document.querySelector("#ordersList").textContent = V7.text(
    "Yuklanmoqda…",
    "Загрузка…",
  );
  const result = await Promise.allSettled(
    V7.orders.map((o) =>
      V7.request("/api/orders/" + encodeURIComponent(o.code), {
        headers: { "X-Order-Token": o.token },
      }),
    ),
  );
  renderOrders(
    result.filter((x) => x.status === "fulfilled").map((x) => x.value),
  );
  if (result.some((x) => x.status === "rejected")) {
    const p = document.createElement("p");
    p.textContent = V7.text(
      "Ayrim buyurtmalar yuklanmadi. Qayta urinib ko‘ring.",
      "Некоторые заказы не загрузились. Повторите попытку.",
    );
    document.querySelector("#ordersList").append(p);
  }
};
V7.boot();

let detailTouchX = 0;
document
  .querySelector("#detailMainImage")
  .addEventListener(
    "touchstart",
    (e) => (detailTouchX = e.changedTouches[0].clientX),
    { passive: true },
  );
document.querySelector("#detailMainImage").addEventListener(
  "touchend",
  (e) => {
    const delta = e.changedTouches[0].clientX - detailTouchX;
    if (Math.abs(delta) < 40 || !detailProduct) return;
    const thumbs = [...document.querySelectorAll(".detail-thumb")];
    const index = thumbs.findIndex((el) => el.classList.contains("active"));
    selectDetailImage(
      (index + (delta < 0 ? 1 : -1) + thumbs.length) % thumbs.length,
    );
  },
  { passive: true },
);
