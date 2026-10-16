# BURANDO V7 — 2026-10-16 holati

Mavjud loyiha yaxshilandi. Boshidan qayta qurilmadi. Kod GitHub’dagi `develop` branch’ga joylandi; production’ga hech narsa chiqarilmadi.

## Kodda tayyorlanganlar

- Telegram imzosi, ma’lumot muddati va foydalanuvchi ID’sini tekshirish.
- Brauzer/Instagram uchun mehmon checkout va maxfiy token bilan buyurtma kuzatish.
- Serverdagi amaldagi mahsulot narxi, razmer va rangni tekshirish.
- Buyurtma va mahsulotlarni bitta DB tranzaksiyasida saqlash, takroriy so‘rovni ajratish.
- Buyurtma yaratilganda to‘lov kutiladi; PAID tasdig‘idan keyin buyurtma qabul qilinadi.
- JPEG/PNG/WebP cheklar, 5 MB chegarasi, haqiqiy rasmni tekshirish, metadata tozalash, kamera yo‘nalishini to‘g‘rilash.
- Private Storage; buyurtma egasi yoki admin server orqali chekni ko‘radi.
- Tekshiruv boshlanmaguncha chekni almashtirish; versiya orqali parallel amallarni himoyalash.
- Admin tekshiruvi, haqiqiy pul tushganini alohida tasdiqlash, sababli rad etish va audit tarixi.
- To‘lovsiz buyurtmani jo‘natish bosqichiga o‘tkazishni bloklash.
- Sevimlilar, SALE, chegirma foizi va muddatlari; brend, razmer, narx filtrlari va saralash.
- Native ulashish yoki havolani nusxalash; mahsulotga to‘g‘ridan-to‘g‘ri havola.
- Banner yuklash, tahrirlash, muddat, tartib va faollik; carousel, swipe va to‘xtatish.
- Admin orqali Instagram/Telegram kontaktlari hamda UZ/RU to‘lov ko‘rsatmalarini sozlash.
- Yengil loading, reduced-motion, timeout va qayta urinish.
- Admin savdo ko‘rsatkichlari va tekshirilmagan cheklar soni.
- Telegram xabarlari uchun DB navbati, qayta urinish va yuborish holatini kuzatish. Yuborish sukut bo‘yicha o‘chiq; staging’da doim bloklangan.
- TEST sayti uchun alohida HTTP autentifikatsiya; API body hajmi cheklovi va xavfsizlik headerlari.
- `develop` uchun avtomatik test workflow; bu workflow deploy qilmaydi.

## O‘tkazilgan tekshiruvlar

- Python: 35 test va 23 ichki tekshiruv o‘tdi.
- Mijoz interfeysi: katalog → mahsulot → savat → checkout → to‘lov oynasi; RU, SALE va sevimlilar tekshirildi.
- Admin interfeysi: sessiyada kirish, buyurtmalar, haqiqiy pulni tasdiqlash talabi, versiya, sozlamalar va tahrirlash formalari tekshirildi.
- Haqiqiy PostgreSQL dvigatelining lokal WASM varianti — PGlite’da sintetik baza yaratildi. Migratsiyalar, qayta qo‘llash, tranzaksiya, rollback, takroriy buyurtma, chek holatlari, audit, private bucket metama’lumoti, RPC ruxsatlari va xabar navbati tekshirildi.
- JavaScript/Python sintaksisi va yangi Python modullaridagi statik tekshiruv o‘tdi.

Bu testlar haqiqiy Supabase, Telegram yoki Render integratsiya sinovlari o‘rnini bosmaydi. DOM testlari haqiqiy telefon ekranidagi ko‘rinishni tasdiqlamaydi.

## Hali bajarilmagan, ishga tushirishni to‘sadigan ishlar

