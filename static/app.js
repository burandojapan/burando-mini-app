const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();

  // Telegram Mini App'ni pastga swipe bilan yopish/minimize qilish
  try {
    if (typeof tg.enableVerticalSwipes === "function") {
      tg.enableVerticalSwipes();
    }
  } catch (e) {
    console.warn("Vertical swipes:", e);
  }
}

const T = {
  uz: {
    search: "Mahsulot yoki brend qidiring...",
    All: "Barchasi",
    uniqlo: "🇯🇵 UNIQLO",
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
    checkoutInfo: "Ma'lumotlaringizni kiriting. Buyurtmangizni Telegram orqali qabul qilamiz.",
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
    share: "↗️ Ulashish",
    productsTitle: "Yaponiyadan mahsulotlar",
    heroLabel: "🇯🇵 DIRECT FROM JAPAN",
    heroTitle: "Yaponiya<br>endi yanada yaqin.",
    heroSubtitle: "Yaponiyadan original mahsulotlar",
    badge1: "✓ Original",
    badge2: "🇯🇵 Japan",
    badge3: "✈ Uzbekistan",
    footer: "Japan → Uzbekistan"
  },
  ru: {
    search: "Найти товар или бренд...",
    All: "Все",
    uniqlo: "🇯🇵 UNIQLO",
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
    checkoutInfo: "Введите данные. Мы получим ваш заказ в Telegram.",
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
    share: "↗️ Поделиться",
    productsTitle: "Товары из Японии",
    heroLabel: "🇯🇵 DIRECT FROM JAPAN",
    heroTitle: "Япония<br>теперь ещё ближе.",
    heroSubtitle: "Оригинальные товары из Японии",
    badge1: "✓ Оригинал",
    badge2: "🇯🇵 Japan",
    badge3: "✈ Uzbekistan",
    footer: "Japan → Uzbekistan"
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

async function load() {
  try {
    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) throw new Error("Products load error");
    products = await response.json();
    bind();
    translate();
    renderProducts();
    renderCart();
    openProductFromLink();
  } catch (err) {
    console.error(err);
    $("#products").innerHTML = `<div class="empty">Mahsulotlarni yuklashda xatolik.</div>`;
  }
}

function bind() {
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
  const shareBtn = $("#detailShareBtn");
  if (shareBtn) shareBtn.textContent = t.share || (lang === "uz" ? "↗️ Ulashish" : "↗️ Поделиться");
  $("#sectionProductsTitle").textContent = t.productsTitle;
  $("#heroLabel").textContent = t.heroLabel;
  $("#heroTitle").innerHTML = t.heroTitle;
  $("#heroSubtitle").textContent = t.heroSubtitle;
  $("#heroBadge1").textContent = t.badge1;
  $("#heroBadge2").textContent = t.badge2;
  $("#heroBadge3").textContent = t.badge3;
  $("#footerText").textContent = t.footer;
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
    <button class="category-btn ${c === activeCategory ? "active" : ""}" onclick="setCat('${c}')">
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
    const rawCategory = String(p.category || "").toLowerCase();
    const productText = `${p.brand || ""} ${p.source || ""} ${title(p)} ${desc(p)}`.toLowerCase();

    let categoryMatch = activeCategory === "All";

    if (activeCategory === "uniqlo") {
      categoryMatch =
        String(p.brand || "").toLowerCase() === "uniqlo" ||
        String(p.source || "").toLowerCase().includes("uniqlo") ||
        productText.includes("uniqlo");
    } else if (activeCategory === "clothes") {
      categoryMatch = ["clothes", "clothing"].includes(rawCategory);
    } else if (activeCategory === "watches") {
      categoryMatch = ["watch", "watches"].includes(rawCategory);
    } else if (activeCategory !== "All") {
      categoryMatch = rawCategory === activeCategory;
    }
    const text = `${title(p)} ${desc(p)} ${p.id}`.toLowerCase();
    return categoryMatch && (!q || text.includes(q));
  });

  $("#products").innerHTML = list.length ? list.map(p => `
    <article class="product-card" onclick="openProduct('${p.id}')">
      <div class="product-image-wrap">
        <img src="${escAttr(p.image)}" alt="${escAttr(title(p))}" loading="lazy">
        <span class="product-code">${esc(p.id)}</span>
      </div>
      <div class="product-info">
        <h3>${esc(title(p))}</h3>
        <p>${esc(desc(p))}</p>
        <span class="product-price">${money(p.price)}</span>
      </div>
      <button class="add-btn" onclick="event.stopPropagation(); openProduct('${p.id}')">
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
  $("#detailDesc").textContent = desc(detailProduct);
  $("#detailBadge").textContent = `🇯🇵 ${badge(detailProduct)}`;
  $("#detailMainImage").src = imgs[0];
  $("#detailMainImage").alt = title(detailProduct);
  $("#detailQty").textContent = detailQty;
  $("#detailAddBtn").textContent = t.detailAdd;

  $("#detailThumbs").innerHTML = imgs.map((img, i) => `
    <button class="detail-thumb ${i === 0 ? "active" : ""}" onclick="selectDetailImage(${i})">
      <img src="${escAttr(img)}" alt="">
    </button>
  `).join("");

  const sizes = detailProduct.sizes || [];
  $("#sizeBlock").style.display = sizes.length ? "block" : "none";
  $("#selectedSizeText").textContent = detailSize || t.selectSize;
  $("#sizeOptions").innerHTML = sizes.map(size => `
    <button class="variant-btn ${size === detailSize ? "active" : ""}" onclick="selectSize('${escJs(size)}')">
      ${esc(size)}
    </button>
  `).join("");

  $("#colorBlock").style.display = colorList.length ? "block" : "none";
  $("#selectedColorText").textContent = colorList[detailColorIndex] || t.selectColor;
  $("#colorOptions").innerHTML = colorList.map((color, index) => `
    <button class="variant-btn ${index === detailColorIndex ? "active" : ""}" onclick="selectColor(${index})">
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
  $("#cartTotal").textContent = money(total);
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
          <button onclick="changeQty('${escJs(x.key)}', -1)">−</button>
          <b>${x.qty}</b>
          <button onclick="changeQty('${escJs(x.key)}', 1)">+</button>
        </div>
        <button class="remove" onclick="removeItem('${escJs(x.key)}')">${t.remove}</button>
      </div>
      <b class="cart-line-total">${money(x.price * x.qty)}</b>
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
    size: x.size || "",
    color: x.color || ""
  }));

  const total = items.reduce((sum, x) => sum + x.price * x.qty, 0);
  const payload = {
    customer_name: $("#customerName").value.trim(),
    phone: $("#customerPhone").value.trim(),
    address: $("#customerAddress").value.trim(),
    comment: $("#customerComment").value.trim(),
    items,
    total,
    init_data: tg?.initData || ""
  };

  try {
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Error");

    showToast(t.success);
    cart = {};
    save();
    renderCart();
    e.target.reset();
    closeCheckout();
    tg?.HapticFeedback?.notificationOccurred("success");
  } catch (err) {
    alert("❌ " + err.message);
    tg?.HapticFeedback?.notificationOccurred("error");
  } finally {
    btn.disabled = false;
    btn.textContent = t.confirm;
  }
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

