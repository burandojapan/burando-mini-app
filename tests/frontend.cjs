// Run with NODE_PATH pointing to test dependencies (jsdom).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const sample = {
  id: "BD-000001",
  title_uz: "Test oyoq kiyim",
  title_ru: "Тестовая обувь",
  price: 150,
  original_price: 200,
  is_sale: true,
  discount_percent: 25,
  category: "shoes",
  brand: "On",
  image: "https://example.invalid/shoe.jpg",
  images: ["https://example.invalid/shoe.jpg"],
  desc_uz: "Tavsif",
  desc_ru: "Описание",
  sizes: ["42"],
  colors_uz: ["Oq"],
  colors_ru: ["Oq"],
};
(async () => {
  const errors = [];
  const requests = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));
  const dom = new JSDOM(fs.readFileSync("static/index.html", "utf8"), {
    url: "https://burando.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  Object.defineProperty(w, "crypto", {
    value: require("node:crypto").webcrypto,
  });
  w.TextEncoder = TextEncoder;
  w.AbortSignal = AbortSignal;
  w.matchMedia = () => ({ matches: false });
  w.alert = () => {};
  w.navigator.clipboard = { writeText: async () => {} };
  w.fetch = async (url, options = {}) => {
    requests.push([url, options]);
    let data;
    if (url === "/api/products") data = [sample];
    else if (url === "/api/settings")
      data = {
        payment_details_uz: "Test rekvizit",
        payment_details_ru: "Тестовые реквизиты",
      };
    else if (url === "/api/banners") data = [];
    else if (url === "/api/order")
      data = { ok: true, order_code: "BR-TEST", total: 150 };
    else if (url.startsWith("/api/orders/"))
      data = {
        order_code: "BR-TEST",
        total: 150,
        payment_status: "awaiting_payment",
        order_status: "received",
        items: [],
      };
    else throw Error("Unexpected request " + url);
    return { ok: true, json: async () => data };
  };
  w.eval(
    fs.readFileSync("static/app.js", "utf8") +
      "\n" +
      fs.readFileSync("static/v7.js", "utf8"),
  );
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(
    w.document.querySelector("#v7Loading").hidden,
    true,
    "loader disappears on ready",
  );
  assert.equal(w.document.querySelectorAll(".product-card").length, 1);
  assert.equal(w.document.querySelector(".v7-sale").textContent, "−25%");
  w.document.querySelector(".v7-favorite").click();
  assert.match(w.localStorage.getItem("burando_favorites"), /BD-000001/);
  w.document.querySelector("#langBtn").click();
  assert.equal(w.document.documentElement.lang, "ru");
  assert.match(
    w.document.querySelector(".product-card h3").textContent,
    /обувь/,
  );
  w.eval("openProduct('BD-000001')");
  assert.equal(
    w.document.querySelectorAll("#v7DetailActions button").length,
    2,
  );
  w.document.querySelector("#detailAddBtn").click();
  assert.equal(w.document.querySelector("#cartCount").textContent, "1");
  const values = {
    customerName: "Demo Buyer",
    customerPhone: "+998901234567",
    customerAddress: "Demo address",
  };
  for (const [id, value] of Object.entries(values))
    w.document.getElementById(id).value = value;
  w.document
    .querySelector("#checkoutForm")
    .dispatchEvent(new w.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 50));
  const payload = JSON.parse(
    requests.find(([u]) => u === "/api/order")[1].body,
  );
  assert.equal(payload.lookup_token.length, 64);
  assert.match(payload.idempotency_key, /^[\da-f-]{36}$/);
  assert.equal(
    w.document.querySelector("#paymentModal").classList.contains("open"),
    true,
  );
  assert.equal(w.document.querySelector("#receiptGallery").disabled, false);
  assert.match(w.localStorage.getItem("burando_order_access"), /BR-TEST/);
  assert.equal(errors.length, 0, errors.map((e) => e.message).join("\n"));
  console.log(
    "Frontend: catalog, loading, SALE, favorites, RU, detail, cart, checkout, payment PASS",
  );
  dom.window.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
