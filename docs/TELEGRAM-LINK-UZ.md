# Instagram mijozining Telegramini ulash

Checkoutda Telegramni ulash ixtiyoriy. Brauzer alohida 30 daqiqalik ulash so‘rovi yaratadi. Havola BOT_TOKEN orqali getMe bilan tekshirilgan aynan shu muhit botining Main Mini App sahifasini ochadi. `burando_news_bot` LIVE, `brnd_test_bot` TEST; ikkalasida Main Mini App sozlangan bo‘lishi kerak.

1. Mijoz formani o‘sha Instagram/brauzer oynasida qoldirib «Telegramda ochish»ni bosadi.
2. Telegramdagi oynada kodni solishtiradi va tasdiqlaydi. Server HMAC, auth_date va imzolangan start_param mosligini tekshiradi.
3. Telegram xabarlariga ruxsat so‘raladi. Rad etilsa akkaunt tasdiqlanishi mumkin, lekin bildirishnomalar yetib borishi uchun botni ochib Start/ruxsat kerak.
4. Mijoz avvalgi brauzerga qaytadi. Tasdiq fokusda yoki ochiq checkoutda har 10 soniyada tekshiriladi; qo‘lda tekshirish ham bor. So‘ng ko‘rsatilgan akkaunt o‘ziniki ekanini brauzerda tasdiqlaydi.
5. Buyurtma yaratilayotganda server tasdiqlangan, muddati tugamagan ulash yozuvidan ID/username oladi. Mavjud atomar order RPC va bildirishnoma outbox ishlatiladi.

Bu foydalanuvchining barcha buyurtmalariga umumiy login emas. Ulash faqat shu brauzer sessiyasidagi keyingi buyurtmaga identifikatsiya beradi, 30 daqiqa amal qiladi. Guest buyurtmalarning oldingilari avtomatik boshqa akkauntga berilmaydi. Ulashni uzish yangi buyurtmalar uchun o‘chiradi; oldingi buyurtmaning tekshirilgan egasi o‘zgarmaydi. Brauzer tokeni URLga qo‘yilmaydi; faqat tab sessionStorage va POST tanasida. Telegramga yuboriladigan boshqa nonce brauzer holatini o‘qishga ruxsat bermaydi. Bazada ikkala tokenning faqat SHA256 hashlari saqlanadi. Forma qoralamasi shu tab sessionStorage’da 30 daqiqa saqlanadi va muvaffaqiyatli checkoutdan so‘ng o‘chadi.

Yangi jadval backend-only RLS bilan himoyalangan. Mavjud orders/products va sozlamalarga migratsiya tegmaydi. Muddati o‘tgan ulash yozuvlari keyingi ulash so‘rovida tozalanadi. Soxta initData, boshqa signed start_param, tasdiqlangan akkauntni almashtirish va expired/revoked tokenlar rad etiladi. Bir hisobning takror tasdig‘i xavfsiz. IP limit bir jarayon doirasida.

Bildirishnoma transporti va admin konfiguratsiyasi avvalgidek boshqariladi. Bu funksiya admin xabarlarini o‘zi yoqmaydi, test xabar yubormaydi, webhook/getUpdates ni o‘zgartirmaydi. Telegram va Instagram ilovalari o‘rtasida haqiqiy iPhone/Android almashinuvi, ruxsat so‘rovi va haqiqiy xabar yetishi foydalanuvchi qurilmasida yakuniy tekshiruv talab qiladi.