window.setCat = setCat;
window.openProduct = openProduct;
window.selectDetailImage = selectDetailImage;
window.selectSize = selectSize;
window.selectColor = selectColor;
window.changeQty = changeQty;
window.removeItem = removeItem;


// ===============================
// BURANDO_ZOOM_SHARE_V1
// Product image zoom + share + direct link
// ===============================

function ensureProductExtras() {
  if (document.getElementById("burandoZoomShareStyle")) return;

  const style = document.createElement("style");
  style.id = "burandoZoomShareStyle";
  style.textContent = `
    #detailMainImage {
      cursor: zoom-in;
    }

    .burando-share-btn {
      width: 100%;
      min-height: 54px;
      margin: 14px 0 18px;
      border: 1px solid #dedede;
      border-radius: 18px;
      background: #fff;
      color: #111;
      font-size: 16px;
      font-weight: 800;
      cursor: pointer;
    }

    .burando-share-btn:active {
      transform: scale(.98);
    }

    .burando-zoom-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0,0,0,.96);
      display: none;
      flex-direction: column;
      align-items: stretch;
    }

    .burando-zoom-overlay.open {
      display: flex;
    }

    .burando-zoom-top {
      position: absolute;
      top: max(14px, env(safe-area-inset-top));
      left: 14px;
      right: 14px;
      z-index: 4;
      display: flex;
      justify-content: space-between;
      align-items: center;
      pointer-events: none;
    }

    .burando-zoom-title {
      color: white;
      font-size: 13px;
      font-weight: 800;
      background: rgba(0,0,0,.45);
      padding: 9px 12px;
      border-radius: 999px;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .burando-zoom-close {
      pointer-events: auto;
      width: 48px;
      height: 48px;
      border: 0;
      border-radius: 50%;
      background: rgba(255,255,255,.94);
      color: #111;
      font-size: 26px;
      cursor: pointer;
    }

    .burando-zoom-stage {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      user-select: none;
    }

    .burando-zoom-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
      transform-origin: center center;
      will-change: transform;
      touch-action: none;
      user-select: none;
      -webkit-user-drag: none;
    }

    .burando-zoom-controls {
      position: absolute;
      left: 50%;
      bottom: calc(22px + env(safe-area-inset-bottom));
      transform: translateX(-50%);
      z-index: 4;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-radius: 999px;
      background: rgba(20,20,20,.7);
    }

    .burando-zoom-controls button {
      width: 48px;
      height: 48px;
      border: 0;
      border-radius: 50%;
      background: white;
      color: #111;
      font-size: 25px;
      font-weight: 800;
      cursor: pointer;
    }

    .burando-zoom-controls span {
      color: white;
      min-width: 48px;
      text-align: center;
      font-size: 13px;
      font-weight: 800;
    }

    body.burando-image-open {
      overflow: hidden !important;
    }
  
    .burando-zoom-overlay {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      height: 100dvh !important;
      z-index: 2147483647 !important;
      background: #000 !important;
    }

    .burando-zoom-stage {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background: #000 !important;
    }

    .burando-zoom-image {
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      background: #000 !important;
    }

    .burando-zoom-title {
      background: rgba(0,0,0,.35) !important;
    }

    .burando-zoom-close {
      background: rgba(255,255,255,.90) !important;
    }
`;
  document.head.appendChild(style);

  // SHARE BUTTON
  const content = document.querySelector(".detail-content");
  const buyRow = document.querySelector(".detail-buy-row");

  if (content && buyRow && !document.getElementById("detailShareBtn")) {
    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.id = "detailShareBtn";
    shareBtn.className = "burando-share-btn";
    shareBtn.textContent = lang === "uz" ? "↗️ Ulashish" : "↗️ Поделиться";
    content.insertBefore(shareBtn, buyRow);
    shareBtn.addEventListener("click", shareProduct);
  }

  // IMAGE VIEWER
  if (!document.getElementById("burandoImageViewer")) {
    const viewer = document.createElement("div");
    viewer.id = "burandoImageViewer";
    viewer.className = "burando-zoom-overlay";
    viewer.innerHTML = `
      <div class="burando-zoom-top">
        <div id="burandoZoomTitle" class="burando-zoom-title">BURANDO</div>
        <button id="burandoZoomClose" type="button" class="burando-zoom-close" aria-label="Close">×</button>
      </div>

      <div id="burandoZoomStage" class="burando-zoom-stage">
        <img id="burandoZoomImage" class="burando-zoom-image" src="" alt="">
      </div>

      <div class="burando-zoom-controls">
        <button id="burandoZoomMinus" type="button" aria-label="Zoom out">−</button>
        <span id="burandoZoomValue">100%</span>
        <button id="burandoZoomPlus" type="button" aria-label="Zoom in">+</button>
      </div>
    `;
    document.body.appendChild(viewer);

    $("#burandoZoomClose").addEventListener("click", closeImageViewer);
    $("#burandoZoomPlus").addEventListener("click", () => changeImageZoom(0.5));
    $("#burandoZoomMinus").addEventListener("click", () => changeImageZoom(-0.5));

    viewer.addEventListener("click", e => {
      if (e.target === viewer) closeImageViewer();
    });

    setupImageGestures();
  }

  const mainImage = $("#detailMainImage");
  if (mainImage && !mainImage.dataset.zoomBound) {
    mainImage.dataset.zoomBound = "1";
    mainImage.addEventListener("click", openImageViewer);
  }

  const closeBtn = $("#closeProduct");
  if (closeBtn && !closeBtn.dataset.zoomCloseBound) {
    closeBtn.dataset.zoomCloseBound = "1";
    closeBtn.addEventListener("click", closeImageViewer);
  }
}

