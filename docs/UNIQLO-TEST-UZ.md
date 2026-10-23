# UNIQLO integratsiyasi — TEST

## Audit va holat

Asos: `main` commit `e9b5c5f364b3274c94036a1df115099421dc564f`.
FastAPI `app.py` katalogni `products`dan o‘qiydi. `v7_api.py` server narxi bilan checkout yaratadi; `burando_create_order` atomik saqlaydi. Kategoriyalar text sluglar, SALE esa `sale_price` asosidagi dinamik filtr. Alohida kategoriya jadvali yo‘q. Shu arxitektura saqlandi.

UNIQLO asosiy tugmasi va ulashish allaqachon bor edi. 42 ta yagona taxonomy yozuvi (asosiy + 4 auditoriya + 37 turkum) API orqali beriladi. Manba kategoriya IDlari admin tekshirgan mapping orqali biriktiriladi. Noma’lum kategoriya avtomatik taxmin qilinmaydi.

Aniqlangan bazalar: `BURANDO V7 STAGING` (`kfvzzxnkrdzwnnfsvxta`) va LIVE `BURANDO` (`rnzubppxzbpbubacpfno`). Faqat TEST sxemasi tekshirildi. LIVE ma’lumotiga yozilmaydi. Integratsiya production rejimida ham, ma’lum LIVE URL bilan ham bloklanadi. LIVE uchun keyin alohida ko‘rib chiqiladigan kod o‘zgarishi kerak.

## Bajarilgan tekshiruvlar

Migratsiya faqat `BURANDO V7 STAGING` bazasiga qo‘llandi. Oltita yangi jadvalda RLS yoqilgan. Haqiqiy TEST bazasida `service_role` bilan tranzaksiya ichida sintetik import, duplicate, SALE tugashi, stock-out va restock tekshirildi; yakunda rollback qilindi. Real mahsulotlar import qilinmadi, sync pauzada va tasdiqlanmagan.

94 Python testi va 23 subtest, frontend/checkout/SQL regression testlari o‘tdi. GitHub Actions tekshiruvi ham o‘tdi. Cron Blueprint joriy Render JSON schemaga mos; Render platformasi yoki CLI orqali deploy hali tekshirilmagan.

UNIQLO SYNC boshqaruvi adminning **Sozlamalar** bo‘limida joylashgan.

## Tayyor imkoniyatlar

- Ruxsatli HTTPS JSON feed adapteri, redirect yo‘q, 25 MB/10000 mahsulot chegarasi.
- Barqaror `product_id/color_id/size_id`, idempotent yozish, atomik mahsulot+variant+narx saqlash.
- Aniq `available=false` variantni yopadi; javobdan yo‘qolish qoldiqni o‘zgartirmaydi. Eski observation rad etiladi.
- Sync lease, parallel run blokirovkasi, sozlama/mapping versiyasi bilan eski runlarni to‘xtatish.
- Manba va tarjima/rasm ruxsati, inventory ishonchliligi va kategoriya tasdig‘i talab qilinadi.
- `(JPY / USDJPY) × (1 + markup/100)`, standart ustama 50%, ammo aktivlashdan oldin admin tasdiqlaydi.
- `automatic`: tasdiqlangan siyosat bo‘yicha narx va SALE yangilanadi. `review`: narx o‘zgarsa mahsulot yashiriladi, taklif narxi review ro‘yxatida ko‘rinadi. Tasdiqlash uchun automatic siyosatni tanlab qayta import qiling. Bir xil qayta sync tasdiqsiz ochib yubormaydi.
- Kurs: `manual` rejimda tasdiqlangan qiymat 26 soatgacha; `feed` rejimda admin tasdiqlagan manbadan kelgan yangi kurs har kuni olinadi. Eskirgan kurs bilan import to‘xtaydi.
- Rang almashtirilganda galereya va mavjud razmerlar almashadi, UZ/RU nomlar ko‘rinadi. Savatda barqaror ID saqlanadi.
- HTTP checkout va SQL order-item trigger rang–razmer juftligi va narxni qayta tekshiradi.
- Katalog USD; CBU asosidagi checkout kursi, 50% oldindan / 50% O‘zbekistonga kelganda to‘lov va order snapshot mavjud tizim orqali ishlaydi.
- Import kodida Telegram transporti yo‘q. Mavjud buyurtma xabarlari ushbu integratsiyadan mustaqil.
- Barcha yangi manba/narx/run jadvallari RLS bilan yopilgan, faqat service_role uchun. Maxfiy kalit frontendga berilmaydi.

