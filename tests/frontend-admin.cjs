const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM, VirtualConsole } = require("jsdom");
(async () => {
  const errors = [],
    requests = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));
  const dom = new JSDOM(fs.readFileSync("static/admin.html", "utf8"), {
    url: "https://burando.test/admin",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.confirm = () => true;
  w.scrollTo = () => {};
  w.prompt = () => "Demo reason";
  let receiptUrls = 0,
    revokedUrls = 0;
  w.URL.createObjectURL = () => {
    receiptUrls++;
    return "blob:test-receipt";
  };
  w.URL.revokeObjectURL = () => revokedUrls++;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  let manyProducts = false,
    failProducts = false,
    includeShipments = false;
  w.fetch = async (url, options = {}) => {
    if (url === "/api/admin/products" && failProducts)
      throw Error("Test connection failure");
    requests.push([url, options]);
    let data = [];
    if (url === "/api/admin/products")
      data = [
        {
          code: "BD-000001",
          name: "Shoe",
          price: 185,
          price_uzs: 1999000,
          category: "shoes",
          active: true,
          images: [],
          sizes: ["42"],
          colors: ["White"],
        },
      ];
    if (url === "/api/admin/products" && manyProducts)
      data = Array.from({ length: 25 }, (_, i) => ({
        ...data[0],
        code: "BD-" + String(i + 1).padStart(6, "0"),
        name: "Product " + i,
      }));
    if (url === "/api/admin/orders")
      data = [
        {
          order_code: "BR-TEST",
          customer_name: "Demo",
          phone: "12345",
          address: "Demo",
          total: 185,
          payment_status: "under_review",
          payment_version: 2,
          order_status: "received",
          items: [],
          receipt_path: "1/test.jpg",
          telegram_verified: true,
          telegram_user_id: "42",
          telegram_username: "demo_user",
        },
      ];
    if (url === "/api/admin/upload")
      data = { url: "https://images.example/new.jpg" };
    if (url === "/api/admin/orders" && includeShipments)
      data.push(
        {
          ...data[0],
          order_code: "BR-SHIPPED",
          payment_status: "paid",
          order_status: "shipped_japan",
        },
        {
          ...data[0],
          order_code: "BR-DELIVERED",
          payment_status: "paid",
          order_status: "delivered",
        },
        {
          ...data[0],
          order_code: "BR-PREPARING",
          payment_status: "paid",
          order_status: "preparing_japan",
        },
      );
    if (url === "/api/settings") data = { payment_details_uz: "Demo only" };
    if (url.includes("/payment")) data = { ok: true };
    return {
      ok: true,
      json: async () => data,
      clone: () => ({ json: async () => data }),
      blob: async () => new w.Blob(["demo"], { type: "image/jpeg" }),
    };
  };
  w.eval(
    fs.readFileSync("static/admin.js", "utf8") +
      "\n" +
      fs.readFileSync("static/admin-v7.js", "utf8") +
      "\n" +
      fs.readFileSync("static/admin-workspace.js", "utf8"),
  );
  w.document.querySelector("#adminKey").value = "test-admin";
  w.document.querySelector("#loginBtn").click();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(
    w.document.querySelector("#adminApp").classList.contains("hidden"),
    false,
  );
  assert.equal(w.sessionStorage.getItem("burandoAdminKey"), "test-admin");
  assert.equal(w.localStorage.getItem("burandoAdminKey"), null);
  w.document.querySelector("[data-tab=orders]").click();
  await new Promise((r) => setTimeout(r, 30));
  const paid = [...w.document.querySelectorAll("button")].find(
    (b) => b.textContent === "Pul tushganini tasdiqlash",
  );
  assert.ok(paid);
  paid.click();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(
    requests.filter(([u]) => u.endsWith("/payment")).length,
    0,
    "opening confirmation never marks paid",
  );
  const decision = w.document.querySelector(".admin-dialog form");
  decision.dispatchEvent(new w.Event("submit", { cancelable: true }));
  assert.equal(
    requests.filter(([u]) => u.endsWith("/payment")).length,
    0,
    "funds checkbox required",
  );
  w.document.querySelector("#adminFundsConfirmed").checked = true;
  decision.dispatchEvent(new w.Event("submit", { cancelable: true }));
  paid.click();
  await new Promise((r) => setTimeout(r, 30));
  const body = JSON.parse(
    requests.find(([u]) => u.endsWith("/payment"))[1].body,
  );
  assert.equal(body.funds_confirmed, true);
  assert.equal(body.version, 2);
  w.document.querySelector("#v7LoadSettings").click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(
    w.document.querySelector("[name=payment_details_uz]").value,
    "Demo only",
  );
  assert.equal(
    requests.filter(([u]) => u.endsWith("/payment")).length,
    1,
    "duplicate confirmation cannot post twice",
  );
  assert.equal(w.document.querySelectorAll(".tab").length, 5);
  assert.equal(
    w.document.querySelector("#v7SettingsForm").closest(".tabPage").id,
    "settingsTab",
  );
  assert.equal(
    w.document.querySelector("#v7BannerForm").closest(".tabPage").id,
    "bannersTab",
  );
  const search = w.document.querySelector("#adminOrderSearch");
  search.value = "not-present";
  search.dispatchEvent(new w.Event("input"));
  assert.equal(w.document.querySelectorAll(".v7-order").length, 0);
  search.value = "BR-TEST";
  search.dispatchEvent(new w.Event("input"));
  assert.equal(w.document.querySelectorAll(".v7-order").length, 1);
  assert.match(
    w.document.querySelector(".status-under_review").textContent,
    /Tekshiruvda/,
  );
  const receipt = [...w.document.querySelectorAll(".v7-order button")].find(
    (b) => b.textContent === "Chekni ko‘rish",
  );
  receipt.click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(receiptUrls, 1);
  assert.ok(w.document.querySelector(".admin-receipt"));
  w.document.querySelector(".admin-dialog button").click();
  assert.equal(revokedUrls, 1);
  const reject = [...w.document.querySelectorAll(".v7-order button")].find(
    (b) => b.textContent === "Rad etish",
  );
  reject.click();
  await new Promise((r) => setTimeout(r, 5));
  const rejectForm = w.document.querySelector(".admin-dialog form");
  rejectForm.dispatchEvent(new w.Event("submit", { cancelable: true }));
  assert.equal(requests.filter(([u]) => u.endsWith("/payment")).length, 1);
  w.document.querySelector("#adminRejectReason").value =
    "Pul hisobga tushmagan";
  rejectForm.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(
    JSON.parse(requests.filter(([u]) => u.endsWith("/payment"))[1][1].body)
      .reason,
    "Pul hisobga tushmagan",
  );
  const productSearch = w.document.querySelector("#adminProductSearch");
  productSearch.value = "missing";
  productSearch.dispatchEvent(new w.Event("input"));
  assert.equal(w.document.querySelectorAll(".admin-product").length, 0);
  productSearch.value = "BD-000001";
  productSearch.dispatchEvent(new w.Event("input"));
  assert.equal(w.document.querySelectorAll(".admin-product").length, 1);
  assert.ok(w.document.querySelector("#pSalePrice"));
  w.editProduct(encodeURIComponent("BD-000001"));
  assert.equal(w.document.querySelector("#pPriceUzs").value, "1999000");
  const files = w.document.querySelector("#pImageFiles");
  Object.defineProperty(files, "files", {
    value: [new w.File(["image"], "new.jpg", { type: "image/jpeg" })],
    configurable: true,
  });
  files.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(
    w.document.querySelector("#pImages").value,
    "https://images.example/new.jpg",
    "picker uploads and preserves image URL",
  );
  w.document.querySelector("#pPriceUzs").value = "2123456";
  w.document
    .querySelector("#productForm")
    .dispatchEvent(new w.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  const saved = requests.find(
    ([url, opts]) =>
      url === "/api/admin/products/BD-000001" && opts.method === "PUT",
  );
  assert.ok(saved);
  assert.equal(JSON.parse(saved[1].body).price_uzs, 2123456);
  assert.ok(w.document.querySelector("#v7BannerForm"));
  const bannerForm = w.document.querySelector("#v7BannerForm"),
    bannerFile = bannerForm.querySelector("input[type=file]");
  bannerForm.dataset.id = "editing-test";
  Object.defineProperty(bannerFile, "files", {
    value: [new w.File(["image"], "banner.jpg", { type: "image/jpeg" })],
    configurable: true,
  });
  bannerFile.dispatchEvent(new w.Event("change"));
  assert.equal(
    bannerForm.querySelector("[type=submit]").disabled,
    true,
    "cannot save while banner uploads",
  );
  [...bannerForm.querySelectorAll("button")].at(-1).click();
  assert.equal(
    bannerForm.dataset.id,
    "editing-test",
    "cannot swap editor while upload pending",
  );
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(bannerForm.querySelector("[type=submit]").disabled, false);

  assert.equal(
    w.document
      .querySelector("#pDescriptionRu")
      .closest("label")
      .querySelectorAll("textarea").length,
    1,
    "UZ and RU labels are separate",
  );
  assert.match(
    w.document.querySelector("#adminMetrics").textContent,
    /Tasdiqlangan summa/,
  );
  const delivery = w.document.querySelector(".delivery-controls select");
  assert.equal(
    [...delivery.options].find((o) => o.value === "shipped_japan").disabled,
    true,
    "unpaid order cannot be shipped in the UI",
  );
  productSearch.value = "";
  manyProducts = true;
  await w.AdminWorkspace.refresh();
  assert.equal(w.document.querySelectorAll(".admin-product").length, 20);
  w.document
    .querySelector("#productsList .pagination button:last-child")
    .click();
  assert.equal(w.document.querySelectorAll(".admin-product").length, 5);
  failProducts = true;
  await w.AdminWorkspace.refresh();
  assert.equal(
    w.document.querySelector("#adminNotice").classList.contains("hidden"),
    false,
    "successful orders load cannot hide a product failure",
  );
  failProducts = false;
  await w.AdminWorkspace.refresh();
  assert.equal(
    w.document.querySelector("#adminNotice").classList.contains("hidden"),
    true,
  );

  includeShipments = true;
  await w.AdminWorkspace.refresh();
  search.value = "";
  search.dispatchEvent(new w.Event("input"));
  w.document.querySelector("#adminShipmentHistory").click();
  assert.equal(
    w.document.querySelectorAll(".v7-order").length,
    2,
    "history includes shipped and delivered, excludes pending and preparation",
  );
  assert.equal(
    w.document
      .querySelector("#adminShipmentHistory")
      .getAttribute("aria-pressed"),
    "true",
  );
  search.value = "BR-DELIVERED";
  search.dispatchEvent(new w.Event("input"));
  assert.equal(
    w.document.querySelectorAll(".v7-order").length,
    1,
    "history is searchable",
  );
  w.document.querySelector("#adminAllOrders").click();
  assert.equal(
    w.document.querySelectorAll(".v7-order").length,
    4,
    "all orders remain available",
  );
  const refresh = w.document.querySelector("#refreshOrdersBtn");
  assert.equal(refresh.getAttribute("aria-label"), "Yangilash");
  assert.ok(refresh.querySelector("svg"));
  w.document.querySelector("#logoutBtn").click();
  assert.equal(w.sessionStorage.getItem("burandoAdminKey"), null);
  assert.equal(
    w.document.querySelectorAll(".v7-order").length,
    0,
    "logout clears customer information",
  );
  assert.equal(errors.length, 0, errors.map((e) => e.message).join("\n"));
  console.log(
    "Admin frontend: five sections, search/filters, private receipt cleanup, explicit funds confirmation, duplicate prevention, rejection reason, dual prices, editor and logout PASS",
  );
  dom.window.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
