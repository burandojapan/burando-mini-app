/* Telegram setup uses authenticated endpoints; tokens never enter the browser. */
(() => {
  const card = document.createElement("section");
  card.className = "card notice-settings";
  card.innerHTML = `<h2>Telegram xabarlari</h2><p class="help">Yangi buyurtma adminga, to‘lov va yetkazish holatlari mijozga yuboriladi. Mijoz Telegram orqali tasdiqlangan bo‘lishi va botga yozishga ruxsat bergan bo‘lishi kerak.</p><p id="noticeConnection" role="status">Sozlamalarni yuklang.</p><button id="noticeLoad" class="secondary" type="button">Telegram sozlamalarini yuklash</button><a id="noticeBotLink" target="_blank" rel="noopener noreferrer" hidden>Botni ochish va Start bosish ↗</a><form id="noticeForm"><label>Tasdiqlangan buyurtmalardan adminni tanlash<select id="noticeAdminChoice"><option value="">Telegram ID bilan kiriting yoki ro‘yxatdan tanlang</option></select></label><label>Xabar oluvchi admin Telegram ID<input name="admin_chat_id" inputmode="numeric" placeholder="Telegram ID" maxlength="20" autocomplete="off"></label><label id="noticeTestIdsLabel">TEST mijozlarining Telegram ID’lari<textarea name="test_recipient_ids" rows="2" placeholder="Har bir ID yangi qatorda yoki vergul bilan"></textarea><small>Faqat o‘zingiz tanlagan sinov akkauntlari. Admin ID avtomatik qo‘shiladi. Boshqa mijozlarga TEST xabari yuborilmaydi.</small></label><label class="check"><input name="enabled" type="checkbox"> Yangi buyurtma va holat xabarlarini yoqish</label><p class="help">Yoqilgandan keyingi yangi xabarlar yuboriladi. Oldingi buyurtmalarning eski xabarlari yuborilmaydi. Mehmon buyurtmasini mijoz xavfsiz buyurtma havolasi orqali kuzatadi.</p><div class="row"><button type="submit" class="primary" disabled>Saqlash</button><button id="noticeTest" type="button" class="secondary" disabled>Adminga sinov xabari</button></div><p id="noticeFeedback" role="status"></p></form>`;
  document.querySelector("#settingsTab").prepend(card);
  const form = document.querySelector("#noticeForm"),
    feedback = document.querySelector("#noticeFeedback"),
    load = document.querySelector("#noticeLoad"),
    test = document.querySelector("#noticeTest"),
    choice = document.querySelector("#noticeAdminChoice");
  let loaded = false;
  function choices() {
    const known = new Map();
    for (const o of orders)
      if (
        o.telegram_verified &&
        /^[1-9][0-9]*$/.test(String(o.telegram_user_id))
      )
        known.set(
          String(o.telegram_user_id),
          o.customer_name || "Telegram mijoz",
        );
    choice.replaceChildren(
      new Option("Telegram ID bilan kiriting yoki ro‘yxatdan tanlang", ""),
    );
    for (const [id, name] of known)
      choice.append(new Option(name + " · " + id, id));
  }
  choice.onchange = () => {
    if (choice.value) form.elements.admin_chat_id.value = choice.value;
  };
  async function reload() {
    load.disabled = true;
    feedback.textContent = "";
    const key = adminKey;
    try {
      const cfg = await api("/api/admin/notifications/config");
      if (key !== adminKey) return;
      loaded = true;
      choices();
      form.elements.admin_chat_id.value = cfg.admin_chat_id || "";
      form.elements.test_recipient_ids.value = (
        cfg.test_recipient_ids || []
      ).join("\n");
      form.elements.enabled.checked = !!cfg.enabled;
      document.querySelector("#noticeTestIdsLabel").hidden =
        cfg.environment !== "staging";
      document.querySelector("#noticeConnection").textContent =
        cfg.issue ||
        (cfg.environment === "staging" ? "TEST · " : "") +
          "@" +
          cfg.bot_username +
          " · " +
          (cfg.enabled ? "Xabarlar yoqilgan" : "Hozircha o‘chirilgan");
      const link = document.querySelector("#noticeBotLink");
      link.hidden = !/^[A-Za-z0-9_]{5,32}$/.test(cfg.bot_username || "");
      if (!link.hidden) link.href = "https://t.me/" + cfg.bot_username;
      form.querySelector("[type=submit]").disabled = false;
      test.disabled = !cfg.enabled || !cfg.transport_ready;
    } catch (e) {
      feedback.textContent = e.message;
    } finally {
      load.disabled = false;
    }
  }
  load.onclick = reload;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const save = form.querySelector("[type=submit]");
    if (!loaded || save.disabled) return;
    save.disabled = true;
    feedback.textContent = "";
    try {
      await api("/api/admin/notifications/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: form.elements.enabled.checked,
          admin_chat_id: form.elements.admin_chat_id.value.trim(),
          test_recipient_ids: form.elements.test_recipient_ids.value
            .split(/[\s,;]+/)
            .filter(Boolean),
        }),
      });
      await reload();
      feedback.textContent =
        "Saqlandi. Botni ochib Start bosing, so‘ng sinov xabarini tekshiring.";
    } catch (e) {
      feedback.textContent = e.message;
    } finally {
      save.disabled = false;
    }
  };
  test.onclick = async () => {
    if (test.disabled) return;
    test.disabled = true;
    try {
      await api("/api/admin/notifications/test", { method: "POST" });
      feedback.textContent = "Sinov xabari adminga yuborildi.";
    } catch (e) {
      feedback.textContent = e.message;
    } finally {
      test.disabled = false;
    }
  };
  document
    .querySelector("[data-tab=settings]")
    .addEventListener("click", () => {
      if (!loaded) reload();
      else choices();
    });
  document.querySelector("#logoutBtn").addEventListener("click", () => {
    if (!adminKey) {
      loaded = false;
      form.reset();
      choice.replaceChildren();
      document.querySelector("#noticeBotLink").hidden = true;
      feedback.textContent = "";
      document.querySelector("#noticeConnection").textContent =
        "Sozlamalarni yuklang.";
      form.querySelector("[type=submit]").disabled = true;
      test.disabled = true;
    }
  });
})();
