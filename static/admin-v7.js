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
  let settingsLoaded = false;
  const settingsSave = sf.querySelector("[type=submit]");
  settingsSave.disabled = true;
  document.querySelector("#v7LoadSettings").onclick = async () => {
    const loadButton = document.querySelector("#v7LoadSettings");
    if (loadButton.disabled) return;
    loadButton.disabled = true;
    settingsSave.disabled = true;
    try {
      const data = await api("/api/settings");
      for (const [key, value] of Object.entries(data))
        if (sf.elements[key]) sf.elements[key].value = value;
      settingsLoaded = true;
    } catch (e) {
      toast(e.message);
    } finally {
      loadButton.disabled = false;
      settingsSave.disabled = !settingsLoaded;
    }
  };
  sf.onsubmit = async (e) => {
    e.preventDefault();
    if (!settingsLoaded || settingsSave.disabled) return;
    const btn = e.submitter || settingsSave;
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
    const key = adminKey;
    try {
      const data = await api("/api/admin/banners");
      if (!key || key !== adminKey) return;
      const root = document.querySelector("#v7BannerList");
      root.replaceChildren();
      if (!data.length)
        root.textContent = "Hozircha banner yo‘q. Pastdagi shakldan qo‘shing.";
      for (const b of data) {
        const p = document.createElement("p");
        p.textContent =
          (b.title_uz || "UZ matni yo‘q") +
          " / " +
          (b.title_ru || "RU matni yo‘q");
        const info = document.createElement("small");
        info.className = "banner-meta";
        info.textContent =
          (b.active ? "Faol" : "O‘chirilgan") +
          " · " +
          (b.starts_at ? formatDate(b.starts_at) : "Darhol") +
          " → " +
          (b.ends_at ? formatDate(b.ends_at) : "Muddatsiz");
        p.append(info);
        if (b.image && /^https:\/\//.test(b.image)) {
          const preview = document.createElement("img");
          preview.src = b.image;
          preview.alt = "";
          preview.loading = "lazy";
          preview.className = "admin-banner-image";
          p.prepend(preview);
        }
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
          document.querySelector("#bannerEditorTitle").textContent =
            "Bannerni tahrirlash";
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
    if (data.starts_at && data.ends_at && data.ends_at <= data.starts_at) {
      toast("Banner tugashi boshlanishidan keyin bo‘lsin");
      return;
    }
    const btn = e.submitter || e.target.querySelector("[type=submit]");
    if (btn.disabled) return;
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
      document.querySelector("#bannerEditorTitle").textContent = "Yangi banner";
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
const notificationPanel = document.createElement("section");
notificationPanel.className = "card admin-notifications";
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
