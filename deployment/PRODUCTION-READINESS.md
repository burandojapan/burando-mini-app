# Production release — 2026-10-17

Production approval was given in the conversation. Main has not been merged.

Read-only inventory after restoring the original paused Supabase project:
- Project rnzubppxzbpbubacpfno, ACTIVE_HEALTHY.
- 62 products, 1 order, 2 order items, 4 product-images storage objects.
- Existing product-code generator and order timestamps triggers must remain.
- Existing payment/delivery check constraints need the additional V7 states.

`production-v7.sql` is a single transaction, prepared specifically for this legacy schema. It contains no staging seed, no customer data, no price backfill and no row deletion. Apply once using a tracked Supabase migration after credentials are confirmed. It preserves legacy status values and uses service-role-only security-invoker RPCs. Public product access is read-only and limited to active products. Private tables have no public policies.

Validation: existing frontend, admin, entrance and database test suites passed; `tests/production-migration.cjs` passed against synthetic legacy data, including constraint changes, preservation and function privileges. Production DDL has not been applied.

Release gates:
1. In production Render environment, confirm SUPABASE_URL points to the original production project, SUPABASE_KEY is its read key and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY) is its server-only write key. The connector cannot read existing environment variables; never paste secrets into chat. Preserve existing production BOT_TOKEN and ADMIN_API_KEY; disable DEV_MODE. Never copy staging keys.
2. Enter real bank/payment instructions, official contacts and manual UZS prices in production admin. No values can be inferred from staging. Until configured, payments and dual prices are incomplete.
3. Apply the reviewed production migration, verify row counts unchanged, then merge develop to main. Main auto-deploys; watch health and read catalog before any checkout tests.
4. Enable production notifications only after selecting and verifying the real admin recipient. The new notification config defaults to disabled, avoiding unexpected historical messages.
5. Production branded static entrance must use the production backend and production health CORS origin; the existing entry service is TEST-only. Do not point the production bot at the TEST entrance.
6. Verify real-device Telegram identity, guest tracking, private receipt access and actual admin/customer notification delivery. Production orders must not be marked paid for testing.

Rollback: redeploy the prior main commit 2cebbeae4c5756da595443e3823f96f98308b153. Leave additive database columns/tables intact. Do not reverse/delete customer records or receipt objects.
