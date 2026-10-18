# BURANDO V7 — TEST → LIVE (2026-10-18)

Main va develop daraxtlari kirish sahifasi yangilanishidan oldin bir xil edi. TEST uchun yozilgan katalog, qidiruv/filtr, sevimlilar, pastki menyu, alohida rasm zoomi, mehmon/Telegram checkout, yopiq chek, admin tasdig‘i/auditi, USD/UZS narx snapshotlari, SALE, banner boshqaruvi, admin dashboard va yuklar tarixi kodlari jonli versiyada mavjud.

Jonli baza: asl rnzubppxzbpbubacpfno. 62 ta mahsulot saqlangan. TEST buyurtmalari, kalitlari, bot sozlamalari, soxta to‘lov rekvizitlari va TEST bannerlari ko‘chirilmagan. TEST alohida qoladi.

## BURANDO kirish sahifasi

- Savdo kirishi: https://burando-live-entry.onrender.com
- Tayyor serverga o‘tish: https://burando-mini-app.onrender.com/shop
- TEST kirishi o‘zgarmaydi: https://burando-v7-entry.onrender.com
- Build: `node scripts/build-production-entry.cjs`; publish: `build/entry-production`.
- Faqat uchta ommaviy fayl chiqariladi. Hech qanday kalit yoki mijoz ma’lumoti buildga qo‘shilmaydi.
- Faqat production health javobi qabul qilinadi; APIlar uchun CORS ochilmaydi.
- Backend uyg‘onguncha brend ko‘rinadi. Bu bepul serverdagi kutishni yo‘qotmaydi.
- Server tayyor bo‘lsa sun’iy kechikish yo‘q. Internet/xato holatida qayta urinish mavjud; reduced-motion hisobga olingan.
- Telegram launch ma’lumotlari va buyurtma fragmenti faqat xotirada saqlanib, do‘konga uzatiladi; health so‘roviga yuborilmaydi.
- BotFather’da @burando_news_bot Main Mini App URL va chat Menu Button URL shu savdo kirishiga o‘rnatilishi kerak. Agent BotFather hisobini boshqarmaydi.

## Haqiqiy qiymatlar hali kerak

2026-10-18 tekshiruvi: 0 ta mahsulotga UZS narx kiritilgan; to‘lov yo‘riqnomalari va rasmiy kontaktlar sozlanmagan; Telegram notification_config o‘chiq. Bu qiymatlar taxmin qilinmaydi va TESTdan avtomatik ko‘chirilmaydi.

Admin panel https://burando-mini-app.onrender.com/admin:
1. Haqiqiy bank yo‘riqnomalarini UZ/RU kiriting; karta PIN/CVV/OTP kiritmang.
2. USD va UZS narxlarini mahsulotda mustaqil belgilang. Avtomatik kurs hisoblanmaydi.
3. Rasmiy Instagram/support havolalarini va kerakli real promo bannerlarni sozlang.
4. Telegram xabarlari bo‘limida haqiqiy adminni tasdiqlab, xabarlarni yoqing; botni Start qiling.

## Tekshiruv va chegaralar

50 backend testi + 23 subtest; frontend/admin/entry/Postgres testlari o‘tdi. Kirish sahifasida production/staging ajratilishi, xato/offline/retry, RU, Telegram fragmentini saqlash va kechikishsiz handoff tekshirilgan.

Real iPhone’da yangi kirishdan Telegram checkout, rasmiy admin xabari va mijozga holat xabari hali foydalanuvchi bilan tekshirilishi kerak. Mehmonlar buyurtmani maxfiy havola bilan kuzatadi. Rasm qidiruvi lokal vizual o‘xshashlik; semantik AI emas. Yuklar tarixi joriy yuborilgan/yetkazilgan buyurtmalar ro‘yxati; alohida yuk hodisalari timeline’i emas.
