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
2. Alohida Render TEST xizmati yaratildi: `https://burando-v7-staging.onrender.com` (`srv-db91qvjrjlhs73du0290`, `free`, `virginia`, `develop`, auto-deploy o‘chiq). U himoyalangan provisioning rejimida; funksional do‘kon hali ishga tushmagan. Alohida Supabase TEST loyihasi ham yaratildi; server secret key va test bot hali sozlanmagan.
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
- `007_v7.sql`, keyin `008_notifications.sql` — avval staging’da.
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

Render hali provisioning rejimida. Server secret key integratsiya orqali berilmaydi; egasi uni Supabase TEST loyihasining Settings → API Keys bo‘limidan faqat Render TEST xizmatidagi `SUPABASE_SECRET_KEY` environment qiymatiga ko‘chirishi kerak. Kalit chatga, repository’ga yoki hujjatga yozilmaydi. Render’da Save only tanlanadi; qolgan konfiguratsiya keyin alohida boshqariladi. Test bot tokeni hali yo‘q; Telegram integratsiya/mobil testlari ham qolgan.

CLI yaratgan migration fayli remote migration history’dagi haqiqiy `20261016130039_burando_v7_staging_bootstrap` nomiga moslashtirildi. Bu bootstrap faqat bo‘sh TEST bazasi uchun; mavjud production bazasiga qo‘llanmaydi.