let imageZoomState = {
  scale: 1,
  x: 0,
  y: 0,
  pointers: new Map(),
  startDistance: 0,
  startScale: 1,
  lastX: 0,
  lastY: 0,
  lastTap: 0
};

function clampZoom(v) {
  return Math.max(1, Math.min(5, v));
}

function applyImageZoom() {
  const img = $("#burandoZoomImage");
  const val = $("#burandoZoomValue");
  if (!img) return;

  if (imageZoomState.scale <= 1) {
    imageZoomState.x = 0;
    imageZoomState.y = 0;
  }

  img.style.transform =
    `translate(${imageZoomState.x}px, ${imageZoomState.y}px) scale(${imageZoomState.scale})`;

  if (val) {
    val.textContent = `${Math.round(imageZoomState.scale * 100)}%`;
  }
}

function resetImageZoom() {
  imageZoomState.scale = 1;
  imageZoomState.x = 0;
  imageZoomState.y = 0;
  imageZoomState.pointers.clear();
  applyImageZoom();
}

function changeImageZoom(delta) {
  imageZoomState.scale = clampZoom(imageZoomState.scale + delta);
  applyImageZoom();
}

async function openImageViewer() {
  const src = $("#detailMainImage")?.src;
  if (!src) return;

  resetImageZoom();

  $("#burandoZoomImage").src = src;
  $("#burandoZoomImage").alt = detailProduct ? title(detailProduct) : "Product image";
  $("#burandoZoomTitle").textContent = detailProduct ? detailProduct.id : "BURANDO";

  // Telegram true fullscreen
  try {
    if (tg?.requestFullscreen) {
      tg.requestFullscreen();
    }
  } catch (e) {
    console.warn("Telegram fullscreen:", e);
  }

  // Browser fullscreen fallback
  try {
    const viewer = $("#burandoImageViewer");
    if (!tg?.requestFullscreen && viewer?.requestFullscreen) {
      await viewer.requestFullscreen();
    }
  } catch (e) {
    console.warn("Browser fullscreen:", e);
  }

  $("#burandoImageViewer").classList.add("open");
  document.body.classList.add("burando-image-open");

  tg?.HapticFeedback?.impactOccurred("light");
}

