# BURANDO V7 — development branch

This branch extends the existing V5/V6 store. It is **not deployed or production-approved**.

- Current implementation and limitations: [V7 status (Uzbek)](docs/V7-STATUS-UZ.md)
- Original architecture inspection: [baseline](docs/V7-INSPECTION.md)
- Staging configuration: `render.staging.yaml` and `.env.staging.example`
- Draft migrations (review against live schema before staging): `migrations/007_v7.sql`, `migrations/008_notifications.sql`
- Tests: `pip install -r requirements-dev.txt`, `npm ci --ignore-scripts`, `python -m pytest -q`, `npm test`

No production data should be copied to staging. Production deployment requires explicit owner approval.

---

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