## Hali ulanmagan qismlar

Real ruxsatli UNIQLO feed URL/token, kategoriya IDlari va tijoriy rasm/tarjima ruxsati berilmagan. Adapter oddiy UNIQLO saytini scraping qilmaydi va mavjud bo‘lmagan ochiq API borligini da’vo qilmaydi. Shu sabab real katalog importi va real feed acceptance testi bajarilmagan.

Rasmiy ko‘rsatma: https://faq.uniqlo.com/articles/FAQ/100001721 — korxonalar rasm ishlatish shartlarini UNIQLO bilan kelishadi. Umumiy shartlar: https://faq.uniqlo.com/articles/faq/terms . Ruxsatni admin maydoniga yozish ruxsatni o‘zi yaratmaydi.

Foydalanuvchi `My Workspace` (`tea-da8vjpqjnfac73c7bnrg`)ni tasdiqladi. TEST service `burando-v7-staging` yangi kod bilan deploy qilindi. LIVE service/main o‘zgartirilmadi. Render cron yaratish HTTP 402 (billing card talab qilindi) bilan rad etildi; amaldagi scheduler quyidagi Supabase Cron bo‘limida berilgan.

## TEST deploy ketma-ketligi

1. Feature branchdagi testlarni bajaring:
   ```sh
   pip install -r requirements-dev.txt
   npm ci --ignore-scripts
   APP_ENV=test python -m pytest -q
   npm test
   ```
2. TESTdagi `products`, `order_items`, mavjud cheklovlar va checkout funksiyalarini tekshiring. `supabase/migrations/20261023090000_uniqlo_sync.sql` faqat TESTga qo‘llansin. Boshqa migratsiyalarni ko‘r-ko‘rona qayta ishlatmang.
3. Render workspace tasdiqlangach, mavjud TEST web service reposi va haqiqiy Supabase URLini tekshiring. Feature branchga yo‘naltiring; auto deploy o‘chiq qolsin. LIVE service yoki `main` branch deploy qilinmasin.
4. TEST web service uchun mavjud staging parametrlarini saqlang va qo‘shing:
   ```text
   UNIQLO_TEST_PROJECT_REF=kfvzzxnkrdzwnnfsvxta
   UNIQLO_FEED_URL=<ruxsatli provider HTTPS feed>
   UNIQLO_FEED_ALLOWED_HOST=<aynan shu provider hosti>
   UNIQLO_FEED_TOKEN=<server-only token, kerak bo‘lsa>
   ```
   `APP_ENV=staging`, `STAGING_SETUP_MODE=false`, `STAGING_ISOLATION_CONFIRMED=true`, TEST bazasi, alohida bot/admin/site kalitlari talab qilinadi. Setup mode’da katalog ochilmaydi. Service-role kaliti serverda saqlanadi.
5. `render.uniqlo-test.yaml` yangi cronni belgilaydi. Cron pullik resurs; yaratishdan oldin hozirgi hisob-kitobni tekshiring. Regionni tegishli TEST service bilan moslang. Schema tekshiruvi platformadagi haqiqiy deploy tekshiruvini almashtirmaydi:
   ```sh
   render blueprints validate render.uniqlo-test.yaml
   ```
   CLI mavjud bo‘lmasa Dashboarddagi Blueprint yo‘lini shu faylga sozlang. Bu fayl LIVE yoki mavjud web serviceni boshqarmaydi. Har kuni 06:00 Japan / 02:00 Uzbekistan ishlaydi. Lokal kompyuter talab qilinmaydi.
