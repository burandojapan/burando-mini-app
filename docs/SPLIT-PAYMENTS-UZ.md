# 50/50 to‘lov tartibi

Katalog va savat — USD. Admin mahsulotga yetkazish kiritilgan USD narxini yozadi. Checkout serverdan 15 daqiqa amal qiladigan imzolangan hisob oladi: jami USD, jami so‘m, hozirgi 50% va O‘zbekistonga kelgandan keyingi qism. Mijoz summalarni ko‘rib, shartni tasdiqlaydi.

Kurs manbasi: https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/ — O‘zbekiston Markaziy banki (CBU). Google kursi ishlatilmaydi va u bilan bir xil qiymat va’da qilinmaydi. Manba/sana mijozga ko‘rsatiladi. 7 kundan eski yoki yaroqsiz kurs bilan buyurtma yaratilmaydi. Kurs olinmasa qayta urinish ko‘rsatiladi; taxminiy kurs yo‘q.

Buyurtmada kurs, sana, jami va ikkala qism saqlanadi. Jami so‘m bir marta butun so‘mgacha yaxlitlanadi, oldindan qism yarmidan yaxlitlanadi, qoldiq ayirish orqali hisoblanadi. Ikki qism yig‘indisi doim jami summaga teng. Kurs keyingi to‘lovda qayta olinmaydi.

1. Mijoz oldindan 50% to‘lab, birinchi chekni yuklaydi.
2. Admin chekni tekshiruvga oladi va hisobga haqiqiy pul tushganini tasdiqlaydi. Holat `deposit_paid`; bu to‘liq to‘langan degani emas.
3. Tayyorlash, Yaponiyadan yuborish va yo‘lda holatlariga o‘tish mumkin.
4. Admin `arrived_uz` belgilaganda ikkinchi qism ochiladi. Birinchi chek saqlanadi, joriy chek maydoni tozalanadi va versiya oshadi.
5. Ikkinchi chek ham alohida tekshirilib tasdiqlangach `paid` bo‘ladi. Shundan keyin oxirgi yetkazish va topshirish mumkin.

Rad etishda sabab majburiy. Tekshiruvga olinmaguncha chek almashtirilishi mumkin. Cheklar yopiq saqlanadi; ko‘rish buyurtma tokeni yoki admin autentifikatsiyasi bilan. Qaror tarixida bosqich va chek yo‘li saqlanadi. Bekor qilingan/yetkazilgan buyurtmaga chek yoki yangi qaror qabul qilinmaydi.

Eski buyurtmalar `payment_plan=full`: avvalgi summa va tartib o‘zgarmaydi. Eski buyurtmalardagi so‘m snapshotlari saqlanadi. Yangi mahsulot tahriri USD bilan ishlaydi; eski qo‘lda UZS narxlar checkoutda ishlatilmaydi.

## Chiqarish

TEST migratsiyasi: `20261022010000_split_payment_plan.sql`. Avval yangi migratsiya, keyin shu backend/frontend versiyasi birgalikda chiqariladi. LIVE uchun foydalanuvchi tasdig‘i kerak. Haqiqiy bank rekvizitlari admin panel orqali saqlanadi, TEST rekvizitlari LIVEga ko‘chirilmaydi.

Yangi split buyurtmalar yaratilganidan keyin eski UI/backendga oddiy rollback qilish mumkin emas: ular ikki bosqichni bilmaydi. Muammoda yangi checkoutni vaqtincha to‘xtatib, oldinga tuzatish qo‘llash kerak; buyurtmalarni yoki qo‘shimcha ustunlarni o‘chirmang.
