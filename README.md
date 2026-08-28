# BURANDO Mini App V5

Telegram Mini App storefront for BURANDO Japan Store.

## V5 additions
- Product detail modal
- Multi-image product gallery
- Size and color variants
- Quantity selector on product detail
- Variant-aware cart
- Size/color included in Telegram order message
- UZ/RU localization for hero, catalog, cart, product detail and checkout
- Server-side catalog price validation
- Mobile-first premium BURANDO Japan design

## Run locally
```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```

## Environment variables
Copy `.env.example` to `.env` and set your own values. Never commit `.env`.