6. Admin → UNIQLO SYNC → holatni yuklang. Source category IDlarini rasmiy metadata bilan tekshirib mapping yarating. Ruxsat reference, ustama, pricing policy, FX manbasi va kursini tasdiqlang. Avval pauza yoqilgan qolsin.
7. Bitta ruxsatli mahsulot URLini import qiling. Telefon/Telegram TEST botda galereya, UZ/RU, rang, razmer, SALE, share, cart va 50/50 checkoutni tekshiring. Tugagan razmer/re-stock va expired sale holatlarini feed test yozuvlari bilan tekshiring.
8. Muvaffaqiyatli tekshiruvdan keyin automatic sync pauzasini o‘chiring va Render cronni ishga tushiring. `rate_mode=feed` doimiy avtomatik ishlash uchun yangi kurs beradigan tasdiqlangan provider talab qiladi; manual kurs eskirganda admin yangilashi kerak.
9. Sync historyda `success`, vaqt, sonlar va review yozuvlarini tekshiring. `partial` to‘liq muvaffaqiyat hisoblanmaydi. Katta katalog bir transaction emas: har bir mahsulot atomik; xatodan oldin tasdiqlangan mahsulotlar yangilangan bo‘lishi mumkin. Run uzilsa 5 daqiqali lease tugaydi va keyingi run davom etadi.
10. LIVE deploy va migratsiya ushbu PR doirasida qilinmaydi; alohida aniq tasdiq kerak.

## Feed v1 shartnomasi

GET `UNIQLO_FEED_URL`; bitta mahsulot uchun `?product_url=<URL>` query parametri. Token bo‘lsa Bearer header. Provider barcha eligible mahsulotlarni bitta to‘liq snapshotda qaytaradi. Pagination hozir qo‘llanmaydi; 25 MB/10000 mahsulotdan katta feed uchun provider partition/pagination qo‘shish kerak. Yetishmagan mahsulot yoki variant o‘chirilmaydi. Stock-outni aniq false bilan yuborish shart.

```json
{
  "schema_version": 1,
  "complete": true,
  "forex": {"usdjpy_rate": "150", "source": "admin-approved-provider", "observed_at": "<fresh ISO8601 timestamp with timezone>"},
  "products": [{
    "product_id": "E123",
    "url": "https://www.uniqlo.com/jp/ja/products/E123",
    "name_uz": "Futbolka",
    "name_ru": "Футболка",
    "description_uz": "Tasdiqlangan tavsif",
    "description_ru": "Проверенное описание",
    "category_id": "provider-men-tees",
    "category_verified": true,
    "inventory_verified": true,
    "content_usage_verified": true,
    "regular_jpy": "3000",
    "discounted_jpy": "2000",
    "observed_at": "<fresh ISO8601 timestamp with timezone>",
    "variants": [{
      "color_id": "09", "size_id": "M",
      "color_uz": "Qora", "color_ru": "Чёрный", "size": "M",
      "available": true,
      "images": ["https://licensed-provider.example/authorized-image.jpg"]
    }]
  }]
}
```

Bu sintetik namuna; haqiqiy UNIQLO mahsuloti yoki haqiqiy provider URLi emas. `discounted_jpy=null` chegirma tugaganini bildiradi. Observation 26 soatdan eski bo‘lmasin. Har rang IDsi ichida label va rasm to‘plami bir xil bo‘lsin. Manba tasdiqlangan UZ/RU tarjimalarni tayyorlaydi; tizim yo‘q tavsifni o‘ylab topmaydi.

## Acceptance dalillari

Python: schema/pricing/classification/freshness/auth/production isolation/feed failure. PostgreSQL PGlite: migration rerun, idempotency, variant combination, explicit out-of-stock/restock, SALE expiry, review persistence, concurrent runs/config fencing, private tables/functions. Mobile DOM: hierarchy, SALE, UZ/RU, color gallery and sizes, unavailable cart guard. Mavjud frontend/checkout/SQL regression sinovlari ham bajariladi. Haqiqiy Render TEST deploy, Telegram telefondagi tekshiruv va real provider sinovi alohida hali zarur.