1. GitHub va Render ulanishlari ishlaydi. Jonli Render xizmati `main`, `free`, `virginia`, auto-deploy yoqilganligi tasdiqlandi; sozlamalari o‘zgartirilmadi. Amaldagi Supabase mahsulot sxemasi, RLS va Storage siyosatlari hali tekshirilmagan. Migratsiyalar shu tekshiruvdan keyin moslashtirilishi mumkin.
2. Alohida Render TEST xizmati yaratildi: `https://burando-v7-staging.onrender.com` (`srv-db91qvjrjlhs73du0290`, `free`, `virginia`, `develop`, auto-deploy o‘chiq). Funksional do‘kon alohida Supabase TEST bazasi bilan ishlaydi, HTTP Basic himoyasi yoqilgan. Test bot hali sozlanmagan.
3. Staging-only bootstrap migratsiyasi yangi TEST bazasiga qo‘llandi. Production migratsiyasi bajarilmagan; real ma’lumot ko‘chirilmagan.
4. Rasmiy Instagram/support havolalari va haqiqiy to‘lov ko‘rsatmasi sozlanmagan. Namuna bank rekvizitlari kiritilmagan.
5. Haqiqiy Telegram WebView, Instagram brauzeri va iOS/Android kamera yuklashini tekshirish qolgan. HEIC qabul qilinmaydi; JPEG/PNG/WebP talab qilinadi.
6. Browser binary’ni olish muhiti cheklangani uchun skrinshot asosidagi mobil vizual QA bajarilmadi.
7. Render tarif/cold-start, backup/restore, doimiy loglar va tarmoq darajasidagi rate limitlar hali tekshirilmagan.
8. Admin autentifikatsiyasi hozir mavjud umumiy API kalitini yaxshilaydi. Audit kalitni identifikatsiya qiladi; alohida admin shaxslarini aniqlaydigan ko‘p foydalanuvchili tizim emas.
9. Cheklarning eski nusxalari va tarmoqqa oid noaniq natijadan qolgan fayllar private saqlanadi. Saqlash muddati va tozalash qoidasi ishga tushirishdan oldin belgilanishi kerak.
10. Telegram jo‘natmalari kamida bir marta yetkazish usulida: tarmoq uzilishi sababli xabar takrorlanishi mumkin. Buyurtma va to‘lov qarorlari esa takrorlanishdan himoyalangan.

## Keyingi deploy tartibi

- Amaldagi tizimni faqat o‘qish orqali tekshirish; mijoz yozuvlarini olish shart emas.
- Yangi, bo‘sh staging loyihasi va alohida bot; production ma’lumotlarini ko‘chirmaslik.
- Bo‘sh TEST uchun staging bootstrap qo‘llangan. Production uchun `007_v7.sql` va `008_notifications.sql` amaldagi sxemaga solishtirilgandan keyingina alohida ko‘rib chiqiladi.
- `render.staging.yaml` orqali YANGI xizmat; avtomatik deploy o‘chiq.
- Kalitlar faqat xizmatning maxfiy sozlamalariga kiritiladi, chatga yuborilmaydi.
- `scripts/staging_preflight.py` va real integratsiya/mobil sinovlarini bajarish.
- Staging natijalarini ko‘rsatish; faqat shundan keyin production uchun alohida tasdiq olish.

## Sinovlarni qayta ishga tushirish

```bash
pip install -r requirements-dev.txt
npm ci --ignore-scripts
python -m pytest -q
npm test
```

Lokal katalogni ko‘rish uchun (checkout’ga migratsiyalangan test baza kerak):

```bash
APP_ENV=test uvicorn app:app --host 127.0.0.1 --port 8001
```

Test holatida xabar yuborilmaydi. `.env` ga production kalitlarini joylamang.

## Staging provisioning rejimi

`staging_entry:create_app --factory` orqali serverni bazasiz xavfsiz tayyorlash mumkin. `STAGING_SETUP_MODE=true` vaqtida baza va bot kalitlari bo‘lishi rad etiladi; sayt HTTP Basic bilan himoyalangan; barcha amaliyotlar 503, `/readyz` — `ready=false`. `/healthz` faqat server jarayoni ishlayotganini bildiradi. Bu funksional V7 do‘kon deployi emas. Alohida test baza/storage va test bot sozlangach `STAGING_SETUP_MODE=false` qilinadi; asosiy staging tekshiruvlari to‘liq o‘tmasa ilova ishga tushmaydi.

