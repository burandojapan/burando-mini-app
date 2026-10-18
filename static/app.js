const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const T = {
  uz: {
    search: "Mahsulot yoki brend qidiring...",
    All: "Barchasi",
    uniqlo: "👕 UNIQLO",
    shoes: "👟 Oyoq kiyim",
    watches: "⌚ Soat",
    clothes: "👕 Kiyim",
    beauty: "🧴 Kosmetika",
    accessories: "🎒 Aksessuar",
    view: "Ko‘rish",
    add: "Savatga",
    cart: "🛍 Savat",
    total: "Jami",
    checkout: "Buyurtma berish →",
    order: "Buyurtmani rasmiylashtirish",
    checkoutInfo: "Ma'lumotlaringizni kiriting. Keyin to‘lov yo‘riqnomasi ochiladi.",
    name: "Ismingiz",
    phone: "Telefon raqam",
    address: "Yetkazib berish manzili",
    comment: "Izoh",
    confirm: "Buyurtmani tasdiqlash",
    empty: "Savatcha bo‘sh",
    none: "Mahsulot topilmadi",
    remove: "Olib tashlash",
    success: "✅ Buyurtmangiz qabul qilindi!",
    sending: "Yuborilmoqda...",
    size: "O‘lcham",
    color: "Rang",
    selectSize: "O‘lchamni tanlang",
    selectColor: "Rangni tanlang",
    added: "Savatga qo‘shildi",
    detailAdd: "Savatga qo‘shish",
    productsTitle: "Yaponiyadan mahsulotlar",
    heroLabel: "🇯🇵 DIRECT FROM JAPAN",
    heroTitle: "Yaponiya<br>endi yanada yaqin.",
    heroSubtitle: "Yaponiyadan original mahsulotlar",
    badge1: "✓ Original",
    badge2: "🇯🇵 Japan",
    badge3: "✈ Uzbekistan",
    footer: "Japan → Uzbekistan",
    myOrders: "Buyurtmalarim",
    myOrdersInfo: "Buyurtmalaringizni O‘zbekistonga yetib borguncha kuzating.",
    noOrders: "Hali buyurtma yo‘q",
    backupPhone: "Qo‘shimcha telefon (ixtiyoriy)",
    orderCode: "Buyurtma",
    payment: "To‘lov",
    pendingPayment: "Kutilmoqda",
    statuses: {awaiting_payment:"To‘lov kutilmoqda",received:"Buyurtma qabul qilindi",preparing_japan:"Yaponiyada tayyorlanmoqda",shipped_japan:"Yaponiyadan jo‘natildi",in_transit:"Yo‘lda",arrived_uz:"O‘zbekistonga yetib keldi",out_for_delivery:"Yetkazilmoqda",delivered:"Yetkazildi",cancelled:"Bekor qilindi"}
  },
  ru: {
    search: "Найти товар или бренд...",
    All: "Все",
    uniqlo: "👕 UNIQLO",
    shoes: "👟 Обувь",
    watches: "⌚ Часы",
    clothes: "👕 Одежда",
    beauty: "🧴 Косметика",
    accessories: "🎒 Аксессуары",
    view: "Подробнее",
    add: "В корзину",
    cart: "🛍 Корзина",
    total: "Итого",
    checkout: "Оформить заказ →",
    order: "Оформление заказа",
    checkoutInfo: "Введите данные. Затем откроется инструкция по оплате.",
    name: "Ваше имя",
    phone: "Номер телефона",
    address: "Адрес доставки",
    comment: "Комментарий",
    confirm: "Подтвердить заказ",
    empty: "Корзина пуста",
    none: "Товар не найден",
    remove: "Удалить",
    success: "✅ Заказ принят!",
    sending: "Отправка...",
    size: "Размер",
    color: "Цвет",
    selectSize: "Выберите размер",
    selectColor: "Выберите цвет",
    added: "Добавлено в корзину",
    detailAdd: "Добавить в корзину",
    productsTitle: "Товары из Японии",
    heroLabel: "🇯🇵 DIRECT FROM JAPAN",
    heroTitle: "Япония<br>теперь ещё ближе.",
    heroSubtitle: "Оригинальные товары из Японии",
    badge1: "✓ Оригинал",
    badge2: "🇯🇵 Japan",
    badge3: "✈ Uzbekistan",
    footer: "Japan → Uzbekistan",
    myOrders: "Мои заказы",
    myOrdersInfo: "Отслеживайте заказ до его прибытия в Узбекистан.",
    noOrders: "Заказов пока нет",
    backupPhone: "Дополнительный телефон (необязательно)",
    orderCode: "Заказ",
    payment: "Оплата",
    pendingPayment: "Ожидается",
    statuses: {awaiting_payment:"Ожидается оплата",received:"Заказ принят",preparing_japan:"Готовится в Японии",shipped_japan:"Отправлен из Японии",in_transit:"В пути",arrived_uz:"Прибыл в Узбекистан",out_for_delivery:"Передан на доставку",delivered:"Доставлен",cancelled:"Отменён"}
  }
};

