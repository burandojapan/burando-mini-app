const $ = id => document.getElementById(id);

let adminKey =
  localStorage.getItem("burandoAdminKey") || "";

let products = [];
let orders = [];

function toast(message) {
  const el = $("toast");

  el.textContent = message;

  el.classList.remove("hidden");

  clearTimeout(window.__toastTimer);

  window.__toastTimer =
    setTimeout(() => {
      el.classList.add("hidden");
    }, 2500);
}

async function api(
  url,
  options = {}
) {
  const headers = {
    ...(options.headers || {}),
    "X-Admin-Key": adminKey,
  };

  if (
    options.body &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  const response = await fetch(
    url,
    {
      ...options,
      headers,
    }
  );

  let data = {};

  try {
    data = await response.json();
  }
  catch (_) {}

  if (!response.ok) {
    throw new Error(
      data.detail ||
      `HTTP ${response.status}`
    );
  }

  return data;
}

function lines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function valueList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed
      : [String(parsed)];
  }
  catch (_) {
    return [String(value)];
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showAdmin() {
  $("loginBox")
    .classList.add("hidden");

  $("adminApp")
    .classList.remove("hidden");
}

function showLogin() {
  $("adminApp")
    .classList.add("hidden");

  $("loginBox")
    .classList.remove("hidden");
}

async function login() {
  adminKey =
    $("adminKey").value.trim();

  if (!adminKey) {
    toast("Admin kalitini kiriting");
    return;
  }

  try {
    await api(
      "/api/admin/products"
    );

    localStorage.setItem(
      "burandoAdminKey",
      adminKey
    );

    showAdmin();

    await loadProducts();

    toast("Admin panel ochildi");
  }
  catch (error) {
    toast(
      "Kirish xatosi: " +
      error.message
    );
  }
}

function logout() {
  localStorage.removeItem(
    "burandoAdminKey"
  );

  adminKey = "";

  $("adminKey").value = "";

  showLogin();
}

async function loadProducts() {
  try {
    products =
      await api(
        "/api/admin/products"
      );

    renderProducts();
  }
  catch (error) {
    toast(error.message);
  }
}

function renderProducts() {
  const box = $("productsList");

  if (!products.length) {
    box.innerHTML =
      '<div class="card">Mahsulot yo‘q</div>';

    return;
  }

  box.innerHTML =
    products.map(p => {

      const images =
        valueList(p.images);

      const image =
        images[0] || "";

      return `
        <div class="item">

          <div class="productRow">

            ${
              image
                ? `<img src="${escapeHtml(image)}">`
                : `<div style="
                    width:80px;
                    height:80px;
                    background:#eee;
                    border-radius:12px">
                   </div>`
            }

            <div class="grow">

              <div class="title">
                ${escapeHtml(p.name)}
              </div>

              <div class="meta">
                ${escapeHtml(p.code)}
                ·
                ${escapeHtml(p.category)}
              </div>

              <div class="price">
                $${Number(p.price || 0).toFixed(2)}
              </div>

              <span class="badge">
                ${
                  p.active === false
                    ? "Yashirilgan"
                    : "Saytda"
                }
              </span>

            </div>

          </div>

          <div
            class="row"
            style="margin-top:12px"
          >

            <button
              class="secondary"
              onclick="editProduct(
                '${encodeURIComponent(p.code)}'
              )"
            >
              ✏️ Tahrirlash
            </button>

            ${
              p.active === false
                ? ""
                : `
                  <button
                    class="danger"
                    onclick="hideProduct(
                      '${encodeURIComponent(p.code)}'
                    )"
                  >
                    🗑 Yashirish
                  </button>
                `
            }

          </div>

        </div>
      `;
    }).join("");
}

function openNewProduct() {
  $("editingCode").value = "";

  $("productForm").reset();

  $("pActive").checked = true;

  if (document.getElementById("pImageFiles")) {
    document.getElementById("pImageFiles").value = "";
  }

  if (document.getElementById("uploadStatus")) {
    document.getElementById("uploadStatus").textContent = "";
  }

  renderImagePreview();

  $("productForm")
    .classList.remove("hidden");

  $("pCode").focus();
}