async function closeImageViewer() {
  const viewer = $("#burandoImageViewer");
  if (!viewer) return;

  viewer.classList.remove("open");
  document.body.classList.remove("burando-image-open");
  resetImageZoom();

  try {
    if (tg?.exitFullscreen) {
      tg.exitFullscreen();
    }
  } catch (e) {
    console.warn("Telegram exit fullscreen:", e);
  }

  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch (e) {
    console.warn("Browser exit fullscreen:", e);
  }
}

function setupImageGestures() {
  const stage = $("#burandoZoomStage");
  if (!stage || stage.dataset.bound) return;
  stage.dataset.bound = "1";

  const distance = (a, b) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  stage.addEventListener("pointerdown", e => {
    imageZoomState.pointers.set(e.pointerId, e);

    try {
      stage.setPointerCapture(e.pointerId);
    } catch {}

    const pts = [...imageZoomState.pointers.values()];

    if (pts.length === 2) {
      imageZoomState.startDistance = distance(pts[0], pts[1]);
      imageZoomState.startScale = imageZoomState.scale;
    } else if (pts.length === 1) {
      imageZoomState.lastX = e.clientX;
      imageZoomState.lastY = e.clientY;
    }
  });

  stage.addEventListener("pointermove", e => {
    if (!imageZoomState.pointers.has(e.pointerId)) return;

    imageZoomState.pointers.set(e.pointerId, e);
    const pts = [...imageZoomState.pointers.values()];

    if (pts.length === 2) {
      e.preventDefault();

      const d = distance(pts[0], pts[1]);

      if (imageZoomState.startDistance > 0) {
        imageZoomState.scale = clampZoom(
          imageZoomState.startScale * (d / imageZoomState.startDistance)
        );
        applyImageZoom();
      }
    } else if (pts.length === 1 && imageZoomState.scale > 1) {
      e.preventDefault();

      imageZoomState.x += e.clientX - imageZoomState.lastX;
      imageZoomState.y += e.clientY - imageZoomState.lastY;

      imageZoomState.lastX = e.clientX;
      imageZoomState.lastY = e.clientY;

      applyImageZoom();
    }
  }, { passive: false });

  const endPointer = e => {
    imageZoomState.pointers.delete(e.pointerId);

    const pts = [...imageZoomState.pointers.values()];
    if (pts.length === 1) {
      imageZoomState.lastX = pts[0].clientX;
      imageZoomState.lastY = pts[0].clientY;
    }

    if (e.pointerType === "touch") {
      const now = Date.now();
      if (now - imageZoomState.lastTap < 280) {
        imageZoomState.scale = imageZoomState.scale > 1 ? 1 : 2.5;
        imageZoomState.x = 0;
        imageZoomState.y = 0;
        applyImageZoom();
        imageZoomState.lastTap = 0;
      } else {
        imageZoomState.lastTap = now;
      }
    }
  };

  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);

  stage.addEventListener("dblclick", () => {
    imageZoomState.scale = imageZoomState.scale > 1 ? 1 : 2.5;
    imageZoomState.x = 0;
    imageZoomState.y = 0;
    applyImageZoom();
  });

  stage.addEventListener("wheel", e => {
    e.preventDefault();
    imageZoomState.scale = clampZoom(
      imageZoomState.scale + (e.deltaY < 0 ? 0.25 : -0.25)
    );
    applyImageZoom();
  }, { passive: false });
}

function getProductShareUrl(product) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("product", product.id);
  return url.toString();
}