## Eski bot bilan ishlash va rasmiy havola diagnostikasi

Foydalanuvchi bergan `bot_v7_4_uniqlo_sitemap_catalog(1).py` va `sources_UNIQLO_test(1).json` bajarilmasdan tekshirildi. Ular sitemap va ochiq mahsulot sahifalaridan foydalanadi. Legacy bot narxi 50% ustama bilan birga taxminiy kargoni ham qo‘shgan; Mini App’dagi kelishilgan formula faqat sozlamadagi ustama bilan qoladi. Legacy botning Telegram yuborish, SQLite seen-skip, taxminiy razmer/klassifikatsiya va rasmni o‘zgartirish qismlari production integratsiyasiga ko‘chirilmagan. Xom bot fayli yoki undagi ehtimoliy kalitlar repozitoriyga qo‘shilmagan.

`Rasmiy havolani tekshirish` tugmasi endi rasmiy mahsulot sahifasining `window.__PRELOADED_STATE__` JSON obyektini o‘qiydi; JavaScript bajarilmaydi. URL va narx guruhiga mos `productId`, JPY narx, breadcrumbs kategoriya IDsi, rang va razmer IDlari tekshiriladi. Sahifadagi rang va razmerlar kesishmasidan mavjud variantlar yasalmaydi. Diagnostika katalogga yoki bazaga yozmaydi, faqat tekshiruv natijasini qaytaradi. Bu tijoriy rasm/tavsifdan foydalanish ruxsatini tasdiqlamaydi.

Robot qoidalari tekshiriladi. HTTP 403, 429, redirect, o‘zgargan JSON va noto‘liq sahifa xato beradi; proxy almashtirish, login, CAPTCHA yoki yashirin endpointni chetlab o‘tish yo‘q. `E476997-000/00` rasmiy sahifasining oddiy HTTP javobi bilan parser tekshirildi: mahsulot metama’lumoti topildi, variant qoldig‘i topilmadi va `ready_to_import=false` qaytdi. Bu eski kodni ishonchli stock feed deb qabul qilishga yetarli emas.

## Serverdagi kunlik chaqiruv

`render.uniqlo-test.yaml` endi `scripts/uniqlo_remote_daily.py` ni ishlatadi. Cron faqat TEST serveridagi aniq `POST /api/internal/uniqlo/daily` endpointini chaqiradi. Alohida 32+ belgili `UNIQLO_JOB_KEY` web service va cronning maxfiy muhit parametrida saqlanadi. U admin kaliti ham, baza kaliti ham emas. Bu kalit boshqa URL, GET, admin panel yoki katalogga kirish huquqini bermaydi. Site-login himoyasida faqat aynan shu POST va to‘g‘ri job kaliti uchun chegaralangan istisno bor; endpoint yana TEST bazasi shartini tekshiradi.

`paused=true` yoki `approved=false` bo‘lsa job `status=paused` qaytaradi, mahsulotlar va narxlar o‘zgarmaydi. Faqat haqiqiy ruxsatli feed, FX va pricing tasdiqlangandan keyin avtomatik import bajariladi. Cron ichida Supabase service-role yoki admin kaliti yo‘q. To‘liq sync HTTP so‘rovining davomiyligiga sig‘maydigan juda katta katalog uchun alohida queue/workerga ko‘chirish kerak; bu konfiguratsiya cheksiz hajmni kafolatlamaydi. Avvalgi `scripts/uniqlo_daily.py` bevosita server-side DB credential bilan ishlaydigan alternativ worker sifatida saqlangan.

## Amaldagi scheduler: Supabase Cron

Render cron yaratish so‘rovi HTTP 402 bilan rad etildi: Render hisobida to‘lov kartasi yo‘q. Shuning uchun Render cron yaratilmagan; YAML alternativ konfiguratsiya sifatida qoladi.

