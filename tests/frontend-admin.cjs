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
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.fetch = async (url, options = {}) => {
    requests.push([url, options]);
    let data = [];
    if (url === "/api/admin/products")
      data = [
        {
          code: "BD-000001",
          name: "Shoe",
          price: 185,
          price_uzs:1999000,
          category: "shoes",
          active: true,
          images: [],
          sizes: ["42"],
          colors: ["White"],
        },
      ];
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
    if (url === "/api/settings") data = { payment_details_uz: "Demo only" };
    if (url.includes("/payment")) data = { ok: true };
    return {
      ok: true,
      json: async () => data,
      clone: () => ({ json: async () => data }),
    };
  };
  w.eval(
    fs.readFileSync("static/admin.js", "utf8") +
      "\n" +
      fs.readFileSync("static/admin-v7.js", "utf8"),
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
  assert.ok(w.document.querySelector("#pSalePrice"));
  w.editProduct(encodeURIComponent('BD-000001'));
  assert.equal(w.document.querySelector('#pPriceUzs').value,'1999000');
  w.document.querySelector('#pPriceUzs').value='2123456';
  w.document.querySelector('#productForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
  await new Promise(r=>setTimeout(r,30));
  const saved=requests.find(([url,opts])=>url==='/api/admin/products/BD-000001'&&opts.method==='PUT');
  assert.ok(saved);assert.equal(JSON.parse(saved[1].body).price_uzs,2123456);
  assert.ok(w.document.querySelector("#v7BannerForm"));
  assert.equal(errors.length, 0, errors.map((e) => e.message).join("\n"));
  console.log(
    "Admin frontend: session login, orders, manual PAID confirmation, version, settings, sale and banner forms PASS",
  );
  dom.window.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
