/* V7 admin additions. Shared API key identifies an admin credential, not a person. */
(() => {
  const section = document.createElement("section");
  section.className = "card v7-settings";
  section.innerHTML = `<h2>BURANDO V7 · Sozlamalar</h2><button id="v7LoadSettings" type="button">Sozlamalarni yuklash</button><form id="v7SettingsForm"><label>Instagram rasmiy havolasi<input name="instagram_url" type="url" placeholder="https://instagram.com/…"></label><label>Telegram yordam havolasi<input name="telegram_url" type="url" placeholder="https://t.me/…"></label><label>To‘lov yo‘riqnomasi UZ<textarea name="payment_details_uz" maxlength="2000"></textarea></label><label>Инструкция по оплате RU<textarea name="payment_details_ru" maxlength="2000"></textarea></label><button type="submit">Sozlamalarni saqlash</button></form><hr><h3>Reklama bannerlari</h3><button type="button" id="v7LoadBanners">Bannerlarni yuklash</button><div id="v7BannerList"></div><form id="v7BannerForm"><label>Rasm HTTPS URL<input name="image" type="url" required></label><label>Matn UZ<input name="title_uz" maxlength="160"></label><label>Текст RU<input name="title_ru" maxlength="160"></label><label>Ichki havola<input name="link" placeholder="/?product=BD-000123 yoki /?category=sale"></label><label>Boshlanish vaqti<input name="starts_at" type="datetime-local"></label><label>Tugash vaqti<input name="ends_at" type="datetime-local"></label><label>Faol<input name="active" type="checkbox" checked></label><label>Tartib<input name="position" type="number" value="0"></label><button type="submit">Bannerni saqlash</button></form><p>Rekvizitlarga CVV, bank paroli yoki maxfiy karta ma’lumotlarini yozmang.</p>`;
  document.querySelector("#productsTab").append(section);
  const uploadLabel = document.createElement("label");
  uploadLabel.textContent = "Banner rasmini yuklash (JPEG, PNG, WebP · 5 MB)";
  const upload = document.createElement("input");
  upload.type = "file";
  upload.accept = "image/jpeg,image/png,image/webp";
  uploadLabel.append(upload);
  document.querySelector("#v7BannerForm").prepend(uploadLabel);
  upload.onchange = async () => {
    const file = upload.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Rasm 5 MB dan oshmasin");
      return;
    }
    upload.disabled = true;
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "X-Admin-Key": adminKey },
        body: data,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.detail || "Yuklashda xato");
      document.querySelector("#v7BannerForm").elements.image.value = result.url;
      toast("Banner rasmi yuklandi");
    } catch (e) {
      toast(e.message);
    } finally {
      upload.disabled = false;
    }
  };
  const sf = document.querySelector("#v7SettingsForm");
  document.querySelector("#v7LoadSettings").onclick = async () => {
    try {
      const data = await api("/api/settings");
      for (const [key, value] of Object.entries(data))
        if (sf.elements[key]) sf.elements[key].value = value;
    } catch (e) {
      toast(e.message);
    }
  };
  sf.onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(Object.fromEntries(new FormData(sf))),
      });
      toast("Saqlandi");
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
    }
  };
  async function loadBanners() {
    try {
      const data = await api("/api/admin/banners");
      const root = document.querySelector("#v7BannerList");
      root.replaceChildren();
      for (const b of data) {
        const p = document.createElement("p");
        p.textContent = b.title_uz + " / " + b.title_ru;
        const button = document.createElement("button");
        button.textContent = "O‘chirish";
        button.onclick = async () => {
          if (!confirm("Banner o‘chirilsinmi?")) return;
          try {
            await api("/api/admin/banners/" + encodeURIComponent(b.id), {
              method: "DELETE",
            });
            await loadBanners();
          } catch (e) {
            toast(e.message);
          }
        };
        const edit = document.createElement("button");
        edit.textContent = "Tahrirlash";
        edit.onclick = () => {
          const form = document.querySelector("#v7BannerForm");
          form.dataset.id = b.id;
          form.elements.active.checked = b.active;
          form.elements.position.value = b.position;
          for (const key of ["image", "title_uz", "title_ru", "link"])
            form.elements[key].value = b[key] || "";
          for (const key of ["starts_at", "ends_at"]) {
            const d = b[key] ? new Date(b[key]) : null;
            form.elements[key].value = d
              ? new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16)
              : "";
          }
          form.scrollIntoView?.({ block: "center" });
        };
        p.append(edit, button);
        root.append(p);
      }
    } catch (e) {
      toast(e.message);
    }
  }
  document.querySelector("#v7LoadBanners").onclick = loadBanners;
  document.querySelector("#v7BannerForm").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.active = e.target.elements.active.checked;
    data.position = Number(e.target.elements.position.value);
    for (const key of ["starts_at", "ends_at"])
      data[key] = data[key] ? new Date(data[key]).toISOString() : null;
    const btn = e.submitter;
    btn.disabled = true;
    try {
      await api(
        "/api/admin/banners" +
          (e.target.dataset.id
            ? "/" + encodeURIComponent(e.target.dataset.id)
            : ""),
        {
          method: e.target.dataset.id ? "PUT" : "POST",
          body: JSON.stringify(data),
        },
      );
      delete e.target.dataset.id;
      e.target.reset();
      await loadBanners();
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
    }
  };
})();
function v7Button(label, fn) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = fn;
  return b;
}
renderOrders = function () {
  const root = $("ordersList");
  root.replaceChildren();
  const dashboard = document.createElement("section");
  dashboard.className = "card";
  const paid = orders.filter((o) => o.payment_status === "paid");
  const sales = paid.reduce((sum, o) => sum + Number(o.total), 0);
  const counts = new Map();
  for (const o of paid)
    for (const i of o.items || [])
      counts.set(i.product_code, (counts.get(i.product_code) || 0) + i.qty);
  const best = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, qty]) => code + " × " + qty)
    .join(", ");
  dashboard.textContent = `Buyurtmalar: ${orders.length} · Tasdiqlangan savdo: $${sales.toFixed(2)} · Cheklar: ${orders.filter((o) => ["receipt_submitted", "under_review"].includes(o.payment_status)).length} · Ko‘p sotilgan: ${best || "—"}`;
  root.append(dashboard);
  for (const o of orders) {
    const card = document.createElement("section");
    card.className = "card v7-order";
    card.innerHTML = `<h3>${escapeHtml(o.order_code)} · $${Number(o.total).toFixed(2)}</h3><p>${escapeHtml(o.customer_name)} · ${escapeHtml(o.phone)}</p><p>${escapeHtml(o.backup_phone || "")}</p><p>${escapeHtml(o.address)}</p><p>${escapeHtml(o.comment || "")}</p><p>To‘lov: <b>${escapeHtml(o.payment_status)}</b> · Yetkazish: ${escapeHtml(o.order_status)}</p>`;
    if (o.telegram_verified) {
      const p = document.createElement("p");
      p.textContent = "Tasdiqlangan Telegram ID: " + o.telegram_user_id;
      const a = document.createElement("a");
      a.textContent = o.telegram_username
        ? "@" + o.telegram_username
        : "Telegram chat";
      a.href =
        o.telegram_username && /^[A-Za-z0-9_]{5,32}$/.test(o.telegram_username)
          ? "https://t.me/" + o.telegram_username
          : "tg://user?id=" + encodeURIComponent(o.telegram_user_id);
      a.target = "_blank";
      a.rel = "noopener";
      p.append(" ", a);
      card.append(p);
    }
    for (const i of o.items || []) {
      const row = document.createElement("div");
      row.className = "v7-order-item";
      if (i.image && /^https:\/\//.test(i.image)) {
        const image = document.createElement("img");
        image.src = i.image;
        image.alt = "";
        row.append(image);
      }
      const text = document.createElement("span");
      text.textContent = `${i.product_code} · ${i.title} × ${i.qty} · ${i.size || "—"} / ${i.color || "—"} · $${Number(i.line_total).toFixed(2)}`;
      row.append(text);
      card.append(row);
    }
    if (o.receipt_path) {
      card.append(
        v7Button("Chekni ko‘rish", async () => {
          try {
            const r = await fetch(
              "/api/admin/orders/" +
                encodeURIComponent(o.order_code) +
                "/receipt",
              { headers: { "X-Admin-Key": adminKey }, cache: "no-store" },
            );
            if (!r.ok) throw Error("Chekni olib bo‘lmadi");
            const url = URL.createObjectURL(await r.blob());
            const dialog = document.createElement("dialog");
            const image = document.createElement("img");
            image.src = url;
            image.style.maxWidth = "100%";
            dialog.append(
              image,
              v7Button("Yopish", () => {
                dialog.close();
                dialog.remove();
                URL.revokeObjectURL(url);
              }),
            );
            document.body.append(dialog);
            dialog.showModal();
          } catch (e) {
            toast(e.message);
          }
        }),
      );
    }
    async function decide(action) {
      let reason = "";
      if (
        action === "paid" &&
        !confirm(
          "Bank hisobingizga haqiqiy pul tushganini tekshirdingizmi? Chek rasmi o‘zi yetarli emas.",
        )
      )
        return;
      if (action === "reject") {
        reason = prompt("Rad etish sababi:") || "";
        if (!reason.trim()) return;
      }
      try {
        await api(
          "/api/admin/orders/" + encodeURIComponent(o.order_code) + "/payment",
          {
            method: "POST",
            body: JSON.stringify({
              action,
              version: o.payment_version,
              reason,
              funds_confirmed: action === "paid",
            }),
          },
        );
        await loadOrders();
      } catch (e) {
        toast(e.message);
      }
    }
    if (o.payment_status === "receipt_submitted")
      card.append(v7Button("Tekshiruvga olish", () => decide("review")));
    if (o.payment_status === "under_review") {
      card.append(
        v7Button("Pul tushganini tasdiqlash", () => decide("paid")),
        v7Button("Rad etish", () => decide("reject")),
      );
    }
    const select = document.createElement("select");
    for (const [v, label] of Object.entries({
      awaiting_payment: "To‘lov kutilmoqda",
      received: "Buyurtma qabul qilindi",
      preparing_japan: "Yaponiyada tayyorlanmoqda",
      shipped_japan: "Yaponiyadan yuborildi",
      in_transit: "Yo‘lda",
      arrived_uz: "O‘zbekistonga keldi",
      out_for_delivery: "Yetkazilmoqda",
      delivered: "Yetkazildi",
      cancelled: "Bekor qilindi",
    })) {
      const option = document.createElement("option");
      option.value = v;
      option.textContent = label;
      select.append(option);
    }
    select.value = o.order_status;
    card.append(
      select,
      v7Button("Yetkazish holatini saqlash", async () => {
        try {
          await api("/api/admin/orders/" + encodeURIComponent(o.order_code), {
            method: "PATCH",
            body: JSON.stringify({ order_status: select.value }),
          });
          await loadOrders();
        } catch (e) {
          toast(e.message);
        }
      }),
    );
    card.append(
      v7Button("To‘lov qarorlari tarixi", async () => {
        try {
          const history = await api(
            "/api/admin/orders/" + encodeURIComponent(o.order_code) + "/audit",
          );
          let list = card.querySelector(".v7-audit");
          if (!list) {
            list = document.createElement("pre");
            list.className = "v7-audit";
            card.append(list);
          }
          list.textContent =
            history
              .map(
                (a) =>
                  `${a.created_at} · ${a.actor} · ${a.previous_status} → ${a.next_status}\n${a.reason}`,
              )
              .join("\n\n") || "Hali qaror yo‘q";
        } catch (e) {
          toast(e.message);
        }
      }),
    );
    root.append(card);
  }
};

const notificationPanel = document.createElement("section");
notificationPanel.className = "card";
const notificationResult = document.createElement("pre");
notificationResult.className = "v7-audit";
notificationPanel.append(
  v7Button("Xabarlar holati", async () => {
    try {
      const rows = await api("/api/admin/notifications");
      notificationResult.textContent =
        rows
          .map(
            (x) =>
              `${x.id} · ${x.audience} · ${x.status} · ${x.attempts} urinish`,
          )
          .join("\n") || "Xabarlar yo‘q";
    } catch (e) {
      toast(e.message);
    }
  }),
  v7Button("Kutilayotgan xabarlarni yuborish", async () => {
    try {
      const result = await api("/api/admin/notifications/dispatch", {
        method: "POST",
      });
      toast(
        result.enabled
          ? "Qayta ishlangan: " + result.processed
          : "Bu muhitda xabar yuborish o‘chirilgan",
      );
    } catch (e) {
      toast(e.message);
    }
  }),
  notificationResult,
);
document.querySelector("#ordersTab").append(notificationPanel);

const previousShowAdminV7 = showAdmin;
showAdmin = function () {
  previousShowAdminV7();
  document.querySelector("#v7LoadSettings").click();
};