TEST bazasida `pg_cron` + `pg_net` orqali `burando-uniqlo-test-daily` vazifasi sozlanadi. `20261023215934_uniqlo_test_daily_cron.sql` faqat TEST uchun. Vazifa har kuni 21:00 UTC (06:00 Japan / 02:00 Uzbekistan) aynan TEST serverini chaqiradi. Bu Render’da alohida pullik cron talab qilmaydi; mavjud Supabase/Render resurslari va ularning cheklovlari amal qiladi. Supabase loyihasi pauza qilingan bo‘lsa scheduler ishlamaydi.

Alohida job kaliti Supabase Vault’dagi `burando_uniqlo_test_job_key` secretida va TEST web service’dagi `UNIQLO_JOB_KEY` muhit parametrida saqlanadi. Kalit bu faylda yo‘q. `burando_jobs` sxemasi va uning funksiyasi public, anon, authenticated va service_role uchun yopiq; faqat DB scheduler egasi chaqiradi. Vault sirini frontend yoki API orqali o‘qib bo‘lmaydi.

Har bir chaqiruv request IDsi `burando_jobs.uniqlo_requests`ga yoziladi. `cron.job_run_details` faqat SQL ishining natijasini bildiradi; haqiqiy HTTP natijani `net._http_response` bilan tekshirish kerak. `pg_net` response retention standartida 6 soat, transport navbati esa unlogged; bitta request mutlaq kafolatlanmaydi. Xatodan keyin diagnostika qilib xavfsiz qayta chaqirish mumkin; importer lease parallel yozishni bloklaydi.

Manba hali tasdiqlanmaganida endpoint `status=paused` qaytaradi. Bu import muvaffaqiyati emas. Real ishonchli qoldiq/feed, rasm-tarjima ruxsati va admin pricing tasdig‘i kelmaguncha katalogda yangi UNIQLO mahsulotlari paydo bo‘lmaydi.


Tasdiqlangan amaldagi holat: TEST deploy `dep-dbdtgeks728c738fd6c0` / commit `104943b3cd7af88e82b10b963e7ff79088d86310` Render’da `live`. Supabase cron aktiv, `0 21 * * *`, timezone `GMT`. Qo‘lda aynan scheduler funksiyasi chaqirildi: request ID 1, HTTP 200, `status=paused`, `imported=0`, `errors=0`. Bu real import bajarilganini bildirmaydi. Anon/authenticated rollari private scheduler sxemasiga kira olmaydi; anon Vault secretini va job funksiyasini o‘qiy/chaqira olmaydi.


Xavfsizlik tekshiruvi: `pg_net` joriy TEST bazasida dastlab public extension metadata bilan o‘rnatilganligi uchun [extension_in_public tavsiyasi](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) qoladi. Tekshiruvda uning public sxemasidagi funksiyalari soni 0; barcha 12 funksiya net sxemasida. Extension non-relocatable, transport navbati/tarixini o‘chiradigan drop/recreate qilinmadi. Yangi toza deploy uchun migratsiya `with schema extensions` ishlatadi. Managed net sxemasidagi Supabase-admin grantlari postgres roli bilan bekor bo‘lmadi; net sxemasi o‘zi client roliga yopiq deb da’vo qilinmaydi. Xavfsizlik chegarasi alohida private burando_jobs sxemasi, yopiq Vault secret va aniq endpoint kalitidir. Bu chegaralarning huquqlari alohida tekshirildi. Shaxsiy scheduler jadvallarida RLS policy yo‘qligi ataylab client rollarini yopadi.


Scheduler HTTP so‘rovida Vault’dagi doimiy kalit yuborilmaydi. DB har bir so‘rov uchun timestamp va HMAC-SHA256 imzo yaratadi; server imzoni va 5 daqiqalik muddatni tekshiradi. pg_net transport jadvali hosted vendor grantlari sabab client DB rollariga o‘qilishi mumkin; unda doimiy sirni qoldirmaslik uchun aynan shu qisqa muddatli imzo ishlatiladi. Imzo boshqa endpointga, admin panelga yoki bazaga kirish huquqini bermaydi. Private job funktsiyasi/Vault doimiy kaliti client rollariga yopiq.