function closeProductForm() {
  $("productForm")
    .classList.add("hidden");
}

function editProduct(
  encodedCode
) {
  const code =
    decodeURIComponent(
      encodedCode
    );

  const p =
    products.find(
      x => x.code === code
    );

  if (!p) {
    return;
  }

  $("editingCode").value =
    p.code || "";

  $("pCode").value =
    p.code || "";

  $("pName").value =
    p.name || "";

  $("pPrice").value =
    p.price ?? "";

  $("pCategory").value =
    p.category || "accessories";

  $("pDescription").value =
    p.description || "";

  $("pImages").value =
    valueList(
      p.images
    ).join("\n");

  renderImagePreview();

  $("pSizes").value =
    valueList(
      p.sizes
    ).join("\n");

  $("pColors").value =
    valueList(
      p.colors
    ).join("\n");

  $("pActive").checked =
    p.active !== false;

  $("productForm")
    .classList.remove("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}



// =================================================
// BURANDO ADMIN IMAGE UPLOAD V3
// =================================================

async function uploadProductImages() {
  const input = document.getElementById("pImageFiles");
  const button = document.getElementById("uploadImagesBtn");
  const status = document.getElementById("uploadStatus");
  const textarea = document.getElementById("pImages");

  if (!input || !textarea) {
    toast("Rasm yuklash elementi topilmadi");
    return;
  }

  const files = Array.from(input.files || []);

  if (!files.length) {
    toast("Avval rasm tanlang");
    return;
  }

  if (button) {
    button.disabled = true;
  }

  const currentUrls = String(textarea.value || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const uploadedUrls = [];

  try {

    for (let i = 0; i < files.length; i++) {

      const file = files[i];

      if (status) {
        status.textContent =
          `⏳ Yuklanmoqda ${i + 1}/${files.length}: ${file.name}`;
      }

      const form = new FormData();

      form.append(
        "file",
        file,
        file.name
      );

      const response = await fetch(
        "/api/admin/upload",
        {
          method: "POST",
          headers: {
            "X-Admin-Key": adminKey
          },
          body: form
        }
      );

      let data = {};

      try {
        data = await response.json();
      } catch (_) {}

      if (!response.ok) {
        throw new Error(
          data.detail ||
          `Upload xatosi HTTP ${response.status}`
        );
      }

      if (!data.url) {
        throw new Error(
          "Server rasm URL qaytarmadi"
        );
      }

      uploadedUrls.push(data.url);
    }

    const allUrls = [
      ...currentUrls,
      ...uploadedUrls
    ];

    textarea.value =
      [...new Set(allUrls)].join("\n");

    input.value = "";

    renderImagePreview();

    if (status) {
      status.textContent =
        `✅ ${uploadedUrls.length} ta rasm yuklandi`;
    }

    toast(
      `✅ ${uploadedUrls.length} ta rasm yuklandi`
    );

  } catch (error) {

    console.error(error);

    if (status) {
      status.textContent =
        "❌ " + error.message;
    }

    toast(
      "Rasm yuklash xatosi: " +
      error.message
    );

  } finally {

    if (button) {
      button.disabled = false;
    }
  }
}


function renderImagePreview() {
  const textarea =
    document.getElementById("pImages");

  const preview =
    document.getElementById("imagePreview");

  if (!textarea || !preview) {
    return;
  }

  const urls = String(textarea.value || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  if (!urls.length) {
    preview.innerHTML = "";
    return;
  }

  preview.innerHTML = urls.map(
    (url, index) => `
      <div class="previewItem">

        <img
          src="${escapeHtml(url)}"
          alt="Mahsulot rasmi"
          loading="lazy"
        >

        <button
          type="button"
          class="previewRemove"
          onclick="removeProductImage(${index})"
          title="Rasmni olib tashlash"
        >
          ×
        </button>

      </div>
    `
  ).join("");
}


function removeProductImage(index) {
  const textarea =
    document.getElementById("pImages");

  if (!textarea) return;

  const urls = String(textarea.value || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  urls.splice(index, 1);

  textarea.value = urls.join("\n");

  renderImagePreview();
}


async function saveProduct(event) {
  event.preventDefault();

  const editing =
    $("editingCode").value.trim();

  const payload = {
    code:
      $("pCode").value.trim(),

    name:
      $("pName").value.trim(),

    price:
      Number(
        $("pPrice").value
      ),

    category:
      $("pCategory").value,

    description:
      $("pDescription")
        .value.trim(),

    images:
      lines(
        $("pImages").value
      ),

    sizes:
      lines(
        $("pSizes").value
      ),

    colors:
      lines(
        $("pColors").value
      ),

    active:
      $("pActive").checked,
  };

  try {
    if (editing) {
      await api(
        `/api/admin/products/${
          encodeURIComponent(editing)
        }`,
        {
          method: "PUT",
          body:
            JSON.stringify(payload),
        }
      );

      toast("Mahsulot yangilandi");
    }
    else {
      await api(
        "/api/admin/products",
        {
          method: "POST",
          body:
            JSON.stringify(payload),
        }
      );

      toast("Mahsulot qo‘shildi");
    }

    closeProductForm();

    await loadProducts();
  }
  catch (error) {
    toast(
      "Xato: " +
      error.message
    );
  }
}

async function hideProduct(
  encodedCode
) {
  const code =
    decodeURIComponent(
      encodedCode
    );

  if (
    !confirm(
      `${code} mahsulotini saytdan yashiraymi?`
    )
  ) {
    return;
  }

  try {
    await api(
      `/api/admin/products/${
        encodeURIComponent(code)
      }`,
      {
        method: "DELETE",
      }
    );

    toast("Mahsulot yashirildi");

    await loadProducts();
  }
  catch (error) {
    toast(error.message);
  }
}

async function loadOrders() {
  try {
    orders =
      await api(
        "/api/admin/orders"
      );

    renderOrders();
  }
  catch (error) {
    toast(error.message);
  }
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  try {
    return new Date(
      value
    ).toLocaleString();
  }
  catch (_) {
    return value;
  }
}

function renderOrders() {
  const box =
    $("ordersList");

  if (!orders.length) {
    box.innerHTML =
      '<div class="card">Hozircha buyurtma yo‘q</div>';

    return;
  }

  box.innerHTML =
    orders.map(order => {

      const items =
        Array.isArray(order.items)
          ? order.items
          : [];

      const itemHtml =
        items.map(item => `
          <div class="orderItem">
            •
            ${escapeHtml(item.title)}
            ×
            ${Number(item.qty || 0)}
            —
            $${Number(
              item.line_total || 0
            ).toFixed(2)}
            ${
              item.size
                ? ` · ${escapeHtml(item.size)}`
                : ""
            }
            ${
              item.color
                ? ` · ${escapeHtml(item.color)}`
                : ""
            }
          </div>
        `).join("");

      return `
        <div class="item">

          <div class="title">
            ${escapeHtml(order.order_code)}
          </div>

          <div class="meta">
            ${escapeHtml(order.customer_name)}
            ·
            ${escapeHtml(order.phone)}
          </div>

          <div class="meta">
            📍
            ${escapeHtml(order.address)}
          </div>

          <div class="meta">
            ${escapeHtml(
              formatDate(order.created_at)
            )}
          </div>

          <div class="price">
            $${Number(
              order.total || 0
            ).toFixed(2)}
          </div>

          <span
            class="badge ${
              escapeHtml(
                order.payment_status
              )
            }"
          >
            To‘lov:
            ${escapeHtml(
              order.payment_status
            )}
          </span>

          <span class="badge">
            Buyurtma:
            ${escapeHtml(
              order.order_status
            )}
          </span>

          <div class="orderItems">
            ${itemHtml}
          </div>

          <div class="orderControls">

            <select
              id="payment-${
                escapeHtml(order.order_code)
              }"
            >
              <option
                value="pending"
                ${
                  order.payment_status === "pending"
                    ? "selected"
                    : ""
                }
              >
                To‘lov kutilmoqda
              </option>

              <option
                value="paid"
                ${
                  order.payment_status === "paid"
                    ? "selected"
                    : ""
                }
              >
                To‘landi
              </option>

              <option
                value="failed"
                ${
                  order.payment_status === "failed"
                    ? "selected"
                    : ""
                }
              >
                To‘lov xato
              </option>

              <option
                value="cancelled"
                ${
                  order.payment_status === "cancelled"
                    ? "selected"
                    : ""
                }
              >
                Bekor qilindi
              </option>

              <option
                value="refunded"
                ${
                  order.payment_status === "refunded"
                    ? "selected"
                    : ""
                }
              >
                Pul qaytarildi
              </option>
            </select>

            <select
              id="status-${
                escapeHtml(order.order_code)
              }"
            >

              <option value="waiting_payment">
                To‘lov kutilmoqda
              </option>

              <option value="paid">
                To‘landi
              </option>

              <option value="processing">
                Tayyorlanmoqda
              </option>

              <option value="shipped">
                Yuborildi
              </option>

              <option value="completed">
                Yakunlandi
              </option>

              <option value="cancelled">
                Bekor qilindi
              </option>

            </select>

          </div>

          <button
            class="primary"
            style="
              width:100%;
              margin-top:8px
            "
            onclick="saveOrderStatus(
              '${encodeURIComponent(
                order.order_code
              )}'
            )"
          >
            Holatni saqlash
          </button>

        </div>
      `;
    }).join("");

  for (
    const order of orders
  ) {
    const el =
      document.getElementById(
        `status-${order.order_code}`
      );

    if (el) {
      el.value =
        order.order_status;
    }
  }
}

async function saveOrderStatus(
  encodedCode
) {
  const code =
    decodeURIComponent(
      encodedCode
    );

  const payment =
    document.getElementById(
      `payment-${code}`
    ).value;

  const status =
    document.getElementById(
      `status-${code}`
    ).value;

  try {
    await api(
      `/api/admin/orders/${
        encodeURIComponent(code)
      }`,
      {
        method: "PATCH",
        body:
          JSON.stringify({
            payment_status:
              payment,

            order_status:
              status,
          }),
      }
    );

    toast("Buyurtma yangilandi");

    await loadOrders();
  }
  catch (error) {
    toast(error.message);
  }
}

function switchTab(tab) {
  document
    .querySelectorAll(".tab")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tab
      );
    });

  $("productsTab")
    .classList.toggle(
      "hidden",
      tab !== "products"
    );

  $("ordersTab")
    .classList.toggle(
      "hidden",
      tab !== "orders"
    );

  if (tab === "orders") {
    loadOrders();
  }
}

$("loginBtn")
  .addEventListener(
    "click",
    login
  );

$("logoutBtn")
  .addEventListener(
    "click",
    logout
  );

$("newProductBtn")
  .addEventListener(
    "click",
    openNewProduct
  );

$("cancelProductBtn")
  .addEventListener(
    "click",
    closeProductForm
  );

$("productForm")
  .addEventListener(
    "submit",
    saveProduct
  );

$("refreshOrdersBtn")
  .addEventListener(
    "click",
    loadOrders
  );

document
  .querySelectorAll(".tab")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => switchTab(
        button.dataset.tab
      )
    );
  });

window.editProduct =
  editProduct;

window.hideProduct =
  hideProduct;

window.saveOrderStatus =
  saveOrderStatus;




const burandoUploadButton =
  document.getElementById("uploadImagesBtn");

if (burandoUploadButton) {
  burandoUploadButton.addEventListener(
    "click",
    uploadProductImages
  );
}

const burandoImagesTextarea =
  document.getElementById("pImages");

if (burandoImagesTextarea) {
  burandoImagesTextarea.addEventListener(
    "input",
    renderImagePreview
  );
}

window.removeProductImage =
  removeProductImage;


(async function start() {
  if (!adminKey) {
    showLogin();
    return;
  }

  try {
    await api(
      "/api/admin/products"
    );

    showAdmin();

    await loadProducts();
  }
  catch (_) {
    localStorage.removeItem(
      "burandoAdminKey"
    );

    adminKey = "";

    showLogin();
  }
})();
