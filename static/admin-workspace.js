/* Workspace UI reuses the existing authenticated API and product editor. */
(() => {
  "use strict";
  const paymentNames = {
    pending: "To‘lov kutilmoqda",
    awaiting_payment: "To‘lov kutilmoqda",
    receipt_submitted: "Chek kelgan",
    under_review: "Tekshiruvda",
    deposit_paid: "50% to‘langan",
    paid: "To‘langan",
    rejected: "Rad etilgan",
  };
  const deliveryNames = {
    awaiting_payment: "To‘lov kutilmoqda",
    received: "Qabul qilindi",
    preparing_japan: "Yaponiyada tayyorlanmoqda",
    shipped_japan: "Yaponiyadan yuborildi",
    in_transit: "Yo‘lda",
    arrived_uz: "O‘zbekistonga keldi",
    out_for_delivery: "Yetkazilmoqda",
    delivered: "Yetkazildi",
    cancelled: "Bekor qilindi",
  };
  const categories = {
    shoes: "Oyoq kiyim",
    watches: "Soatlar",
    clothes: "Kiyim",
    beauty: "Kosmetika",
    accessories: "Aksessuarlar",
  };
  const state = {
    tab: "overview",
    productPage: 1,
    orderPage: 1,
    orderView: "all",
    ordersReady: false,
    productsReady: false,
  };
  const pageSize = 20,
    pending = new Set(),
    expanded = new Set(),
    errors = new Map();
  const money = (n) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " USD";
  const uzs = (n) =>
    n == null
      ? "So‘m narxi kiritilmagan"
      : Number(n).toLocaleString("uz-UZ") + " so‘m";
  const esc = escapeHtml;
  const button = (text, fn, cls = "secondary") => {
    const b = v7Button(text, fn);
    b.type = "button";
    b.className = cls;
    return b;
  };
  function page(id, html) {
    const s = document.createElement("section");
    s.id = id + "Tab";
    s.className = "tabPage hidden";
    s.innerHTML = html;
    $("adminApp").append(s);
    return s;
  }
  const overview = page(
    "overview",
    `<div class="sectionHead"><div><p class="eyebrow">DO‘KON BOSHQARUVI</p><h1>Bugungi ishlaringiz</h1></div><button id="workspaceRefresh" class="secondary">Yangilash</button></div><p class="help">Ko‘rsatkichlar serverdan yuklangan buyurtmalar asosida. Bu foyda hisoboti emas.</p><div id="adminMetrics" class="metrics"></div><div class="overview-grid"><section class="card"><h2>Avval tekshiring</h2><div id="adminTasks"></div></section><section class="card"><h2>Oxirgi buyurtmalar</h2><div id="adminRecent"></div></section></div><p id="adminUpdated" class="help" role="status"></p>`,
  );
  const banners = page(
    "banners",
    '<div class="sectionHead"><div><p class="eyebrow">BOSH SAHIFA</p><h1>Reklama bannerlari</h1></div></div><p class="help">Banner matni UZ/RU, ichki havolasi va ko‘rinish muddatini shu yerda belgilang.</p>',
  );
  const settings = page(
    "settings",
    '<div class="sectionHead"><div><p class="eyebrow">DO‘KON SOZLAMALARI</p><h1>Aloqa va to‘lov</h1></div></div>',
  );
  const settingsCard = document.createElement("section");
  settingsCard.className = "card v7-settings";
  settingsCard.append($("v7LoadSettings"), $("v7SettingsForm"));
  settings.append(settingsCard);
  const bannerListCard = document.createElement("section");
  bannerListCard.className = "card v7-settings";
  bannerListCard.append($("v7LoadBanners"), $("v7BannerList"));
  banners.append(bannerListCard);
  const bannerFormCard = document.createElement("section");
  bannerFormCard.className = "card v7-settings";
  bannerFormCard.innerHTML = '<h2 id="bannerEditorTitle">Yangi banner</h2>';
  bannerFormCard.append($("v7BannerForm"));
  banners.append(bannerFormCard);
  document.querySelector("#productsTab > .v7-settings")?.remove();
  const notice = document.createElement("p");
  notice.className = "help";
  notice.textContent =
    "Rekvizitlarga faqat mijoz to‘lov qilishi uchun kerakli ma’lumotlarni yozing. CVV, bank paroli va maxfiy kodlarni kiritmang.";
  settingsCard.append(notice);
  const notifications = document.querySelector(".admin-notifications");
  const notificationDetails = document.createElement("details");
  notificationDetails.className = "card";
  notificationDetails.innerHTML =
    '<summary>Xabarlar xizmati</summary><p class="help">TEST muhitida xabarlar faqat alohida ruxsat berilgan sinov akkauntlariga yuboriladi.</p>';
  notificationDetails.append(notifications);
  settings.append(notificationDetails);
  const tabs = [
    ["overview", "Umumiy"],
    ["orders", "Buyurtmalar"],
    ["products", "Mahsulotlar"],
    ["banners", "Bannerlar"],
    ["settings", "Sozlamalar"],
  ];
  const icons = {
    overview: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
    orders: '<path d="M7 3h10v3H7zM7 5H5v16h14V5h-2M8 11h8M8 15h5"/>',
    products:
      '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8M12 12v10M7 5.8l10 5.4"/>',
    banners:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="8" r="1"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  };
  const navigation = document.querySelector(".tabs");
  navigation.setAttribute("role", "navigation");
  navigation.setAttribute("aria-label", "Admin bo‘limlari");
  navigation.replaceChildren(
    ...tabs.map(([id, name]) => {
      const b = button(name, () => switchTab(id), "tab");
      b.dataset.tab = id;
      b.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        icons[id] +
        "</svg>";
      const label = document.createElement("span");
      label.textContent = name;
      b.append(label);
      return b;
    }),
  );
  let fullHeight = window.visualViewport?.height || window.innerHeight;
  function syncKeyboard() {
    const editing = document.activeElement?.matches("input, textarea, select");
    const height = window.visualViewport?.height || window.innerHeight;
    if (!editing) fullHeight = Math.max(height, window.innerHeight);
    document.body.classList.toggle(
      "admin-keyboard",
      !!editing && fullHeight - height > 120,
    );
  }
  window.visualViewport?.addEventListener("resize", syncKeyboard);
  window.addEventListener("resize", syncKeyboard);
  document.addEventListener("focusin", syncKeyboard);
  document.addEventListener("focusout", () => setTimeout(syncKeyboard, 50));
  const network = document.createElement("div");
  network.id = "adminNotice";
  network.className = "admin-notice hidden";
  network.setAttribute("role", "alert");
  $("adminApp").prepend(network);
  function errorNotice(key, text) {
    if (text) errors.set(key, text);
    else errors.delete(key);
    network.textContent = [...errors.values()].join(" ");
    network.classList.toggle("hidden", !errors.size);
  }
  $("toast").setAttribute("role", "status");
  $("toast").setAttribute("aria-live", "polite");
  const sessionLabel = document.createElement("span");
  sessionLabel.className = "session-label";
  sessionLabel.textContent = "Himoyalangan boshqaruv";
  document.querySelector(".top").append(sessionLabel);
  $("adminKey").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("loginBtn").click();
  });
  const loginError = document.createElement("p");
  loginError.id = "adminLoginError";
  loginError.setAttribute("role", "alert");
  $("loginBox").append(loginError);
  const reveal = button(
    "Kalitni ko‘rsatish",
    () => {
      const hidden = $("adminKey").type === "password";
      $("adminKey").type = hidden ? "text" : "password";
      reveal.textContent = hidden ? "Kalitni yashirish" : "Kalitni ko‘rsatish";
    },
    "key-toggle",
  );
  $("adminKey").after(reveal);
  function controls(id, html) {
    const el = document.createElement("div");
    el.className = "admin-filters";
    el.innerHTML = html;
    $(id + "Tab")
      .querySelector(".sectionHead")
      .after(el);
    return el;
  }
  controls(
    "products",
    `<label>Qidirish<input id="adminProductSearch" type="search" placeholder="Nomi yoki mahsulot kodi"></label><label>Kategoriya<select id="adminProductCategory"><option value="">Barcha kategoriyalar</option>${Object.entries(
      categories,
    )
      .map(([v, n]) => `<option value="${v}">${n}</option>`)
      .join(
        "",
      )}</select></label><label>Holati<select id="adminProductStatus"><option value="">Barchasi</option><option value="active">Saytda</option><option value="hidden">Yashirilgan</option><option value="missing">USD narxi yo‘q</option><option value="sale">Aksiya belgilangan</option></select></label>`,
  );
  controls(
    "orders",
    `<label>Qidirish<input id="adminOrderSearch" type="search" placeholder="Buyurtma, ism yoki telefon"></label><label>To‘lov<select id="adminOrderPayment"><option value="">Barcha to‘lovlar</option><option value="attention">Cheklarni tekshirish</option>${Object.entries(
      paymentNames,
    )
      .filter(([k]) => k !== "pending")
      .map(([v, n]) => `<option value="${v}">${n}</option>`)
      .join(
        "",
      )}</select></label><label>Yetkazish<select id="adminOrderDelivery"><option value="">Barcha holatlar</option>${Object.entries(
      deliveryNames,
    )
      .map(([v, n]) => `<option value="${v}">${n}</option>`)
      .join("")}</select></label>`,
  );
  const shippedStatuses = new Set([
    "shipped_japan",
    "in_transit",
    "arrived_uz",
    "out_for_delivery",
    "delivered",
  ]);
  const orderViews = document.createElement("div");
  orderViews.className = "order-views";
  orderViews.setAttribute("role", "group");
  orderViews.setAttribute("aria-label", "Buyurtmalar va yuklar tarixi");
  const allOrdersButton = button(
    "Barcha buyurtmalar",
    () => setOrderView("all"),
    "order-view active",
  );
  const historyButton = button(
    "Yuklar tarixi",
    () => setOrderView("history"),
    "order-view",
  );
  allOrdersButton.id = "adminAllOrders";
  historyButton.id = "adminShipmentHistory";
  orderViews.append(allOrdersButton, historyButton);
  $("ordersTab").querySelector(".sectionHead").after(orderViews);
  const historyInfo = document.createElement("p");
  historyInfo.className = "help shipment-history-info";
  historyInfo.hidden = true;
  historyInfo.textContent =
    "Yuborilgan, yo‘ldagi va yetkazilgan yuklar. Qidiruv va yetkazish filtri orqali kerakli buyurtmani toping.";
  orderViews.after(historyInfo);
  function setOrderView(view) {
    state.orderView = view;
    state.orderPage = 1;
    for (const id of [
      "adminOrderSearch",
      "adminOrderPayment",
      "adminOrderDelivery",
    ])
      $(id).value = "";
    renderOrders();
  }
  for (const id of [
    "adminProductSearch",
    "adminProductCategory",
    "adminProductStatus",
  ])
    $(id).addEventListener("input", () => {
      state.productPage = 1;
      renderProducts();
    });
  for (const id of [
    "adminOrderSearch",
    "adminOrderPayment",
    "adminOrderDelivery",
  ])
    $(id).addEventListener("input", () => {
      state.orderPage = 1;
      renderOrders();
    });
  function statusPill(value, map) {
    const b = document.createElement("span");
    b.className =
      "status-pill status-" + (Object.hasOwn(map, value) ? value : "unknown");
    b.textContent = map[value] || value || "—";
    return b;
  }
  function paginate(root, rows, pageNumber, change) {
    const count = Math.max(1, Math.ceil(rows.length / pageSize)),
      current = Math.min(pageNumber, count);
    const footer = document.createElement("div");
    footer.className = "pagination";
    footer.append(
      button("← Oldingi", () => change(current - 1)),
      document.createTextNode(`${rows.length} ta · ${current} / ${count}`),
      button("Keyingi →", () => change(current + 1)),
    );
    footer.firstChild.disabled = current === 1;
    footer.lastChild.disabled = current === count;
    root.append(footer);
    return rows.slice((current - 1) * pageSize, current * pageSize);
  }
  function blank(root, text) {
    const p = document.createElement("p");
    p.className = "card empty";
    p.textContent = text;
    root.append(p);
  }
  const originalApi = api;
  api = async function (url, options = {}) {
    const write = options.method && options.method !== "GET",
      key = (options.method || "GET") + url;
    if (write && pending.has(key))
      throw Error("Bu amal bajarilmoqda. Natijani kuting.");
    if (write) pending.add(key);
    try {
      return await originalApi(url, { ...options, cache: "no-store" });
    } finally {
      if (write) pending.delete(key);
    }
  };
  async function busy(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    try {
      await fn();
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }
  loadProducts = async function () {
    const key = adminKey;
    try {
      const data = await api("/api/admin/products");
      if (key !== adminKey) return;
      if (!Array.isArray(data)) throw Error("Mahsulot javobi noto‘g‘ri");
      products = data;
      state.productsReady = true;
      renderProducts();
      renderOverview();
      errorNotice("products", "");
    } catch (e) {
      errorNotice(
        "products",
        "Mahsulotlar yuklanmadi: " +
          e.message +
          ". Yangilash tugmasi orqali qayta urinib ko‘ring.",
      );
    }
  };
  loadOrders = async function () {
    const key = adminKey;
    try {
      const data = await api("/api/admin/orders");
      if (key !== adminKey) return;
      if (!Array.isArray(data)) throw Error("Buyurtma javobi noto‘g‘ri");
      orders = data;
      state.ordersReady = true;
      renderOrders();
      renderOverview();
      errorNotice("orders", "");
      $("adminUpdated").textContent =
        "Oxirgi yangilanish: " + new Date().toLocaleTimeString("uz-UZ");
    } catch (e) {
      errorNotice(
        "orders",
        "Buyurtmalar yuklanmadi: " +
          e.message +
          ". Yangilash tugmasi orqali qayta urinib ko‘ring.",
      );
    }
  };
  const refreshProducts = button("Yangilash", (e) =>
    busy(e.currentTarget, loadProducts),
  );
  $("productsTab").querySelector(".sectionHead").append(refreshProducts);
  $("workspaceRefresh").onclick = (e) =>
    busy(e.currentTarget, () => Promise.all([loadProducts(), loadOrders()]));
  $("refreshOrdersBtn").onclick = (e) => busy(e.currentTarget, loadOrders);
  // Replace the original button to remove its old load listener.
  const oldRefresh = $("refreshOrdersBtn"),
    newRefresh = oldRefresh.cloneNode(true);
  oldRefresh.replaceWith(newRefresh);
  newRefresh.onclick = (e) => busy(e.currentTarget, loadOrders);
  for (const refresh of [newRefresh, refreshProducts, $("workspaceRefresh")]) {
    refresh.classList.add("icon-refresh");
    refresh.setAttribute("aria-label", "Yangilash");
    refresh.title = "Yangilash";
    refresh.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></svg>';
  }

  switchTab = function (tab) {
    if (!tabs.some(([id]) => id === tab)) return;
    if (
      tab !== "products" &&
      !$("productForm").classList.contains("hidden") &&
      dirty &&
      !confirm("Saqlanmagan o‘zgarishlar bor. Baribir bo‘limdan chiqasizmi?")
    )
      return;
    state.tab = tab;
    for (const [id] of tabs)
      $(id + "Tab").classList.toggle("hidden", id !== tab);
    document.querySelectorAll(".tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
      b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false");
    });
    if (tab === "orders") loadOrders();
    if (tab === "banners") $("v7LoadBanners").click();
  };
  renderProducts = function () {
    const root = $("productsList");
    root.replaceChildren();
    const q = $("adminProductSearch").value.trim().toLowerCase(),
      cat = $("adminProductCategory").value,
      status = $("adminProductStatus").value;
    const filtered = products.filter(
      (p) =>
        `${p.name} ${p.code}`.toLowerCase().includes(q) &&
        (!cat || p.category === cat) &&
        (!status ||
          (status === "active" && p.active !== false) ||
          (status === "hidden" && p.active === false) ||
          (status === "missing" && !(p.price > 0)) ||
          (status === "sale" && p.sale_price != null)),
    );
    if (!filtered.length) {
      blank(
        root,
        state.productsReady
          ? "Mos mahsulot topilmadi. Filtrlarni o‘zgartiring yoki yangi mahsulot qo‘shing."
          : "Mahsulotlar yuklanmoqda…",
      );
      return;
    }
    const items = paginate(root, filtered, state.productPage, (n) => {
      state.productPage = n;
      renderProducts();
    });
    for (const p of items) {
      const card = document.createElement("article");
      card.className = "item admin-product";
      const images = valueList(p.images),
        src = images[0];
      card.innerHTML = `<div class="productRow">${src && /^https:\/\//.test(src) ? `<img src="${esc(src)}" alt="" loading="lazy">` : '<div class="image-placeholder">Rasm yo‘q</div>'}<div class="grow"><div class="meta">${esc(p.code)} · ${esc(categories[p.category] || p.category)}</div><h3>${esc(p.name)}</h3><strong>${money(p.price)}</strong><div class="meta">Checkout: CBU kursi · 50/50</div></div></div>`;
      card.append(
        statusPill(p.active === false ? "hidden" : "active", {
          hidden: "Yashirilgan",
          active: "Saytda",
        }),
      );
      if (p.sale_price != null) {
        const badge = document.createElement("span");
        badge.className = "status-pill";
        badge.textContent =
          "Aksiya: " + money(p.sale_price);
        card.append(badge);
      }
      const actions = document.createElement("div");
      actions.className = "row";
      actions.append(
        button(
          "Tahrirlash",
          () => window.editProduct(safeEncode(p.code)),
          "primary",
        ),
      );
      if (p.active !== false)
        actions.append(
          button(
            "Yashirish",
            (e) => busy(e.currentTarget, () => hideProduct(safeEncode(p.code))),
            "secondary",
          ),
        );
      card.append(actions);
      root.append(card);
    }
  };
  function task(text, fn) {
    const b = button(text, fn, "task-link");
    return b;
  }
  function orderFilter(value) {
    state.orderView = "all";
    $("adminOrderPayment").value = value;
    state.orderPage = 1;
    switchTab("orders");
    renderOrders();
  }
  function renderOverview() {
    const root = $("adminMetrics");
    root.replaceChildren();
    if (!state.ordersReady) {
      blank(root, "Buyurtma ko‘rsatkichlari yuklanmoqda…");
      return;
    }
    const live = orders.filter((o) => o.order_status !== "cancelled"),
      paid = orders.filter((o) => o.payment_status === "paid");
    const attention = live.filter((o) =>
      ["receipt_submitted", "under_review"].includes(o.payment_status),
    );
    const metrics = [
      ["Yuklangan buyurtmalar", orders.length],
      ["Tekshiriladigan cheklar", attention.length],
      ["To‘langan buyurtmalar", paid.length],
      [
        "Tasdiqlangan summa",
        money(paid.reduce((s, o) => s + Number(o.total || 0), 0)),
      ],
    ];
    for (const [label, value] of metrics) {
      const el = document.createElement("section");
      el.className = "metric";
      const name = document.createElement("span");
      name.textContent = label;
      const v = document.createElement("strong");
      v.textContent = value;
      el.append(name, v);
      root.append(el);
    }
    const tasks = $("adminTasks");
    tasks.replaceChildren(
      task(`${attention.length} ta chekni tekshirish →`, () =>
        orderFilter("attention"),
      ),
      task(
        `${live.filter((o) => ["pending", "awaiting_payment"].includes(o.payment_status)).length} ta to‘lov kutilmoqda →`,
        () => orderFilter("awaiting_payment"),
      ),
    );
    if (state.productsReady) {
      const missing = products.filter(
        (p) => p.active !== false && !(p.price > 0),
      ).length;
      tasks.append(
        task(`${missing} ta mahsulotga USD narxi kerak →`, () => {
          $("adminProductStatus").value = "missing";
          state.productPage = 1;
          switchTab("products");
          renderProducts();
        }),
      );
    }
    const recent = $("adminRecent");
    recent.replaceChildren();
    for (const o of orders.slice(0, 5)) {
      const row = task(
        `${o.order_code} · ${money(o.total)} · ${paymentNames[o.payment_status] || o.payment_status}`,
        () => {
          state.orderView = "all";
          $("adminOrderSearch").value = o.order_code;
          $("adminOrderPayment").value = "";
          $("adminOrderDelivery").value = "";
          expanded.add(o.order_code);
          switchTab("orders");
          renderOrders();
        },
      );
      recent.append(row);
    }
    if (!orders.length) blank(recent, "Hali buyurtmalar yo‘q.");
  }
  function closeDialog(dialog) {
    dialog.close?.();
    dialog.remove();
  }
  function modal(title) {
    const d = document.createElement("dialog");
    d.className = "admin-dialog";
    d.setAttribute("aria-label", title);
    const header = document.createElement("div");
    header.className = "sectionHead";
    const h = document.createElement("h2");
    h.textContent = title;
    header.append(
      h,
      button("Yopish", () => closeDialog(d)),
    );
    d.append(header);
    document.body.append(d);
    return d;
  }
  function showDialog(d) {
    if (d.showModal) d.showModal();
    else d.setAttribute("open", "");
  }
  function decision(order, action) {
    return new Promise((resolve) => {
      const d = modal(
        action === "paid" ? "To‘lovni tasdiqlash" : "Chekni rad etish",
      );
      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        closeDialog(d);
      }
      d.addEventListener(
        "close",
        () => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        },
        { once: true },
      );
      d.querySelector("button").onclick = () => finish(null);
      d.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish(null);
      });
      const p = document.createElement("p");
      p.textContent =
        order.order_code +
        " · " +
        money(order.total) +
        " · " +
        (order.payment_plan==='split_50' ? (order.payment_phase==='deposit'?'1/2 · ':'2/2 · ')+uzs(order.payment_phase==='deposit'?order.deposit_uzs:order.balance_uzs) : uzs(order.total_uzs));
      d.append(p);
      const form = document.createElement("form");
      let field;
      if (action === "paid") {
        const help = document.createElement("p");
        help.className = "decision-warning";
        help.textContent =
          "Chek rasmi to‘lov tasdig‘i emas. Bank hisobingizga haqiqiy pul tushganini alohida tekshiring.";
        const label = document.createElement("label");
        label.className = "check";
        field = document.createElement("input");
        field.type = "checkbox";
        field.required = true;
        field.id = "adminFundsConfirmed";
        label.append(
          field,
          document.createTextNode("Pul bank hisobiga tushganini tekshirdim"),
        );
        form.append(help, label);
      } else {
        const label = document.createElement("label");
        label.textContent = "Mijozga ko‘rsatiladigan sabab";
        field = document.createElement("textarea");
        field.id = "adminRejectReason";
        field.required = true;
        field.maxLength = 500;
        field.rows = 4;
        label.append(field);
        form.append(label);
      }
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = action === "paid" ? "primary" : "danger";
      submit.textContent =
        action === "paid"
          ? "To‘langan deb tasdiqlash"
          : "Sabab bilan rad etish";
      form.append(submit);
      d.append(form);
      form.onsubmit = (e) => {
        e.preventDefault();
        if (action === "paid" && !field.checked) return;
        if (action === "reject" && !field.value.trim()) return;
        finish({
          reason: action === "reject" ? field.value.trim() : "",
          funds_confirmed: action === "paid",
        });
      };
      showDialog(d);
      field.focus();
    });
  }
  async function showReceipt(order, btn) {
    await busy(btn, async () => {
      const key = adminKey;
      const response = await fetch(
        "/api/admin/orders/" +
          encodeURIComponent(order.order_code) +
          "/receipt" + (order.receipt_query_phase?'?phase='+order.receipt_query_phase:''),
        { headers: { "X-Admin-Key": adminKey }, cache: "no-store" },
      );
      if (!response.ok) throw Error("Chek yuklanmadi. Qayta urinib ko‘ring.");
      const blob = await response.blob();
      if (!key || key !== adminKey) return;
      const url = URL.createObjectURL(blob),
        d = modal("To‘lov cheki · " + order.order_code),
        image = document.createElement("img");
      image.src = url;
      image.alt = "Buyurtma to‘lov cheki";
      image.className = "admin-receipt";
      const note = document.createElement("p");
      note.textContent =
        money(order.total) +
        " · " +
        (order.payment_plan==='split_50' ? (order.payment_phase==='deposit'?'1/2 · ':'2/2 · ')+uzs(order.payment_phase==='deposit'?order.deposit_uzs:order.balance_uzs) : uzs(order.total_uzs)) +
        " — bankdagi tushum bilan solishtiring.";
      d.append(note, image);
      let revoked = false;
      const cleanup = () => {
        if (!revoked) {
          URL.revokeObjectURL(url);
          revoked = true;
        }
      };
      d.addEventListener("close", cleanup, { once: true });
      d.addEventListener(
        "cancel",
        () => {
          cleanup();
          d.remove();
        },
        { once: true },
      );
      d.querySelector("button").onclick = () => {
        cleanup();
        closeDialog(d);
      };
      image.onerror = () => {
        cleanup();
        image.remove();
        note.textContent =
          "Chek rasmini ochib bo‘lmadi. Yopib qayta urinib ko‘ring.";
      };
      showDialog(d);
    });
  }
  renderOrders = function () {
    const history = state.orderView === "history";
    allOrdersButton.classList.toggle("active", !history);
    allOrdersButton.setAttribute("aria-pressed", String(!history));
    historyButton.classList.toggle("active", history);
    historyButton.setAttribute("aria-pressed", String(history));
    historyButton.textContent =
      "Yuklar tarixi" +
      (state.ordersReady
        ? " · " +
          orders.filter((o) => shippedStatuses.has(o.order_status)).length
        : "");
    historyInfo.hidden = !history;
    const root = $("ordersList");
    root.replaceChildren();
    const q = $("adminOrderSearch").value.trim().toLowerCase(),
      payment = $("adminOrderPayment").value,
      delivery = $("adminOrderDelivery").value;
    const filtered = orders.filter(
      (o) =>
        (!history || shippedStatuses.has(o.order_status)) &&
        [
          o.order_code,
          o.customer_name,
          o.phone,
          o.backup_phone,
          o.telegram_username,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q) &&
        (!payment ||
          (payment === "attention"
            ? ["receipt_submitted", "under_review"].includes(
                o.payment_status,
              ) && o.order_status !== "cancelled"
            : payment === "awaiting_payment"
              ? ["pending", "awaiting_payment"].includes(o.payment_status)
              : o.payment_status === payment)) &&
        (!delivery || o.order_status === delivery),
    );
    if (!filtered.length) {
      blank(
        root,
        state.ordersReady
          ? history
            ? "Yuklar tarixida mos buyurtma yo‘q. Filtrlarni tekshiring."
            : "Mos buyurtma topilmadi. Filtrlarni o‘zgartiring."
          : "Buyurtmalar yuklanmoqda…",
      );
      return;
    }
    const items = paginate(root, filtered, state.orderPage, (n) => {
      state.orderPage = n;
      renderOrders();
    });
    for (const o of items) {
      const card = document.createElement("article");
      card.className = "card v7-order";
      card.dataset.code = o.order_code;
      const head = document.createElement("div");
      head.className = "order-heading";
      head.innerHTML = `<div><span class="meta">${esc(formatDate(o.created_at))}</span><h3>${esc(o.order_code)}</h3></div><div class="order-amount"><strong>${money(o.total)}</strong><small>${uzs(o.total_uzs)}</small></div>`;
      card.append(head);
      if(o.payment_plan==='split_50') {
        const summary=document.createElement('p');summary.className='split-quote';
        summary.textContent='50% oldindan: '+uzs(o.deposit_uzs)+(o.deposit_paid_at?' ✓':' · kutilmoqda')+' · Qolgan 50%: '+uzs(o.balance_uzs)+(o.balance_paid_at?' ✓':' · O‘zbekistonga kelgandan keyin')+' · Kurs: '+o.exchange_rate+' · '+o.exchange_date+' · CBU';card.append(summary);
      }
      const badges = document.createElement("div");
      badges.className = "row";
      badges.append(
        statusPill(o.payment_status, paymentNames),
        statusPill(o.order_status, deliveryNames),
      );
      card.append(badges);
      const customer = document.createElement("p");
      customer.textContent = o.customer_name || "Mijoz";
      if (o.phone) {
        const a = document.createElement("a");
        a.textContent = o.phone;
        a.href = "tel:" + String(o.phone).replace(/[^\d+]/g, "");
        customer.append(" · ", a);
      }
      card.append(customer);
      const actions = document.createElement("div");
      actions.className = "order-actions";
      card.append(actions);
      if (o.receipt_path)
        actions.append(
          button(
            "Chekni ko‘rish",
            (e) => showReceipt(o, e.currentTarget),
            "secondary",
          ),
        );
      if(o.payment_plan==='split_50' && o.deposit_paid_at && o.payment_phase==='balance') actions.append(button('1/2 · Oldindan to‘lov cheki',e=>showReceipt({...o,receipt_query_phase:'deposit',payment_phase:'deposit'},e.currentTarget)));
      const locked = ["cancelled", "delivered"].includes(o.order_status);
      async function decide(action, btn) {
        await busy(btn, async () => {
          let answer = { reason: "", funds_confirmed: false };
          if (action !== "review") {
            answer = await decision(o, action);
            if (!answer) return;
          }
          await api(
            "/api/admin/orders/" +
              encodeURIComponent(o.order_code) +
              "/payment",
            {
              method: "POST",
              body: JSON.stringify({
                action,
                version: o.payment_version,
                phase: o.payment_plan==='split_50'?o.payment_phase:'',
                ...answer,
              }),
            },
          );
          toast("To‘lov holati yangilandi");
          await loadOrders();
        });
      }
      if (o.payment_status === "receipt_submitted" && !locked)
        actions.append(
          button(
            "Tekshiruvga olish",
            (e) => decide("review", e.currentTarget),
            "primary",
          ),
        );
      if (o.payment_status === "under_review" && !locked)
        actions.append(
          button(
            "Pul tushganini tasdiqlash",
            (e) => decide("paid", e.currentTarget),
            "primary",
          ),
          button(
            "Rad etish",
            (e) => decide("reject", e.currentTarget),
            "danger",
          ),
        );
      const details = document.createElement("details");
      details.open = expanded.has(o.order_code);
      details.innerHTML = "<summary>Buyurtma tafsilotlari</summary>";
      details.addEventListener("toggle", () => {
        if (details.open) expanded.add(o.order_code);
        else expanded.delete(o.order_code);
      });
      const info = document.createElement("dl");
      info.className = "order-info";
      for (const [label, value] of [
        ["Manzil", o.address],
        ["Zaxira telefon", o.backup_phone],
        ["Izoh", o.comment],
      ]) {
        if (value) {
          const dt = document.createElement("dt"),
            dd = document.createElement("dd");
          dt.textContent = label;
          dd.textContent = value;
          info.append(dt, dd);
        }
      }
      details.append(info);
      if (o.telegram_verified) {
        const p = document.createElement("p");
        p.textContent =
          "Tasdiqlangan Telegram ID: " + o.telegram_user_id + " · ";
        const a = document.createElement("a");
        a.textContent = o.telegram_username
          ? "@" + o.telegram_username
          : "Telegram chat";
        a.href =
          o.telegram_username &&
          /^[A-Za-z0-9_]{5,32}$/.test(o.telegram_username)
            ? "https://t.me/" + o.telegram_username
            : "tg://user?id=" + encodeURIComponent(o.telegram_user_id);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        p.append(a);
        details.append(p);
      } else {
        const p = document.createElement("p");
        p.className = "help";
        p.textContent = "Mehmon buyurtmasi · Telegram shaxsi tasdiqlanmagan";
        details.append(p);
      }
      for (const i of o.items || []) {
        const row = document.createElement("div");
        row.className = "v7-order-item";
        if (i.image && /^https:\/\//.test(i.image)) {
          const image = document.createElement("img");
          image.src = i.image;
          image.alt = "";
          image.loading = "lazy";
          row.append(image);
        }
        const text = document.createElement("div");
        text.textContent = `${i.title || i.product_code} × ${i.qty} · ${i.product_code} · ${i.size || "—"} / ${i.color || "—"} · ${money(i.line_total)}${i.line_total_uzs != null ? " · " + uzs(i.line_total_uzs) : ""}`;
        row.append(text);
        details.append(row);
      }
      const deliveryForm = document.createElement("div");
      deliveryForm.className = "delivery-controls";
      const label = document.createElement("label");
      label.textContent = "Yetkazish holati";
      const select = document.createElement("select");
      for (const [value, name] of Object.entries(deliveryNames)) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = name;
        opt.disabled = locked
          ? value !== o.order_status
          : ((o.payment_status !== "paid" && !o.deposit_paid_at || (o.payment_plan==='split_50' && !o.balance_paid_at && ['out_for_delivery','delivered'].includes(value)) || (o.payment_plan==='split_50' && o.payment_phase==='balance' && !['arrived_uz','out_for_delivery','delivered','cancelled'].includes(value))) &&
              !["cancelled", o.order_status].includes(value)) ||
            value === "awaiting_payment";
        select.append(opt);
      }
      select.value = o.order_status;
      select.disabled = locked;
      label.append(select);
      const save = button(
        "Holatni saqlash",
        (e) =>
          busy(e.currentTarget, async () => {
            if (select.value === o.order_status) return;
            if (
              select.value === "cancelled" &&
              !confirm("Buyurtmani bekor qilasizmi? Bu yakuniy holat.")
            )
              return;
            await api("/api/admin/orders/" + encodeURIComponent(o.order_code), {
              method: "PATCH",
              body: JSON.stringify({ order_status: select.value }),
            });
            toast("Yetkazish holati saqlandi");
            await loadOrders();
          }),
        "secondary",
      );
      save.disabled = locked;
      deliveryForm.append(label, save);
      details.append(deliveryForm);
      if (o.payment_status !== "paid" && !o.deposit_paid_at) {
        const p = document.createElement("p");
        p.className = "help";
        p.textContent =
          "Yetkazishga o‘tkazish uchun avval bankdagi tushumni tekshirib, to‘lovni tasdiqlang.";
        details.append(p);
      }
      const audit = button("To‘lov qarorlari tarixi", (e) =>
        busy(e.currentTarget, async () => {
          const history = await api(
            "/api/admin/orders/" + encodeURIComponent(o.order_code) + "/audit",
          );
          let list = details.querySelector(".v7-audit");
          if (!list) {
            list = document.createElement("pre");
            list.className = "v7-audit";
            details.append(list);
          }
          list.textContent =
            history
              .map(
                (a) =>
                  `${formatDate(a.created_at)} · ${a.actor} · ${a.installment||'full'}\n${paymentNames[a.previous_status] || a.previous_status} → ${paymentNames[a.next_status] || a.next_status}${a.reason ? "\n" + a.reason : ""}`,
              )
              .join("\n\n") || "Hali qaror yo‘q.";
        }),
      );
      details.append(audit);
      card.append(details);
      root.append(card);
    }
  };
  // Group existing editor fields instead of replacing the working product API.
  const form = $("productForm");
  form.prepend(
    Object.assign(document.createElement("h2"), {
      id: "productEditorTitle",
      textContent: "Yangi mahsulot",
    }),
  );
  const group = (title, ids) => {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = title;
    fieldset.append(legend);
    for (const id of ids) {
      const input = $(id);
      if (input) fieldset.append(input.closest("label") || input);
    }
    form.append(fieldset);
    return fieldset;
  };
  group("1. Asosiy ma’lumotlar", ["pCode", "pName", "pCategory", "pActive"]);
  const prices = group("2. Narxlar", ["pPrice", "pPriceUzs"]);
  const help = document.createElement("p");
  help.className = "help";
  help.textContent =
    "Dollar va so‘m narxlarini o‘zingiz belgilang. Kurs orqali o‘zgarmaydi.";
  prices.append(help);
  const sale = document.createElement("details");
  sale.className = "sale-editor";
  sale.innerHTML = "<summary>Aksiya va SALE narxlari</summary>";
  for (const id of ["pSalePrice", "pSalePriceUzs", "pSaleStart", "pSaleEnd"])
    sale.append($(id).closest("label"));
  form.append(sale);
  const oldImageLabel = $("pImages").closest("label");
  const uploadBox = oldImageLabel.querySelector(".burandoUploadBox");
  const urlLabel = document.createElement("label");
  urlLabel.textContent = "Rasm havolalari (ixtiyoriy, har biri yangi qatorda)";
  urlLabel.append($("pImages"));
  oldImageLabel.replaceWith(urlLabel);
  const mediaFields = group("3. Rasmlar va tavsif", [
    "pImages",
    "pDescription",
    "pDescriptionRu",
  ]);
  mediaFields.querySelector("legend").after(uploadBox);
  $("pImageFiles").classList.add("native-upload-hidden");
  $("pImageFiles").setAttribute("aria-label", "Mahsulot rasmlarini tanlash");
  $("uploadImagesBtn").removeEventListener("click", uploadProductImages);
  $("uploadImagesBtn").textContent = "＋ Rasm qo‘shish";
  $("uploadImagesBtn").onclick = () => $("pImageFiles").click();
  $("pImageFiles").onchange = () => {
    if ($("pImageFiles").files.length) uploadProductImages();
  };
  group("4. Razmer va rang", ["pSizes", "pColors"]);
  const formActions = form.querySelector(":scope > .row");
  formActions.classList.add("editor-actions");
  form.append(formActions);
  form.querySelector(":scope > .help")?.remove();
  $("pCategory").replaceChildren(
    ...Object.entries(categories).map(([value, text]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      return opt;
    }),
  );
  const codeTip = document.createElement("small");
  codeTip.textContent = "Yangi mahsulot kodi saqlanganda avtomatik beriladi.";
  $("pCode").closest("label").append(codeTip);
  let dirty = false,
    saving = false;
  form.addEventListener("input", () => (dirty = true));
  form.addEventListener("change", () => (dirty = true));
  const previousOpen = openNewProduct,
    previousEdit = editProduct,
    previousClose = closeProductForm,
    previousSave = saveProduct;
  function canLeave() {
    if ($("uploadImagesBtn").disabled) {
      toast("Rasmlar yuklanishini kuting");
      return false;
    }
    return (
      !dirty || confirm("Saqlanmagan o‘zgarishlar yo‘qoladi. Davom etasizmi?")
    );
  }
  openNewProduct = function () {
    if (saving || !canLeave()) return;
    previousOpen();
    dirty = false;
    $("productEditorTitle").textContent = "Yangi mahsulot";
    sale.open = false;
    $("pName").focus();
    form.scrollIntoView?.({ block: "start", behavior: "smooth" });
  };
  editProduct = function (code) {
    if (saving || !canLeave()) return;
    previousEdit(code);
    dirty = false;
    $("productEditorTitle").textContent =
      "Mahsulotni tahrirlash · " + $("editingCode").value;
    sale.open = !!$("pSalePrice").value;
    const p = products.find((p) => p.code === $("editingCode").value);
    $("pDescriptionRu").value = p?.description_ru || "";
    form.scrollIntoView?.({ block: "start", behavior: "smooth" });
  };
  window.editProduct = editProduct;
  closeProductForm = function () {
    if (saving) {
      previousClose();
      dirty = false;
      return;
    }
    if (canLeave()) {
      previousClose();
      dirty = false;
    }
  };
  $("newProductBtn").removeEventListener("click", previousOpen);
  $("newProductBtn").onclick = () => openNewProduct();
  $("cancelProductBtn").removeEventListener("click", previousClose);
  $("cancelProductBtn").onclick = () => {
    if (!saving) closeProductForm();
  };
  form.removeEventListener("submit", previousSave);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    if ($("uploadImagesBtn").disabled) {
      toast("Avval rasmlar yuklanishini kuting");
      return;
    }
    for (const [base, discount] of [
      ["pPrice", "pSalePrice"],
      ["pPriceUzs", "pSalePriceUzs"],
    ])
      if (
        $(discount).value !== "" &&
        Number($(discount).value) >= Number($(base).value)
      ) {
        toast("Chegirmali narx asosiy narxdan kichik bo‘lsin");
        $(discount).focus();
        return;
      }
    if (
      $("pSaleStart").value &&
      $("pSaleEnd").value &&
      $("pSaleEnd").value <= $("pSaleStart").value
    ) {
      toast("Aksiya tugashi boshlanishidan keyin bo‘lsin");
      return;
    }
    saving = true;
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    $("cancelProductBtn").disabled = true;
    try {
      await previousSave(event);
      if (form.classList.contains("hidden")) dirty = false;
    } finally {
      saving = false;
      submit.disabled = false;
      $("cancelProductBtn").disabled = false;
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  const oldShow = showAdmin;
  showAdmin = function () {
    oldShow();
    $("adminKey").value = "";
    $("adminKey").type = "password";
    reveal.textContent = "Kalitni ko‘rsatish";
    api("/healthz")
      .then((data) => {
        if (data.environment === "staging" || data.environment === "production")
          document.querySelector(".top .sub").textContent =
            (data.environment === "staging" ? "TEST" : "LIVE") +
            " · Admin panel";
      })
      .catch(() => {});
    $("logoutBtn").classList.remove("hidden");
    sessionLabel.hidden = false;
    switchTab("overview");
    loadOrders();
    renderProducts();
    renderOverview();
  };
  const oldLogout = logout;
  logout = function () {
    if (!canLeave()) return;
    dirty = false;
    oldLogout();
    errors.clear();
    errorNotice("", "");
    $("v7SettingsForm").reset();
    $("v7BannerForm").reset();
    delete $("v7BannerForm").dataset.id;
    $("v7BannerList").replaceChildren();
    notificationDetails.querySelector("pre")?.replaceChildren();
    form.reset();
    previousClose();
    products = [];
    window.__burandoAdminProducts = [];
    orders = [];
    state.ordersReady = state.productsReady = false;
    state.orderView = "all";
    expanded.clear();
    $("productsList").replaceChildren();
    $("ordersList").replaceChildren();
    $("adminMetrics").replaceChildren();
    $("adminRecent").replaceChildren();
    document.querySelectorAll(".admin-dialog").forEach(closeDialog);
    $("logoutBtn").classList.add("hidden");
    sessionLabel.hidden = true;
  };
  $("logoutBtn").removeEventListener("click", oldLogout);
  $("logoutBtn").onclick = logout;
  if (!adminKey) {
    $("logoutBtn").classList.add("hidden");
    sessionLabel.hidden = true;
  }
  const bannerCancel = button("Yangi banner / Tahrirni bekor qilish", () => {
    if ($("v7BannerForm").querySelector("input[type=file]").disabled) {
      toast("Banner rasmi yuklanishini kuting");
      return;
    }
    const f = $("v7BannerForm");
    delete f.dataset.id;
    f.reset();
    $("bannerEditorTitle").textContent = "Yangi banner";
  });
  $("v7BannerForm").append(bannerCancel);
  window.AdminWorkspace = {
    refresh: () => Promise.all([loadProducts(), loadOrders()]),
  };
})();
