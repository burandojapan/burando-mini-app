# BURANDO V7 — initial inspection, 2026-10-14

Baseline: main 2cebbeae4c5756da595443e3823f96f98308b153. Local develop created; remote not modified.

## Observed architecture

- app.py: FastAPI, static assets, httpx calls to Supabase PostgREST and Storage.
- static/app.js: catalog, search, variant cart, Telegram-only checkout and tracking.
- static/admin.js: API-key admin, products, images, order updates.
- supabase_orders.sql: orders/order_items with RLS enabled. No policies defined in this file.
- Products schema, live RLS policies, bucket configuration, actual migrations and Render settings are not available in the repository. These require connected account inspection before schema changes.
- Product reads fall back to local JSON on database errors, including checkout price lookup.
- Order creation uses two REST inserts with compensating deletion; no transaction or idempotency.
- Telegram HMAC validation exists but auth_date freshness, duplicate fields and user shape are not checked.
- No private receipts, guest lookup, receipt decision audit or payment state machine found.
- Admin can currently set paid directly. Existing payment labels reference CLICK.
- Image upload trusts MIME and reads the entire file before checking size.
- Cold-start cause cannot be established from source. Inspect Render plan, deploy and request metrics separately.

## First isolated change

APP_ENV staging now validates explicit project identity, confirmation of empty isolated resources, strong admin key and server-side database key; rejects DEV_MODE and outbound notifications. The existing production startup is preserved when APP_ENV is absent. All Telegram order notices are suppressed in staging/test. This configuration guard does not independently prove that supplied credentials belong to a new project: account-level inspection remains mandatory.

render.staging.yaml is a proposal for a NEW Render service tracking develop, with automatic deployment off. Its confirmation flag intentionally prevents startup until isolation is checked. No resources were provisioned, no database migration applied, no deployment run.

## Next steps after account connection

1. Inspect Render branch/autodeploy settings read-only and Supabase schema/RLS/storage metadata without customer rows.
2. Push develop after reviewing its diff. Create a new empty Supabase project; schema-only migrations and synthetic seed data. Never clone production data.
3. Create separate BotFather test bot; set secrets through service settings, never chat or source control. Keep outbound messages disabled initially.
4. Confirm isolated project ref and keys; create private receipt bucket and review policies. Protect staging admin APIs and the staging site before making it accessible.
5. Provision NEW Render staging service; confirm no live resource IDs/settings changed.
6. Implement checkout/receipt transactional functions and authorization, then UI and other V7 features in small commits. Inspect current DB metadata before writing migrations.
7. Run integration/security/mobile flows on staging and present results and URL. Production changes require explicit approval.

## Verification so far

Four standard-library configuration tests passed, including six unsafe staging configurations. Python syntax compilation passed. FastAPI runtime and end-to-end tests have not run; runtime dependencies are not installed in this workspace. No V7 feature is claimed complete.
