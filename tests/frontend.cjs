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
  images: ["https://example.invalid/shoe.jpg", "https://example.invalid/shoe2.jpg"],
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
  w.scrollTo = () => {};
  const viewport=new w.EventTarget();viewport.height=800;w.visualViewport=viewport;
  w.navigator.clipboard = { writeText: async () => {} };
  w.URL.createObjectURL=()=> 'blob:test-photo';w.URL.revokeObjectURL=()=>{};
  w.fetch = async (url, options = {}) => {
    requests.push([url, options]);
    let data;
    if (url === "/api/products") data = [sample];
    else if (url === "/api/settings")
      data = {
        payment_details_uz: "Test rekvizit",
        payment_details_ru: "Тестовые реквизиты",
      };
    else if (url === "/api/banners") data = [{image:sample.image,title_uz:'TEST',title_ru:'ТЕСТ',link:'/?category=sale'}];
    else if (url === "/api/order")
      data = { ok: true, order_code: "BR-TEST", total: 150 };
    else if (url === '/api/search/image') data={ids:[sample.id],partial:false};
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
      fs.readFileSync("static/v7.js", "utf8") + "\n" + fs.readFileSync("static/storefront-ui.js", "utf8") + "\n" + fs.readFileSync("static/catalog-tools.js", "utf8") + "\n" + fs.readFileSync("static/image-search.js", "utf8"),
  );
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(
    w.document.querySelector("#v7Loading").hidden,
    true,
    "loader disappears on ready",
  );
  assert.equal(w.document.querySelectorAll(".product-card").length, 1);
  assert.equal(w.document.querySelector(".v7-sale").textContent, "−25%");
  const panel=w.document.querySelector('#searchPanel');
  assert.equal(panel.hidden,false,'search field is always visible below the header');
  assert.equal(w.document.querySelector('#headerSearch'),null);
  assert.equal(w.document.querySelector('header').nextElementSibling,panel);
  const search=w.document.querySelector('#search');search.focus();assert.ok(w.document.body.classList.contains('search-mode'));
  viewport.height=450;viewport.dispatchEvent(new w.Event('resize'));assert.ok(w.document.body.classList.contains('search-keyboard'));
  viewport.height=800;viewport.dispatchEvent(new w.Event('resize'));assert.ok(!w.document.body.classList.contains('search-keyboard'));
  search.value='On';
  w.document.querySelector('#searchForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert.equal(w.document.querySelectorAll('.product-card').length,1,'brand text search');search.value='';
  w.document.querySelector('#openImageSearch').click();
  const imageInput=w.document.querySelector('#imageSearchFile');
  Object.defineProperty(imageInput,'files',{configurable:true,value:[new w.File(['invalid'],'photo.heic',{type:'image/heic'})]});
  imageInput.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelector('#runImageSearch').disabled,true);
  Object.defineProperty(imageInput,'files',{configurable:true,value:[new w.File(['test'],'photo.png',{type:'image/png'})]});
  imageInput.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelector('#runImageSearch').disabled,false);
  w.document.querySelector('#runImageSearch').click();await new Promise(r=>setTimeout(r,20));
  assert.ok(!w.document.querySelector('#imageSearchModal').classList.contains('open'));
  assert.equal(w.document.querySelector('#imageSearchResult').hidden,false);
  assert.ok(requests.some(([url])=>url==='/api/search/image'));
  w.document.querySelector('#clearImageSearch').click();
  assert.equal(w.document.querySelector('#imageSearchResult').hidden,true);
  w.document.querySelector('#closeSearchPanel').click();assert.equal(panel.hidden,false);assert.equal(search.value,'');assert.ok(!w.document.body.classList.contains('search-mode'));
  assert.equal(w.document.querySelectorAll('#v7Banner .v7-banner-controls').length,0,'one banner has no redundant arrows');
  const filters=w.document.querySelector('#filtersModal');
  w.document.querySelector('#openFilters').click();
  assert.ok(filters.classList.contains('open'));
  assert.equal(w.document.querySelector('#bottomNav').inert,true);
  const min=w.document.querySelector('#minPrice'),max=w.document.querySelector('#maxPrice');
  min.value='160'; min.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(w.document.querySelectorAll('.product-card').length,0);
  assert.match(w.document.querySelector('#applyFilters').textContent,/0/);
  w.document.querySelector('#closeFilters').click();
  assert.equal(min.value,'','cancel discards draft filters');
  assert.equal(w.document.querySelectorAll('.product-card').length,1);
  assert.notEqual(w.document.querySelector('#bottomNav').inert,true);
  w.document.querySelector('#openFilters').click();
  min.value='200';max.value='100';
  w.document.querySelector('#applyFilters').click();
  assert.ok(filters.classList.contains('open'),'invalid price range cannot apply');
  assert.ok(w.document.querySelector('#filterError').textContent.length>0);
  w.document.querySelector('#resetFilters').click();
  const brand=w.document.querySelector('#brandFilter');brand.value='On';brand.dispatchEvent(new w.Event('change',{bubbles:true}));
  w.document.querySelector('#applyFilters').click();
  assert.ok(!filters.classList.contains('open'));
  assert.equal(w.document.querySelector('#filterCount').textContent,'1');
  assert.equal(w.document.querySelector('#activeFilterSummary').textContent,'On');
  w.document.querySelector('#openFilters').click();w.document.querySelector('#resetFilters').click();w.document.querySelector('#applyFilters').click();
  assert.equal(w.document.querySelector('#filterCount').hidden,true);
  w.document.querySelector(".v7-favorite").click();
  assert.match(w.localStorage.getItem("burando_favorites"), /BD-000001/);
  w.document.querySelector("#langBtn").click();
  assert.equal(w.document.documentElement.lang, "ru");
  await new Promise(r=>setTimeout(r,0));
  const nav=w.document.querySelector('#bottomNav');
  assert.equal(nav.querySelector('[data-page="orders"] span').textContent,'Заказы');
  assert.equal(w.document.querySelector('#filterButtonLabel').textContent,'Фильтры');
  nav.querySelector('[data-page="info"]').click();
  assert.ok(w.document.querySelector('#infoModal').classList.contains('open'));
  w.document.querySelector('#closeInfo').click();
  nav.querySelector('[data-page="cart"]').click();
  assert.ok(w.document.querySelector('#cartDrawer').classList.contains('open'));
  w.document.querySelector('#closeCart').click();
  nav.querySelector('[data-page="orders"]').click();
  await new Promise(r=>setTimeout(r,10));
  assert.ok(w.document.querySelector('#ordersModal').classList.contains('open'));
  w.document.querySelector('#closeOrders').click();
  assert.match(
    w.document.querySelector(".product-card h3").textContent,
    /обувь/,
  );
  w.eval("openProduct('BD-000001')");
  assert.equal(
    w.document.querySelectorAll("#v7DetailActions button").length,
    2,
  );
  const viewer=w.document.querySelector('#imageViewer'), photo=w.document.querySelector('#viewerImage'), stage=w.document.querySelector('#viewerStage');
  w.document.querySelector('#detailMainImage').click();
  assert.equal(viewer.hidden,false);
  assert.equal(w.document.querySelector('#viewerCounter').textContent,'1 / 2');
  assert.equal(w.document.querySelector('#productModal').inert,true);
  w.document.querySelector('#viewerPlus').click();
  assert.match(photo.style.transform,/scale\(1.5\)/);
  assert.equal(w.document.body.style.transform,'');
  w.document.querySelector('#viewerNext').click();
  assert.equal(photo.src,sample.images[1]);
  assert.equal(w.document.querySelector('#detailMainImage').src,sample.images[1]);
  assert.match(photo.style.transform,/scale\(1\)/);
  for(const element of [stage,photo]) for(const key of ['clientWidth','clientHeight']) Object.defineProperty(element,key,{value:300});
  stage.getBoundingClientRect=()=>({left:0,top:0,width:300,height:300});
  function pointer(type,id,x,y){const e=new w.MouseEvent(type,{clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:id});stage.dispatchEvent(e);return e;}
  assert.equal(pointer('pointerdown',1,100,150).defaultPrevented,true);
  pointer('pointerdown',2,200,150);pointer('pointermove',2,300,150);
  assert.match(photo.style.transform,/scale\(2\)/,'pinch scales only the photo');
  assert.equal(w.document.body.style.transform,'');
  pointer('pointerup',2,300,150);pointer('pointerup',1,100,150);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal(viewer.hidden,true);
  assert.notEqual(w.document.querySelector('#productModal').inert,true);
  assert.equal(w.document.body.style.overflow,'hidden','underlying detail stays locked');
  assert.equal(w.document.activeElement,w.document.querySelector('#detailMainImage'));
  w.document.querySelector("#detailAddBtn").click();
  assert.equal(w.document.querySelector("#cartCount").textContent, "1");
  await new Promise(r=>setTimeout(r,0));
  assert.equal(w.document.querySelector('#bottomCartCount').textContent,'1');
  assert.equal(w.document.querySelector('#bottomCartCount').hidden,false);
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
    "Frontend: text/brand search, photo upload/search/reset, compact filters apply/cancel/reset/range, single banner, catalog, loading, SALE, favorites, RU, bottom navigation, photo pinch/zoom/gallery, detail, cart, checkout, payment PASS",
  );
  dom.window.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