async function shareProduct() {
  if (!detailProduct) return;

  const url = getProductShareUrl(detailProduct);
  const productTitle = title(detailProduct);
  const text = `${productTitle} — ${money(detailProduct.price)}\n🇯🇵 BURANDO Japan Store`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: productTitle,
        text,
        url
      });
      return;
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.warn("Native share failed:", err);
  }

  try {
    if (tg?.openTelegramLink) {
      const shareUrl =
        `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
      tg.openTelegramLink(shareUrl);
      return;
    }
  } catch (err) {
    console.warn("Telegram share failed:", err);
  }

  window.prompt(
    lang === "uz" ? "Silkani nusxalang:" : "Скопируйте ссылку:",
    `${text}\n${url}`
  );
}

let sharedProductOpened = false;

function openProductFromLink() {
  if (sharedProductOpened) return;

  const params = new URLSearchParams(window.location.search);
  const productId = params.get("product");

  if (!productId) return;

  const found = products.find(
    p => String(p.id).toLowerCase() === String(productId).toLowerCase()
  );

  if (!found) return;

  sharedProductOpened = true;

  setTimeout(() => {
    openProduct(found.id);
  }, 120);
}



// ========================================
// BURANDO_PRO_GALLERY_V1
// Premium mobile product image experience
// ========================================

let burandoGalleryIndex = 0;
let burandoGalleryReady = false;

function burandoGalleryImages() {
  if (!detailProduct) return [];

  const imgs =
    detailProduct.images && detailProduct.images.length
      ? detailProduct.images
      : [detailProduct.image];

  return imgs.filter(Boolean);
}

function burandoCreateProGallery() {
  if (burandoGalleryReady) return;

  const viewer = document.getElementById("burandoImageViewer");
  if (!viewer) return;

  burandoGalleryReady = true;

  // Premium top bar
  const top = document.createElement("div");
  top.className = "burando-pro-topbar";
  top.innerHTML = `
    <button type="button" id="burandoProClose" class="burando-pro-round" aria-label="Close">×</button>

    <div class="burando-pro-right">
      <div id="burandoProCounter" class="burando-pro-counter">1 / 1</div>
      <button type="button" id="burandoProShare" class="burando-pro-round" aria-label="Share">
        ↗
      </button>
    </div>
  `;

  viewer.appendChild(top);

  const hint = document.createElement("div");
  hint.id = "burandoProHint";
  hint.className = "burando-pro-hint";
  hint.textContent =
    lang === "uz"
      ? "← Rasmlar →  •  Pastga surib yoping"
      : "← Фото →  •  Проведите вниз, чтобы закрыть";

  viewer.appendChild(hint);

  document.getElementById("burandoProClose")
    ?.addEventListener("click", closeImageViewer);

  document.getElementById("burandoProShare")
    ?.addEventListener("click", shareProduct);

  // Remove old stage gesture listeners by cloning stage.
  const oldStage = document.getElementById("burandoZoomStage");

  if (!oldStage) return;

  const stage = oldStage.cloneNode(true);
  oldStage.parentNode.replaceChild(stage, oldStage);

  bindBurandoProGestures(stage);

  // Watch viewer opening
  const observer = new MutationObserver(() => {
    if (viewer.classList.contains("open")) {
      burandoGalleryOpen();
    }
  });

  observer.observe(viewer, {
    attributes: true,
    attributeFilter: ["class"]
  });
}

function burandoGalleryOpen() {
  const imgs = burandoGalleryImages();
  if (!imgs.length) return;

  const currentSrc = document.getElementById("detailMainImage")?.src || "";

  let found = imgs.findIndex(x => {
    try {
      return new URL(x, location.href).href === currentSrc;
    } catch {
      return x === currentSrc;
    }
  });

  burandoGalleryIndex = found >= 0 ? found : 0;

  burandoShowGalleryImage(burandoGalleryIndex, false);

  const hint = document.getElementById("burandoProHint");

  if (hint) {
    hint.classList.remove("hide");
    setTimeout(() => hint.classList.add("hide"), 2600);
  }
}

function burandoUpdateCounter() {
  const counter = document.getElementById("burandoProCounter");
  const imgs = burandoGalleryImages();

  if (!counter) return;

  counter.style.display =
    imgs.length > 1 ? "flex" : "none";

  counter.textContent =
    imgs.length > 1
      ? `${burandoGalleryIndex + 1} / ${imgs.length}`
      : "";
}

function burandoShowGalleryImage(index, animate = true) {
  const imgs = burandoGalleryImages();
  if (!imgs.length) return;

  // CHEKSIZ AYLANISH
  index = ((index % imgs.length) + imgs.length) % imgs.length;

  burandoGalleryIndex = index;

  const img = document.getElementById("burandoZoomImage");
  if (!img) return;

  resetImageZoom();

  const nextSrc = imgs[index];

  if (animate) {
    img.style.transition = "opacity .12s ease";
    img.style.opacity = ".15";

    setTimeout(() => {
      img.src = nextSrc;
      img.style.opacity = "1";
    }, 70);
  } else {
    img.src = nextSrc;
    img.style.opacity = "1";
  }

  burandoUpdateCounter();

  // OLDINGI VA KEYINGI RASMLARNI OLDINDAN YUKLASH
  if (imgs.length > 1) {
    const nextIndex =
      (burandoGalleryIndex + 1) % imgs.length;

    const prevIndex =
      (burandoGalleryIndex - 1 + imgs.length) % imgs.length;

    const next = new Image();
    next.src = imgs[nextIndex];

    const prev = new Image();
    prev.src = imgs[prevIndex];
  }
}

function burandoNextImage() {
  if (imageZoomState.scale > 1) return;

  const imgs = burandoGalleryImages();
  if (imgs.length <= 1) return;

  tg?.HapticFeedback?.selectionChanged?.();

  const nextIndex =
    (burandoGalleryIndex + 1) % imgs.length;

  burandoShowGalleryImage(
    nextIndex,
    true
  );
}

function burandoPrevImage() {
  if (imageZoomState.scale > 1) return;

  const imgs = burandoGalleryImages();
  if (imgs.length <= 1) return;

  tg?.HapticFeedback?.selectionChanged?.();

  const prevIndex =
    (burandoGalleryIndex - 1 + imgs.length) % imgs.length;

  burandoShowGalleryImage(
    prevIndex,
    true
  );
}

function bindBurandoProGestures(stage) {
  if (!stage) return;

  const img = stage.querySelector("#burandoZoomImage");
  if (!img) return;

  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  let startDistance = 0;
  let startScale = 1;

  let isPinching = false;
  let isDragging = false;

  let lastTapTime = 0;

  const touchDistance = (a, b) => {
    return Math.hypot(
      a.clientX - b.clientX,
      a.clientY - b.clientY
    );
  };

  const cleanDrag = () => {
    const viewer = document.getElementById("burandoImageViewer");

    viewer?.classList.remove("dragging");

    img.style.transition =
      "transform .20s ease, opacity .20s ease";

    img.style.opacity = "1";
  };

  stage.addEventListener(
    "touchstart",
    e => {
      if (!e.touches.length) return;

      // PINCH START
      if (e.touches.length === 2) {
        isPinching = true;
        isDragging = false;

        startDistance =
          touchDistance(e.touches[0], e.touches[1]);

        startScale = imageZoomState.scale;

        return;
      }

      // SINGLE FINGER START
      if (e.touches.length === 1) {
        const t = e.touches[0];

        startX = t.clientX;
        startY = t.clientY;

        lastX = t.clientX;
        lastY = t.clientY;

        isDragging = true;
        isPinching = false;

        img.style.transition = "none";
      }
    },
    { passive: false }
  );

  stage.addEventListener(
    "touchmove",
    e => {

      // ======================
      // PINCH ZOOM
      // ======================
      if (e.touches.length === 2) {
        e.preventDefault();

        isPinching = true;
        isDragging = false;

        const d =
          touchDistance(e.touches[0], e.touches[1]);

        if (startDistance > 0) {
          imageZoomState.scale = Math.max(
            1,
            Math.min(
              5,
              startScale * (d / startDistance)
            )
          );

          applyImageZoom();
        }

        return;
      }

      if (e.touches.length !== 1) return;

      const t = e.touches[0];

      // ======================
      // PAN WHILE ZOOMED
      // ======================
      if (imageZoomState.scale > 1) {
        e.preventDefault();

        imageZoomState.x += t.clientX - lastX;
        imageZoomState.y += t.clientY - lastY;

        lastX = t.clientX;
        lastY = t.clientY;

        applyImageZoom();

        return;
      }

      // ======================
      // SWIPE PREVIEW
      // ======================
      if (isDragging) {
        e.preventDefault();

        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        const viewer =
          document.getElementById("burandoImageViewer");

        viewer?.classList.add("dragging");

        // vertical = close preview
        if (Math.abs(dy) > Math.abs(dx)) {
          img.style.transform =
            `translateY(${dy * 0.55}px) scale(${1 - Math.min(Math.abs(dy) / 1500, 0.08)})`;

          img.style.opacity =
            String(
              Math.max(
                0.30,
                1 - Math.abs(dy) / 420
              )
            );
        }

        // horizontal = photo preview
        else {
          img.style.transform =
            `translateX(${dx * 0.55}px)`;
        }
      }
    },
    { passive: false }
  );

  stage.addEventListener(
    "touchend",
    e => {
      cleanDrag();

      if (isPinching) {
        isPinching = false;
        isDragging = false;
        return;
      }

      if (!isDragging) return;

      isDragging = false;

      const touch = e.changedTouches?.[0];
      if (!touch) {
        resetImageZoom();
        return;
      }

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // ======================
      // UP / DOWN = CLOSE
      // ======================
      if (
        imageZoomState.scale <= 1 &&
        Math.abs(dy) >= 80 &&
        Math.abs(dy) > Math.abs(dx) * 1.05
      ) {
        img.style.transition =
          "transform .15s ease, opacity .15s ease";

        img.style.transform =
          `translateY(${dy > 0 ? 180 : -180}px) scale(.94)`;

        img.style.opacity = "0";

        setTimeout(() => {
          closeImageViewer();

          img.style.opacity = "1";
          resetImageZoom();
        }, 140);

        return;
      }

      // ======================
      // SWIPE LEFT = NEXT
      // ======================
      if (
        imageZoomState.scale <= 1 &&
        dx <= -45 &&
        Math.abs(dx) > Math.abs(dy)
      ) {
        resetImageZoom();
        burandoNextImage();
        return;
      }

      // ======================
      // SWIPE RIGHT = PREVIOUS
      // ======================
      if (
        imageZoomState.scale <= 1 &&
        dx >= 45 &&
        Math.abs(dx) > Math.abs(dy)
      ) {
        resetImageZoom();
        burandoPrevImage();
        return;
      }

      resetImageZoom();

      // ======================
      // DOUBLE TAP ZOOM
      // ======================
      if (
        Math.abs(dx) < 15 &&
        Math.abs(dy) < 15
      ) {
        const now = Date.now();

        if (now - lastTapTime < 300) {
          imageZoomState.scale =
            imageZoomState.scale > 1 ? 1 : 2.5;

          imageZoomState.x = 0;
          imageZoomState.y = 0;

          applyImageZoom();

          lastTapTime = 0;
        } else {
          lastTapTime = now;
        }
      }
    },
    { passive: false }
  );

  stage.addEventListener(
    "touchcancel",
    () => {
      isDragging = false;
      isPinching = false;

      cleanDrag();
      resetImageZoom();
    }
  );
}


// Keyboard support for desktop
document.addEventListener("keydown", e => {
  const viewer = document.getElementById("burandoImageViewer");

  if (!viewer?.classList.contains("open")) return;

  if (e.key === "ArrowRight") burandoNextImage();
  if (e.key === "ArrowLeft") burandoPrevImage();
  if (e.key === "Escape") closeImageViewer();
});


ensureProductExtras();
// old gallery initializer disabled

// ==================================================
// BURANDO_INFINITE_GALLERY_V2
// Stable infinite circular mobile gallery
// ==================================================

let burandoInfiniteIndex = 0;
let burandoInfiniteBound = false;

function burandoInfiniteImages() {
  if (!detailProduct) return [];

  const list =
    Array.isArray(detailProduct.images) &&
    detailProduct.images.length
      ? detailProduct.images
      : [detailProduct.image];

  return [...new Set(list.filter(Boolean))];
}

function burandoNormalizeIndex(index, length) {
  if (!length) return 0;
  return ((index % length) + length) % length;
}

function burandoInfiniteCounter() {
  const imgs = burandoInfiniteImages();
  const counter =
    document.getElementById("burandoProCounter");

  if (!counter) return;

  if (imgs.length <= 1) {
    counter.style.display = "none";
    return;
  }

  counter.style.display = "flex";
  counter.textContent =
    `${burandoInfiniteIndex + 1} / ${imgs.length}`;
}

function burandoSetInfiniteImage(index, direction = 0) {
  const imgs = burandoInfiniteImages();

  if (!imgs.length) return;

  burandoInfiniteIndex =
    burandoNormalizeIndex(index, imgs.length);

  const img =
    document.getElementById("burandoZoomImage");

  if (!img) return;

  imageZoomState.scale = 1;
  imageZoomState.x = 0;
  imageZoomState.y = 0;

  const src = imgs[burandoInfiniteIndex];

  img.style.transition = "none";

  if (direction > 0) {
    img.style.transform = "translateX(28px)";
  } else if (direction < 0) {
    img.style.transform = "translateX(-28px)";
  } else {
    img.style.transform = "translateX(0)";
  }

  img.style.opacity = ".35";
  img.src = src;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      img.style.transition =
        "transform .18s ease, opacity .18s ease";

      img.style.transform = "translateX(0)";
      img.style.opacity = "1";
    });
  });

  burandoInfiniteCounter();

  // next/previous preload
  if (imgs.length > 1) {
    const nextIndex =
      burandoNormalizeIndex(
        burandoInfiniteIndex + 1,
        imgs.length
      );

    const prevIndex =
      burandoNormalizeIndex(
        burandoInfiniteIndex - 1,
        imgs.length
      );

    const next = new Image();
    next.src = imgs[nextIndex];

    const prev = new Image();
    prev.src = imgs[prevIndex];
  }
}

function burandoInfiniteNext() {
  const imgs = burandoInfiniteImages();

  if (imgs.length <= 1) return;

  burandoSetInfiniteImage(
    burandoInfiniteIndex + 1,
    1
  );

  try {
    tg?.HapticFeedback?.selectionChanged?.();
  } catch {}
}

function burandoInfinitePrev() {
  const imgs = burandoInfiniteImages();

  if (imgs.length <= 1) return;

  burandoSetInfiniteImage(
    burandoInfiniteIndex - 1,
    -1
  );

  try {
    tg?.HapticFeedback?.selectionChanged?.();
  } catch {}
}

function burandoSyncInfiniteGallery() {
  const imgs = burandoInfiniteImages();

  if (!imgs.length) return;

  const current =
    document.getElementById("detailMainImage")?.src || "";

  let found = imgs.findIndex(src => {
    try {
      return new URL(src, location.href).href === current;
    } catch {
      return src === current;
    }
  });

  burandoInfiniteIndex =
    found >= 0 ? found : 0;

  burandoSetInfiniteImage(
    burandoInfiniteIndex,
    0
  );
}

function burandoBindInfiniteGallery() {
  if (burandoInfiniteBound) return;

  const viewer =
    document.getElementById("burandoImageViewer");

  const oldStage =
    document.getElementById("burandoZoomStage");

  if (!viewer || !oldStage) return;

  // IMPORTANT:
  // clone removes ALL old swipe listeners.
  const stage = oldStage.cloneNode(true);

  oldStage.parentNode.replaceChild(
    stage,
    oldStage
  );

  burandoInfiniteBound = true;

  const img =
    stage.querySelector("#burandoZoomImage");

  if (!img) return;

  let startX = 0;
  let startY = 0;

  let currentX = 0;
  let currentY = 0;

  let pinching = false;
  let startDistance = 0;
  let startScale = 1;

  let lastPanX = 0;
  let lastPanY = 0;

  let lastTap = 0;

  const distance = (a, b) =>
    Math.hypot(
      a.clientX - b.clientX,
      a.clientY - b.clientY
    );

  stage.addEventListener(
    "touchstart",
    e => {
      if (e.touches.length === 2) {
        pinching = true;

        startDistance =
          distance(
            e.touches[0],
            e.touches[1]
          );

        startScale =
          imageZoomState.scale;

        return;
      }

      if (e.touches.length !== 1) return;

      pinching = false;

      const t = e.touches[0];

      startX = t.clientX;
      startY = t.clientY;

      currentX = startX;
      currentY = startY;

      lastPanX = startX;
      lastPanY = startY;

      img.style.transition = "none";
    },
    { passive: false }
  );

  stage.addEventListener(
    "touchmove",
    e => {
      // PINCH
      if (e.touches.length === 2) {
        e.preventDefault();

        pinching = true;

        const d =
          distance(
            e.touches[0],
            e.touches[1]
          );

        if (startDistance > 0) {
          imageZoomState.scale =
            Math.max(
              1,
              Math.min(
                5,
                startScale *
                (d / startDistance)
              )
            );

          applyImageZoom();
        }

        return;
      }

      if (e.touches.length !== 1) return;

      const t = e.touches[0];

      currentX = t.clientX;
      currentY = t.clientY;

      // PAN ZOOMED IMAGE
      if (imageZoomState.scale > 1) {
        e.preventDefault();

        imageZoomState.x +=
          currentX - lastPanX;

        imageZoomState.y +=
          currentY - lastPanY;

        lastPanX = currentX;
        lastPanY = currentY;

        applyImageZoom();

        return;
      }

      e.preventDefault();

      const dx = currentX - startX;
      const dy = currentY - startY;

      // HORIZONTAL PREVIEW
      if (Math.abs(dx) >= Math.abs(dy)) {
        img.style.transform =
          `translateX(${dx * .55}px)`;

        img.style.opacity =
          String(
            Math.max(
              .55,
              1 - Math.abs(dx) / 600
            )
          );
      }

      // VERTICAL CLOSE PREVIEW
      else {
        img.style.transform =
          `translateY(${dy * .50}px) scale(${1 - Math.min(Math.abs(dy) / 1600, .07)})`;

        img.style.opacity =
          String(
            Math.max(
              .35,
              1 - Math.abs(dy) / 450
            )
          );
      }
    },
    { passive: false }
  );

  stage.addEventListener(
    "touchend",
    e => {
      if (pinching) {
        if (e.touches.length === 0) {
          pinching = false;
        }
        return;
      }

      if (e.touches.length > 0) return;

      const touch =
        e.changedTouches?.[0];

      if (!touch) return;

      const dx =
        touch.clientX - startX;

      const dy =
        touch.clientY - startY;

      // IF ZOOMED, DON'T CHANGE PHOTO
      if (imageZoomState.scale > 1) {
        return;
      }

      // LEFT = NEXT
      if (
        dx <= -35 &&
        Math.abs(dx) >
        Math.abs(dy) * .85
      ) {
        burandoInfiniteNext();
        return;
      }

      // RIGHT = PREVIOUS
      if (
        dx >= 35 &&
        Math.abs(dx) >
        Math.abs(dy) * .85
      ) {
        burandoInfinitePrev();
        return;
      }

      // UP/DOWN = CLOSE
      if (
        Math.abs(dy) >= 90 &&
        Math.abs(dy) >
        Math.abs(dx)
      ) {
        img.style.transition =
          "transform .15s ease, opacity .15s ease";

        img.style.transform =
          `translateY(${dy > 0 ? 180 : -180}px) scale(.94)`;

        img.style.opacity = "0";

        setTimeout(() => {
          closeImageViewer();

          img.style.opacity = "1";

          imageZoomState.scale = 1;
          imageZoomState.x = 0;
          imageZoomState.y = 0;
        }, 130);

        return;
      }

      // DOUBLE TAP
      if (
        Math.abs(dx) < 12 &&
        Math.abs(dy) < 12
      ) {
        const now = Date.now();

        if (
          now - lastTap < 290
        ) {
          imageZoomState.scale =
            imageZoomState.scale > 1
              ? 1
              : 2.5;

          imageZoomState.x = 0;
          imageZoomState.y = 0;

          applyImageZoom();

          lastTap = 0;
          return;
        }

        lastTap = now;
      }

      // RETURN TO CENTER
      img.style.transition =
        "transform .18s ease, opacity .18s ease";

      img.style.transform =
        "translateX(0)";

      img.style.opacity = "1";
    },
    { passive: false }
  );

  stage.addEventListener(
    "touchcancel",
    () => {
      pinching = false;

      img.style.transition =
        "transform .18s ease, opacity .18s ease";

      img.style.transform =
        "translateX(0)";

      img.style.opacity = "1";
    }
  );

  // Viewer opened → sync selected image
  const observer =
    new MutationObserver(() => {
      if (
        viewer.classList.contains("open")
      ) {
        setTimeout(
          burandoSyncInfiniteGallery,
          20
        );
      }
    });

  observer.observe(
    viewer,
    {
      attributes: true,
      attributeFilter: ["class"]
    }
  );
}

// Desktop arrows too
document.addEventListener(
  "keydown",
  e => {
    const viewer =
      document.getElementById(
        "burandoImageViewer"
      );

    if (
      !viewer?.classList.contains("open")
    ) return;

    if (e.key === "ArrowRight") {
      burandoInfiniteNext();
    }

    if (e.key === "ArrowLeft") {
      burandoInfinitePrev();
    }
  }
);



burandoBindInfiniteGallery();
load();
