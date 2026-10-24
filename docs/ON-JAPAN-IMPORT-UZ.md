# On Japan katalogi — tayyorgarlik va to‘siq

Holat: **import rejasini hisoblash tayyor; haqiqiy katalog import qilinmagan**.
Bu o‘zgarish mijoz ilovasini, bazani yoki LIVE xizmatini o‘zgartirmaydi.

## Kelishilgan qoida

- Manba: rasmiy `www.on.com`, Yaponiya do‘koni. Barcha poyabzal modellari.
- Amaldagi JPY narxi / tekshirilgan JPY-per-USD kursi + 50 USD.
- Chegirmada amaldagi pasaytirilgan JPY narxi asos bo‘ladi. Eskirgan katalog
  narxi yoki tavsiya etilgan boshlang‘ich narx asos bo‘lmaydi.
- Yakuniy USD qiymat sentgacha yaxlitlanadi. Oldingi USD narxdan farq
  10 USD dan kichik bo‘lsa saqlanadi; 10 USD va undan katta bo‘lsa yangilanadi.
- Har bir jins/rang SKU alohida mahsulot: shu rangda mavjud JP razmerlargina
  olinadi. Bir rangning mavjud razmeri boshqa rangga qo‘shilmaydi.
- Mahsulot yo‘qolgan/yarim yuklangan javob mavjud mahsulotlarni o‘chirmaydi.
  Faqat aniq tekshirilgan bo‘sh razmerlar ro‘yxati o‘sha import SKU ni nofaol qiladi.
- Eski BD kodlar nomiga qarab almashtirilmaydi. Avval aniq SKU xaritasi kerak.
  Masalan, BD-000333 Cloudvista 3 o‘z kodi va rasmlari bilan saqlanadi.

## Hozirgi to‘siq

2026-10-22 kuni oddiy server so‘rovi rasmiy On Japan saytidan HTTP 403,
`error code: 1010` javobini oldi. Himoya chetlab o‘tilmadi. Shu sabab haqiqiy
rang/razmer eksporti, manba adapteri va kunlik avtomatik yangilash hali yo‘q.
Qidiruvdagi mahsulot kartochkasi to‘liq, joriy ombor eksporti o‘rniga ishlatilmaydi.

Davom etish uchun On tomonidan ruxsat etilgan feed/API yoki to‘liq eksport manbasi
kerak. Bu ruxsatni taxmin qilish yoki rasm/razmerlarni to‘qib yozish mumkin emas.

## Tayyor qismni ishlatish

`on_catalog.py` faqat kiritilgan eksportni tekshirib o‘zgarish rejasini chiqaradi.
Hech qanday tarmoq so‘rovi, bazaga yozish, sir yoki admin endpoint yo‘q.

```
python scripts/plan_on_import.py official-export.json products-only.json --output review.json
```

Eksport formati `tests/test_on_catalog.py::snapshot` da ko‘rsatilgan.
Testdagi namunalar sun’iy, ularni haqiqiy katalog sifatida import qilmang.
Kurs yo‘nalishi aniq: 1 USD uchun qancha JPY. Kurs manbasi va sanasi majburiy;
testdagi example.test haqiqiy kurs manbasi emas. Importer ma’lumotning
haqiqiyligini kriptografik tasdiqlamaydi: eksport ishonchli operator tomonidan
ruxsatli manbadan olinishi shart. Eksport mijozdan/public endpoint orqali olinmaydi.

## Qolgan ishlar

1. Ruxsatli manbadan to‘liq katalog va har bir SKU mavjudligini olish.
2. Kurs manbasini ulash, joriy chegirma va rangga tegishli rasmlarni tekshirish.
3. Eski Cloudvista SKU xaritasini tekshirish; import bilan takrorlamaslik.
4. Rejani TEST bazasida tranzaksiya va kutilgan-oldingi-qiymat tekshiruvi bilan
   qo‘llaydigan service-role-only RPC yozish. Hozirgi reja qo‘llash vositasi emas.
5. Rasm yuklanishi, filtrlar, mahsulot tanlash, checkout va takroriy importni TEST da tekshirish.
6. Server uxlaganda ham ishlaydigan kunlik scheduler, parallel ishlar uchun lock,
   xato holatida katalogni saqlash va admin kuzatuvini ulash. Bular hali yoqilmagan.
7. LIVE ga alohida tasdiq bilan chiqarish. Mavjud buyurtma narxlari o‘zgarmaydi.