let lang = localStorage.getItem("burando_lang") || "uz";
let products = [];
let cart = JSON.parse(localStorage.getItem("burando_cart_v5") || "{}");
let activeCategory = "All";
let detailProduct = null;
let detailSize = "";
let detailColorIndex = 0;
let detailQty = 1;

const $ = s => document.querySelector(s);
const money = n => `$${Number(n).toFixed(2)}`;
const moneyUzs = n => new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {maximumFractionDigits:2}).format(Number(n)) + (lang === 'ru' ? ' сум' : ' so‘m');

async function load() {
  try {
    const response = await fetch("/api/products", { cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("Products load error");
    products = await response.json();
    bind();
    translate();
    renderProducts();
    renderCart();
    document.querySelector('#v7Loading').hidden = true;
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
    const select = document.querySelector('#brandFilter');
    for (const brand of brands) { const option = document.createElement('option'); option.value = brand; option.textContent = brand; select.append(option); }
    for (const size of [...new Set(products.flatMap(p => p.sizes || []))]) { const option = document.createElement('option'); option.value = size; option.textContent = size; document.querySelector('#sizeFilter').append(option); }
    const params = new URLSearchParams(location.search);
    if (params.get('product')) openProduct(params.get('product'));
    if (params.get('category')) setCat(params.get('category'));
  } catch (err) {
    document.querySelector("#v7LoadMessage").textContent = "Ulanib bo‘lmadi. / Не удалось подключиться.";
    document.querySelector("#v7Retry").hidden = false;
    console.error(err);
    $("#products").innerHTML = `<div class="empty">Mahsulotlarni yuklashda xatolik.</div>`;
  }
}

function bind() {
  document.addEventListener('click', catalogAction);
  $("#langBtn").onclick = () => {
    lang = lang === "uz" ? "ru" : "uz";
    localStorage.setItem("burando_lang", lang);
    translate();
    renderProducts();
    renderCart();
    if (detailProduct) renderProductDetail();
  };

  $("#search").oninput = renderProducts;
  $("#cartBtn").onclick = openCart;
  $("#ordersBtn").onclick = openOrders;
  $("#closeOrders").onclick = closeOrders;
  $("#ordersModal").onclick = e => { if (e.target.id === "ordersModal") closeOrders(); };
  $("#closeCart").onclick = closeCart;
  $("#drawerBackdrop").onclick = closeCart;

  $("#checkoutBtn").onclick = () => {
    if (!cartData().length) return;
    closeCart();
    $("#checkoutModal").classList.add("open");
    document.body.style.overflow = "hidden";
  };

  $("#closeCheckout").onclick = closeCheckout;
  $("#checkoutModal").onclick = e => {
    if (e.target.id === "checkoutModal") closeCheckout();
  };

  $("#closeProduct").onclick = closeProduct;
  $("#productModal").onclick = e => {
    if (e.target.id === "productModal") closeProduct();
  };

  $("#detailQtyMinus").onclick = () => {
    detailQty = Math.max(1, detailQty - 1);
    $("#detailQty").textContent = detailQty;
  };
  $("#detailQtyPlus").onclick = () => {
    detailQty = Math.min(99, detailQty + 1);
    $("#detailQty").textContent = detailQty;
  };
  $("#detailAddBtn").onclick = addDetailToCart;
  $("#checkoutForm").onsubmit = submitOrder;
}

function translate() {
  const t = T[lang];
  document.documentElement.lang = lang;
  $("#langBtn").textContent = lang === "uz" ? "UZ / RU" : "RU / UZ";
  $("#search").placeholder = t.search;
  $("#cartTitle").textContent = t.cart;
  $("#totalLabel").textContent = t.total;
  $("#checkoutBtn").textContent = t.checkout;
  $("#checkoutTitle").textContent = t.order;
  $("#checkoutInfo").textContent = t.checkoutInfo;
  $("#nameLabel").textContent = t.name;
  $("#phoneLabel").textContent = t.phone;
  $("#addressLabel").textContent = t.address;
  $("#commentLabel").textContent = t.comment;
  $("#confirmOrder").textContent = t.confirm;
  $("#sizeLabel").textContent = t.size;
  $("#colorLabel").textContent = t.color;
  $("#detailAddBtn").textContent = t.detailAdd;
  $("#sectionProductsTitle").textContent = t.productsTitle;
  $("#heroLabel").textContent = t.heroLabel;
  $("#heroTitle").innerHTML = t.heroTitle;
  $("#heroSubtitle").textContent = t.heroSubtitle;
  $("#heroBadge1").textContent = t.badge1;
  $("#heroBadge2").textContent = t.badge2;
  $("#heroBadge3").textContent = t.badge3;
  $("#footerText").textContent = t.footer;
  $("#ordersBtnText").textContent = t.myOrders;
  $("#ordersTitle").textContent = t.myOrders;
  $("#ordersInfo").textContent = t.myOrdersInfo;
  $("#backupPhoneLabel").textContent = t.backupPhone;
  $("#customerName").placeholder = t.name;
  $("#customerPhone").placeholder = "+998";
  $("#customerAddress").placeholder = lang === "uz" ? "Shahar, tuman, manzil" : "Город, район, адрес";
  $("#customerComment").placeholder = lang === "uz" ? "Qo‘shimcha izoh..." : "Дополнительный комментарий...";
  buildCategories();
}

function buildCategories() {
  const cats = ["All", "uniqlo", "shoes", "watches", "clothes", "beauty", "accessories"];
  const t = T[lang];
  $("#categories").innerHTML = cats.map(c => `
    <button class="category-btn ${c === activeCategory ? "active" : ""}" data-category="${escAttr(c)}">
      ${t[c]}
    </button>
  `).join("");
}

function setCat(category) {
  activeCategory = category;
  buildCategories();
  renderProducts();
}

function title(p) {
  return p?.["title_" + lang] || p?.title || "";
}

function desc(p) {
  return p?.["desc_" + lang] || p?.description || "";
}

function colors(p) {
  return p?.["colors_" + lang] || p?.colors || [];
}

function badge(p) {
  return p?.["badge_" + lang] || "Japan";
}

function renderProducts() {
  const q = $("#search").value.trim().toLowerCase();
  const t = T[lang];

  const list = products.filter(p => {
    const categoryMatch = activeCategory === "All" || p.category === activeCategory;
    const text = `${title(p)} ${desc(p)} ${p.id} ${p.brand || ""}`.toLowerCase();
    return categoryMatch && (!q || text.includes(q));
  });

  $("#products").innerHTML = list.length ? list.map(p => `
    <article class="product-card" data-product-id="${escAttr(p.id)}" data-open-product="${escAttr(p.id)}">
      <div class="product-image-wrap">
        <img src="${escAttr(p.image)}" alt="${escAttr(title(p))}" loading="lazy">
        <span class="product-code">${esc(p.id)}</span>
      </div>
      <div class="product-info">
        <h3>${esc(title(p))}</h3>
        <p>${esc(desc(p))}</p>
        <span class="product-price">${money(p.price)}</span>
        ${p.price_uzs != null ? `<span class="product-price-uzs">${esc(moneyUzs(p.price_uzs))}</span>` : ''}
      </div>
      <button class="add-btn" data-product-id="${escAttr(p.id)}" data-open-product="${escAttr(p.id)}">
        ${t.view} →
      </button>
    </article>
  `).join("") : `<div class="empty">${t.none}</div>`;
}

function openProduct(id) {
  detailProduct = products.find(p => p.id === id);
  if (!detailProduct) return;
  detailSize = detailProduct.sizes?.[0] || "";
  detailColorIndex = 0;
  detailQty = 1;
  renderProductDetail();
  $("#productModal").classList.add("open");
  document.body.style.overflow = "hidden";
  tg?.HapticFeedback?.impactOccurred("light");
}

function renderProductDetail() {
  if (!detailProduct) return;
  const t = T[lang];
  const imgs = detailProduct.images?.length ? detailProduct.images : [detailProduct.image];
  const colorList = colors(detailProduct);

  $("#detailCode").textContent = detailProduct.id;
  $("#detailTitle").textContent = title(detailProduct);
  $("#detailPrice").textContent = money(detailProduct.price);
  if(detailProduct.price_uzs != null){const local=document.createElement('span');local.className='detail-price-uzs';local.textContent=moneyUzs(detailProduct.price_uzs);$('#detailPrice').append(local);}
  $("#detailDesc").textContent = desc(detailProduct);
  $("#detailBadge").textContent = `🇯🇵 ${badge(detailProduct)}`;
  $("#detailMainImage").src = imgs[0];
  $("#detailMainImage").alt = title(detailProduct);
  $("#detailQty").textContent = detailQty;
  $("#detailAddBtn").textContent = t.detailAdd;

  $("#detailThumbs").innerHTML = imgs.map((img, i) => `
    <button class="detail-thumb ${i === 0 ? "active" : ""}" data-detail-image="${i}">
      <img src="${escAttr(img)}" alt="">
    </button>
  `).join("");

  const sizes = detailProduct.sizes || [];
  $("#sizeBlock").style.display = sizes.length ? "block" : "none";
  $("#selectedSizeText").textContent = detailSize || t.selectSize;
  $("#sizeOptions").innerHTML = sizes.map(size => `
    <button class="variant-btn ${size === detailSize ? "active" : ""}" data-detail-size="${escAttr(size)}">
      ${esc(size)}
    </button>
  `).join("");

  $("#colorBlock").style.display = colorList.length ? "block" : "none";
  $("#selectedColorText").textContent = colorList[detailColorIndex] || t.selectColor;
  $("#colorOptions").innerHTML = colorList.map((color, index) => `
    <button class="variant-btn ${index === detailColorIndex ? "active" : ""}" data-detail-color="${index}">
      ${esc(color)}
    </button>
  `).join("");
}

function selectDetailImage(index) {
  const imgs = detailProduct?.images?.length ? detailProduct.images : [detailProduct?.image];
  if (!imgs[index]) return;
  $("#detailMainImage").src = imgs[index];
  document.querySelectorAll(".detail-thumb").forEach((el, i) => el.classList.toggle("active", i === index));
}

function selectSize(size) {
  detailSize = size;
  $("#selectedSizeText").textContent = size;
  document.querySelectorAll("#sizeOptions .variant-btn").forEach(el => el.classList.toggle("active", el.textContent.trim() === size));
}

function selectColor(index) {
  detailColorIndex = index;
  const list = colors(detailProduct);
  $("#selectedColorText").textContent = list[index] || "";
  document.querySelectorAll("#colorOptions .variant-btn").forEach((el, i) => el.classList.toggle("active", i === index));
}

function closeProduct() {
  $("#productModal").classList.remove("open");
  detailProduct = null;
  document.body.style.overflow = "";
}

function addDetailToCart() {
  if (!detailProduct) return;
  const color = colors(detailProduct)[detailColorIndex] || "";
  const key = lineKey(detailProduct.id, detailSize, color);

  if (!cart[key]) {
    cart[key] = {
      id: detailProduct.id,
      qty: 0,
      size: detailSize,
      color
    };
  }
  cart[key].qty = Math.min(99, cart[key].qty + detailQty);
  save();
  renderCart();
  showToast(T[lang].added);
  tg?.HapticFeedback?.notificationOccurred("success");
  closeProduct();
}

function lineKey(id, size, color) {
  return `${id}__${size || "-"}__${color || "-"}`;
}

function save() {
  localStorage.setItem("burando_cart_v5", JSON.stringify(cart));
}

function cartData() {
  return Object.entries(cart).map(([key, line]) => {
    if (typeof line === "number") line = { id: key, qty: line, size: "", color: "" };
    const p = products.find(x => x.id === line.id);
    return p ? { ...p, ...line, key } : null;
  }).filter(Boolean);
}

function changeQty(key, delta) {
  if (!cart[key]) return;
  cart[key].qty = (cart[key].qty || 0) + delta;
  if (cart[key].qty <= 0) delete cart[key];
  save();
  renderCart();
}

function removeItem(key) {
  delete cart[key];
  save();
  renderCart();
}

function renderCart() {
  const list = cartData();
  const t = T[lang];
  const count = list.reduce((sum, x) => sum + x.qty, 0);
  const total = list.reduce((sum, x) => sum + x.price * x.qty, 0);

  $("#cartCount").textContent = count;
  const totalUzs=list.length&&list.every(x=>x.price_uzs!=null)?list.reduce((s,x)=>s+Number(x.price_uzs)*x.qty,0):null;
  $("#cartTotal").innerHTML = `${money(total)}${totalUzs!=null?`<small class="cart-uzs">${esc(moneyUzs(totalUzs))}</small>`:''}`;
  $("#checkoutBtn").disabled = !count;

  $("#cartItems").innerHTML = list.length ? list.map(x => `
    <div class="cart-item">
      <img class="cart-item-image" src="${escAttr(x.image)}" alt="">
      <div class="cart-item-body">
        <h4>${esc(title(x))}</h4>
        <div class="cart-meta">
          ${x.size ? `<span>${esc(t.size)}: <b>${esc(x.size)}</b></span>` : ""}
          ${x.color ? `<span>${esc(t.color)}: <b>${esc(x.color)}</b></span>` : ""}
        </div>
        <div class="qty">
          <button data-cart-key="${escAttr(x.key)}" data-cart-delta="-1">−</button>
          <b>${x.qty}</b>
          <button data-cart-key="${escAttr(x.key)}" data-cart-delta="1">+</button>
        </div>
        <button class="remove" data-remove-item="${escAttr(x.key)}">${t.remove}</button>
      </div>
      <b class="cart-line-total">${money(x.price * x.qty)}${x.price_uzs!=null?`<small class="cart-uzs">${esc(moneyUzs(x.price_uzs*x.qty))}</small>`:''}</b>
    </div>
  `).join("") : `<div class="empty">${t.empty}</div>`;
}

function openCart() {
  $("#cartDrawer").classList.add("open");
  $("#drawerBackdrop").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  $("#cartDrawer").classList.remove("open");
  $("#drawerBackdrop").classList.remove("open");
  document.body.style.overflow = "";
}

function closeCheckout() {
  $("#checkoutModal").classList.remove("open");
  document.body.style.overflow = "";
}

async function submitOrder(e) {
  e.preventDefault();
  const t = T[lang];
  const btn = $("#confirmOrder");
  btn.disabled = true;
  btn.textContent = t.sending;

  const items = cartData().map(x => ({
    id: x.id,
    title: title(x),
    qty: x.qty,
    price: x.price,
    price_uzs: x.price_uzs ?? null,
    size: x.size || "",
    color: x.color || ""
  }));

  const total = items.reduce((sum, x) => sum + x.price * x.qty, 0);
  const payload = {
    customer_name: $("#customerName").value.trim(),
    phone: $("#customerPhone").value.trim(),
    backup_phone: $("#customerBackupPhone").value.trim(),
    address: $("#customerAddress").value.trim(),
    comment: $("#customerComment").value.trim(),
    items,
    total,
    total_uzs:items.every(x=>x.price_uzs!=null)?items.reduce((s,x)=>s+Number(x.price_uzs)*x.qty,0):null,
    language: lang,
    init_data: tg?.initData || ""
  };

  const pending = await V7.pending({...payload, init_data: ''});
  payload.lookup_token = pending.lookup_token;
  payload.idempotency_key = pending.idempotency_key;
  try {
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Error");

    V7.remember(data.order_code, pending.lookup_token);
    localStorage.removeItem('burando_pending_checkout');
    showToast(`${t.success} ${data.order_code || ""}`);
    cart = {};
    save();
    renderCart();
    e.target.reset();
    closeCheckout();
    await V7.payment(data.order_code);
    tg?.HapticFeedback?.notificationOccurred("success");
  } catch (err) {
    alert("❌ " + err.message);
    tg?.HapticFeedback?.notificationOccurred("error");
  } finally {
    btn.disabled = false;
    btn.textContent = t.confirm;
  }
}


function closeOrders() {
  $("#ordersModal").classList.remove("open");
  document.body.style.overflow = "";
}

async function openOrders() {
  const t = T[lang];
  $("#ordersModal").classList.add("open");
  document.body.style.overflow = "hidden";
  $("#ordersList").innerHTML = `<div class="orders-loading">...</div>`;
  try {
    const response = await fetch("/api/telegram/orders", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({init_data:tg?.initData || ""}),cache:"no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Error");
    renderOrders(data);
  } catch (err) {
    $("#ordersList").innerHTML = `<div class="empty">❌ ${esc(err.message)}</div>`;
  }
}

function renderOrders(orders) {
  const t = T[lang];
  if (!orders.length) { $("#ordersList").innerHTML = `<div class="empty">${t.noOrders}</div>`; return; }
  $("#ordersList").innerHTML = orders.map(o => {
    const items = (o.items || []).map(i => `
      <div class="order-item">
        ${i.image ? `<img src="${escAttr(i.image)}" alt="">` : ""}
        <div><b>${esc(i.product_code)}</b><span>${esc(i.title)}</span><small>${i.size ? `${t.size}: ${esc(i.size)} · ` : ""}${i.color ? `${t.color}: ${esc(i.color)} · ` : ""}× ${i.qty}</small></div>
      </div>`).join("");
    const status = t.statuses[o.order_status] || o.order_status;
    return `<section class="order-card">
      <div class="order-head"><div><small>${t.orderCode}</small><b>${esc(o.order_code)}</b></div><strong>$${Number(o.total).toFixed(2)}${o.total_uzs!=null?`<small class="cart-uzs">${esc(moneyUzs(o.total_uzs))}</small>`:''}</strong></div>
      <div class="order-status ${o.order_status === "delivered" ? "done" : ""}">📍 ${esc(status)}</div>
      <div class="order-progress"><span class="active"></span><span class="${["preparing_japan","shipped_japan","in_transit","arrived_uz","out_for_delivery","delivered"].includes(o.order_status)?"active":""}"></span><span class="${["shipped_japan","in_transit","arrived_uz","out_for_delivery","delivered"].includes(o.order_status)?"active":""}"></span><span class="${["arrived_uz","out_for_delivery","delivered"].includes(o.order_status)?"active":""}"></span><span class="${o.order_status==="delivered"?"active":""}"></span></div>
      <div class="order-items">${items}</div>
      <div class="order-foot"><span>${t.payment}: ${o.payment_status === "paid" ? "✅ PAID" : "⏳ " + t.pendingPayment}</span></div>
    </section>`;
  }).join("");
}

let toastTimer;
function showToast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function escAttr(value = "") {
  return esc(value);
}

function escJs(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
}

function catalogAction(event) {
  const el=event.target.closest?.('[data-category],[data-open-product],[data-detail-image],[data-detail-size],[data-detail-color],[data-cart-delta],[data-remove-item]');
  if(!el) return;
  const data=el.dataset;
  if(data.category!==undefined) setCat(data.category);
  else if(data.openProduct!==undefined) openProduct(data.openProduct);
  else if(data.detailImage!==undefined) selectDetailImage(Number(data.detailImage));
  else if(data.detailSize!==undefined) selectSize(data.detailSize);
  else if(data.detailColor!==undefined) selectColor(Number(data.detailColor));
  else if(data.cartDelta!==undefined && ['-1','1'].includes(data.cartDelta)) changeQty(data.cartKey,Number(data.cartDelta));
  else if(data.removeItem!==undefined) removeItem(data.removeItem);
}
document.querySelector('#v7Retry').onclick=()=>location.reload();

window.setCat = setCat;
window.openProduct = openProduct;
window.selectDetailImage = selectDetailImage;
window.selectSize = selectSize;
window.selectColor = selectColor;
window.changeQty = changeQty;
window.removeItem = removeItem;

load();
