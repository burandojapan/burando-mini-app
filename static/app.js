const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
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

function openImageViewer() {
  const src = $("#detailMainImage")?.src;
  if (!src) return;

  resetImageZoom();

  $("#burandoZoomImage").src = src;
  $("#burandoZoomImage").alt = detailProduct ? title(detailProduct) : "Product image";
  $("#burandoZoomTitle").textContent = detailProduct ? `${detailProduct.id} · ${title(detailProduct)}` : "BURANDO";

  $("#burandoImageViewer").classList.add("open");
  document.body.classList.add("burando-image-open");

  tg?.HapticFeedback?.impactOccurred("light");
}

function closeImageViewer() {
  const viewer = $("#burandoImageViewer");
  if (!viewer) return;

  viewer.classList.remove("open");
  document.body.classList.remove("burando-image-open");
  resetImageZoom();
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


ensureProductExtras();
load();
