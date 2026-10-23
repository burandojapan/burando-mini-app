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
  const quoteButton = document.getElementById("smartImportPriceBtn");
  quoteButton?.addEventListener("click", async () => {
    const key = document.getElementById("adminKey")?.value || sessionStorage.getItem("burandoAdminKey") || "";
    const jpy_price = document.getElementById("smartImportJpy").value;
    const usd_jpy = document.getElementById("smartImportRate").value;
    const current_usd = document.getElementById("smartImportCurrent").value;
    if (!key || !(Number(jpy_price) > 0) || !(Number(usd_jpy) > 0)) {
      status.textContent = "Admin kaliti, JPY narx va USD/JPY kursi kerak.";
      return;
    }
    quoteButton.disabled = true;
    try {
      const response = await fetch("/api/admin/smart-import/price-quote", {
        method: "POST", credentials: "same-origin",
        headers: {"Content-Type":"application/json","X-Admin-Key":key},
        body: JSON.stringify({jpy_price, usd_jpy, current_usd:current_usd || null})
      });
      if (!response.ok) throw new Error("Narx hisoblash endpointi mavjud emas yoki ruxsat yo‘q (" + response.status + ").");
      const quote = await response.json();
      result.replaceChildren(
        text("h3", "BURANDO narx hisoboti"),
        text("p", "Yangi hisob: $" + quote.proposed_usd),
        text("p", "Katalogda qo‘llanadigan narx: $" + quote.effective_usd),
        text("p", quote.price_changed ? "Narx yangilanishi kerak." : "Narx farqi $10 dan oshmadi — eski narx saqlanadi."),
        text("p", "Bu hisob mahsulotni avtomatik joylamaydi.")
      );
      result.classList.remove("hidden");
      status.textContent = "Narx hisoblandi.";
    } catch (err) { status.textContent = err.message; }
    finally { quoteButton.disabled = false; }
  });
  button.addEventListener("click", async () => {
    const url = document.getElementById("smartImportUrl").value.trim();
    const usd_jpy = document.getElementById("smartImportRate").value.trim();
    const key = document.getElementById("adminKey")?.value || sessionStorage.getItem("burandoAdminKey") || "";
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