Render TEST boshqaruvi: https://dashboard.render.com/web/srv-db91qvjrjlhs73du0290 . Staging admin va sayt uchun alohida kuchli kalitlar yaratilib, faqat Render environment sozlamalariga berildi; kodga/chatga yozilmadi. Production xizmati `srv-da902rh5efls73a88t8g` sozlamalari o‘zgarmaganligi qayta tekshirildi.

## Supabase TEST — 2026-10-16

`BURANDO V7 STAGING` alohida loyihasi yaratildi: `kfvzzxnkrdzwnnfsvxta`, tashkilot `burandojapan`, region `us-east-1`, narx $0/oy. Eski `BURANDO` loyihasi `rnzubppxzbpbubacpfno` INACTIVE ko‘rindi; sxema o‘qish timeout berdi va unga o‘zgartirish kiritilmadi. Shu sabab production sxemasi bilan yakuniy moslik hali tasdiqlanmagan.

Bo‘sh TEST bazasiga staging-only bootstrap qo‘llandi: 7 ta jadval, katalogga active-read RLS, maxfiy jadvallarga public grantlar bekor qilindi, backend RPC’lar service_role uchun va SECURITY INVOKER. `payment-receipts` private (5 MB), `product-images` public. Mijoz ma’lumoti ko‘chirilmagan; 3 ta TEST namuna mahsulot va TEST banner bor. Bank rekvizitlari o‘rnida haqiqiy pul yubormaslik haqida matn turibdi.

Haqiqiy TEST bazasida service_role huquqlari bilan buyurtma → receipt_submitted → under_review → paid tekshirildi va rollback qilindi. Testdan so‘ng 0 buyurtma qolganligi tasdiqlandi. Data API katalog HTTP200, public orders HTTP401 qaytardi.

