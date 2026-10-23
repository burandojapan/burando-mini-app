(() => {
  "use strict";
  const button = document.getElementById("smartImportPreviewBtn");
  if (!button) return;
  const status = document.getElementById("smartImportStatus");
  const result = document.getElementById("smartImportResult");
  const text = (tag, value) => {
    const el = document.createElement(tag);
    el.textContent = value || "";
    return el;
  };
  button.addEventListener("click", async () => {
    const url = document.getElementById("smartImportUrl").value.trim();
    const usd_jpy = document.getElementById("smartImportRate").value.trim();
    const key = document.getElementById("adminKey")?.value || sessionStorage.getItem("burando_admin_key") || "";
    result.replaceChildren();
    result.classList.add("hidden");
    if (!/^https:\/\/www\.on\.com\/ja-jp\/products\//.test(url) || !(Number(usd_jpy) > 0)) {
      status.textContent = "To‘g‘ri On Japan mahsulot linki va kursini kiriting.";
      return;
    }
    if (!key) {
      status.textContent = "Admin kalitini kiriting va tizimga kiring.";
      return;
    }
    button.disabled = true;
    status.textContent = "Rasmiy sahifa tekshirilmoqda…";
    try {
      const response = await fetch("/api/admin/smart-import/preview", {
        method: "POST",
        headers: {"Content-Type": "application/json", "X-Admin-Key": key},
        credentials: "same-origin",
        body: JSON.stringify({url, usd_jpy})
      });
      if (!response.ok) throw new Error(response.status === 404 ? "TEST import endpointi hali yoqilmagan." : "Tekshiruv muvaffaqiyatsiz (" + response.status + ").");
      const data = await response.json();
      result.append(text("h3", data.title || "Mahsulot"));
      result.append(text("p", data.description_preview || "Tavsif topilmadi."));
      result.append(text("p", "Rasm manzili: " + (data.image_reference || "mavjud emas")));
      result.append(text("p", "Ranglar, razmerlar va narxlar tekshirilishi kerak. Mahsulot hali joylanmadi."));
      result.classList.remove("hidden");
      status.textContent = "Dastlabki ma’lumot olindi. Admin tekshiruvi zarur.";
    } catch (err) {
      status.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
})();