Security advisor faqat xususiy backend jadvallarida RLS policies yo‘qligi haqida INFO berdi: bu jadvallar uchun anon/authenticated grantlar ataylab bekor qilingan va foydalanuvchi bevosita DBga kirmaydi. [RLS advisor izohi](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Performance advisor yangi bo‘sh bazadagi ishlatilmagan indekslar haqida INFO berdi; kerakli indekslar saqlandi. [Indeks advisor izohi](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Yangi sb_publishable/sb_secret kalitlari apikey header orqali yuboriladi, JWT sifatida Authorization’ga qo‘yilmaydi. Legacy kalitlar mosligi saqlangan.

Server secret key egasi tomonidan Render TEST environment’iga saqlandi. Keyin TEST URL, publishable key, project ref va isolation flag sozlandi; provisioning rejimi o‘chirildi. Secret key chatga, repository’ga yoki hujjatga ko‘chirilmadi. Test bot tokeni hali yo‘q; Telegram integratsiya/mobil testlari ham qolgan.

CLI yaratgan migration fayli remote migration history’dagi haqiqiy `20261016130039_burando_v7_staging_bootstrap` nomiga moslashtirildi. Bu bootstrap faqat bo‘sh TEST bazasi uchun; mavjud production bazasiga qo‘llanmaydi.

## Funksional staging integratsiya sinovi — 2026-10-16 13:24 UTC

Render deploy `dep-db929e5bq1ds73dl34rg` — live, ilova commit’i `9b29dd49f6b9e4d9bc521b5a17ff1c1547b6ddd1`. `/healthz` HTTP200 va autentifikatsiyalangan bosh sahifa HTTP200. Python sinovlari qayta bajarildi: 35 passed, 23 subtests passed.

Haqiqiy staging HTTPS → FastAPI → alohida Supabase Database/Storage zanjirida 23 tekshiruv o‘tdi: katalog, 25% SALE, banner, to‘lov ko‘rsatmalari, guest checkout, idempotent qayta yuborish, maxfiy tracking, yaroqsiz chekni rad etish, haqiqiy PNG chek yuklash, xususiy chekni ko‘rish, chekni almashtirish, admin ruxsatlari, review, eski version qarorini bloklash, funds_confirmed talabi, TEST PAID tasdig‘i va audit tarixi.

Faqat sun’iy `TEST AUTOMATION` buyurtmasi `BR-261016-0E2538AF` yaratildi va namuna sifatida staging’da qoldirildi; haqiqiy mijoz yoki pul yo‘q. Chek yuborilgach holat `receipt_submitted` bo‘lib qoldi; faqat adminning TEST tasdig‘idan keyin `paid` va `received` bo‘ldi. Chekni almashtirish bilan 4 audit yozuvi qaytdi. Telegram jo‘natmalari staging’da o‘chiq; test buyurtmalari haqiqiy mijozlarga yuborilmaydi.

Sayt login/paroli va admin kaliti faqat Render TEST environment’da boshqariladi (`STAGING_SITE_USER`, `STAGING_SITE_PASSWORD`, `ADMIN_API_KEY`). Integratsiya sinovi uchun staging kirish kalitlari yangilandi. Production kalitlari va xizmatiga tegilmadi. Haqiqiy mobil/WebView, alohida test bot va rasmiy to‘lov/contact sozlamalari qolgan; productionga o‘tish uchun hali tasdiq so‘ralmaydi.

## Telegram iPhone kirish tuzatishi — 2026-10-16

Egasi yaratgan `@brnd_test_bot` uchun token Render TEST sozlamasiga kiritildi va deploy qayta ishga tushdi. BotFather menyusi TEST URLga yo‘naltirilgan. iPhone Telegram WebView HTTP Basic oynasini ko‘rsatmay, 401 JSON chiqarganligi ekran orqali tasdiqlandi. Staging endi sayt ichida login formani ko‘rsatadi. Avvalgi login/parol saqlanadi; muvaffaqiyatli kirish 8 soatlik HMAC imzoli Secure/HttpOnly `__Host-` cookie beradi. Login POST same-origin tekshiradi, 4 KB bilan cheklangan va 10 urinish/daqiqadan keyin vaqtincha bloklanadi. Parol o‘zgarsa sessiyalar bekor bo‘ladi. JavaScript login sahifani o‘z manzilida qayta yuklaydi; Telegram initData fragmenti serverga yuborilmaydi va saqlanadi. API/admin himoyalari va production xatti-harakati saqlangan. 37 Python test va 23 subtest o‘tdi; haqiqiy Telegram qayta sinovi egasi bilan yakunlanishi kerak. Telegram jo‘natmalari TESTda hamon o‘chiq.

## Pastki menyu va alohida rasm oynasi

Egasi yuborgan iPhone ekranida Telegram ichida katalog ochilgani tasdiqlandi. So‘ralgan qora pastki menyu qo‘shildi: Bosh sahifa / Savat / Buyurtmalar / Ma’lumot, UZ/RU, savat soni va iPhone safe-area bo‘shlig‘i bilan. Mavjud savat va buyurtma oynalari qayta ishlatiladi; ma’lumot oynasi sozlangan rasmiy aloqa havolalarini oladi. Telefon header’ida takroriy savat va buyurtma tugmalari yashiriladi.

Mahsulot rasmi yoki ⤢ tugmasi alohida to‘liq ekranli rasm oynasini ochadi. Ikki barmoq bilan 1–5× zoom, surish, ikki marta bosib 3×, +/−/100%, galereya oldinga/orqaga, klaviatura va fokus qaytarish ishlaydi. Zoom faqat rasm transform’iga tegishli; butun sahifada accessibility zoom bloklanmaydi. Oynani yopganda mahsulot oynasi va uning scroll lock holati saqlanadi. DOM sinovida nav UZ/RU, cart count, buyurtmalar, rasm galereyasi va pinch gesture alohida tekshirildi. Haqiqiy iPhone’da rasm gesture va joylashuvni egasi yana tekshirishi kerak. Production o‘zgartirilmadi.

## Katalog boshqaruvlarini ixchamlashtirish

Egasi belgilagan banner/filtr maydoni qisqartirildi. Katalogda endi bir qatorda Filtrlar / Saralash / Sevimlilar tugmalari bor. Brend, razmer, USD min/max narx pastdan ochiladigan oynaga ko‘chirildi; mavjud filter ID va saralash mantiqi saqlandi. Tanlash paytida natija soni ko‘rsatiladi; Ko‘rsatish tasdiqlaydi, X/backdrop/Escape esa o‘zgarishlarni bekor qiladi. Tozalash, tanlangan filtrlar soni va qisqa xulosa, noto‘g‘ri narx oralig‘iga xabar, UZ/RU, klaviatura fokus chegarasi va iPhone safe-area mavjud.

Banner balandligi 220 dan 160 CSS px ga kamaytirildi; sarlavha 2 qator bilan cheklangan, faqat bitta banner bo‘lsa o‘tkazish tugmalari yashiriladi. Bir nechta bannerda avvalgi swipe, pauza va boshqaruvlar saqlangan. Bo‘sh aloqa bloklari joy egallamaydi. DOM testlari apply/cancel/reset/range-validation, RU, natija soni va bitta bannerda keraksiz arrows yo‘qligini tekshiradi; mavjud frontend/admin/database sinovlari o‘tdi. Haqiqiy iPhone joylashuvi egasi bilan qayta ko‘riladi. [Material bottom-sheet rasmiy komponent qo‘llanmasi](https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md) qo‘shimcha mobil boshqaruvlarni alohida pastki oynaga olish usulini tavsiflaydi. Production o‘zgarmagan.

## Matn va rasm orqali qidiruv — 2026-10-17

Qidiruv maydoniga alohida qidirish tugmasi va kamera belgisi qo‘shildi. Matn nom/tavsif/kod bilan birga brendni ham qidiradi. Kamera belgisi galereya yoki kamera orqali rasm tanlash oynasini ochadi. Foydalanuvchi tushuntirishida aniq cheklov bor: dastlabki rasmli qidiruv rang/shakl o‘xshashligini solishtiradi; semantik AI, aniq brend/model identifikatsiyasi yoki butun internetdan qidiruv emas. Natijalarda ishonch foizi o‘ylab topilmaydi.

`POST /api/search/image` JPEG/PNG/WebP, 5 MB, fayl mazmuni va 16 MP piksel limitini tekshiradi; EXIF tozalanadi. Query rasmi doimiy saqlanmaydi, uchinchi tomon servisiga yuborilmaydi. Pillow yordamida oq chetlarni qisqartirish, rang/spatial descriptor va grayscale dHash hisoblanadi. Faqat katalog rasmlari HTTPS orqali images.unsplash.com yoki shu Supabase loyihasining public product-images bucket’idan olinadi; redirect/private host/arbitrary URL rad etiladi. Mijoz URL yubora olmaydi. Katalog descriptorlari process xotirasida 1 soat/400 rasmgacha cache qilinadi. Bir vaqtda bitta query, katalog download 2 parallel, har rasm 5 MB va 6 soniya, index 20 soniya/120 faol mahsulot/birinchi 2 rasm bilan cheklangan. Qamrov to‘liq bo‘lmasa UI shuni bildiradi; 0 rasm tekshirilsa 503. Yakunda faqat o‘xshashlik threshold’idan o‘tgan 20 tagacha kod qaytadi. Bu kichik katalog uchun boshlang‘ich usul; katta katalog va modelni tanish uchun alohida embedding index/model xizmati zarur.

40 Python test va 23 subtest o‘tdi, jumladan rasm mazmuni, mos/o‘zgacha rasmlar, SSRF host cheklovi, partial index, cache va request limitlari. Frontend testida brend qidirish, rasm tanlash/format cheklovi, query yuborish/natija/tozalash va mavjud oqimlar tekshirildi. Haqiqiy serverda turli mijoz rasmlari bo‘yicha topish sifati va iPhone kamera oqimi hali baholanishi kerak. Productionga deploy qilinmagan.

Qidiruv kirish joyi egasining ko‘rsatmasiga muvofiq UZ/RU yonidagi bitta lupa belgisiga ko‘chirildi. Bosh sahifada qidiruv maydoni/kamera yashirin; lupa bosilganda matn maydoni, yonida rasm yuklash belgisi va katalog natijalari ochiladi. Shu paytda hero/banner yashirilib natijalarga joy beriladi. X/Escape yoki pastki Bosh sahifa orqali qidiruv yopiladi va matn/rasm natijalari tozalanadi. Rasm qidiruvining mazmuni va cheklovlari o‘zgarmagan. Frontend testlari boshlang‘ich yashirin holat, til tugmasi yonidagi lupa, ochish/fokus/yopish va avvalgi qidiruv oqimini tekshiradi.
