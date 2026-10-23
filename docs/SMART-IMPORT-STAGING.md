# Smart Import: staging preview rollout

This patch only enables an opt-in, authenticated metadata preview. It does not
verify JPY prices, compute a price inside the endpoint, publish products, fetch
images, translate text, write to Supabase, or run a daily sync.

## Rollout

1. Keep PR #8 draft and do not merge it into main for this rollout.
2. Confirm the separate Render TEST service and record its current live commit,
   source branch, start command and non-secret flags. Never change the LIVE service.
3. Confirm APP_ENV=staging, independent site credentials and admin key. The normal
   app startup also requires the existing isolated database guard to pass. Do not
   disable isolation validation or reuse production database/bot credentials.
4. If STAGING_SETUP_MODE=true, this router will not load: the provisioning app
   serves a waiting page. Complete the existing isolation checks before switching
   to the normal app. A successful /healthz alone does not prove readiness.
5. Deploy the reviewed PR commit to TEST with SMART_IMPORT_PREVIEW_ENABLED=false.
   Verify the deployed commit and existing shop behavior before enabling preview.
6. Set SMART_IMPORT_PREVIEW_ENABLED=true on TEST only and deploy. Both staging
   site login (Basic/session) and X-Admin-Key are required. Never put the admin
   key in a URL, public JS bundle, repository or test logs.
7. POST /api/admin/smart-import/preview with JSON url, usd_jpy and optional
   current_usd. Only use upstream access authorized for this purpose. The decimal
   inputs are echoed for now; no source JPY price is extracted or inferred.
8. Verify missing site auth -> 401; site auth without admin key -> 403;
   wrong URL -> 400; authorized HTML fetch -> metadata and needs_verified status.
   Check no product rows, media uploads or Telegram messages were created.
9. Roll back by setting the flag false and redeploying, or deploy the recorded
   previous commit. Production never registers this endpoint, even with flag=true.

## Automated checks

Run Python tests with APP_ENV=test and NOTIFICATIONS_ENABLED=false. Tests use
mock transports, never real On Japan/Supabase/Telegram requests. Clear inherited
proxy variables if the local environment injects a SOCKS proxy without socksio.
Run npm ci --ignore-scripts followed by npm test. CI now includes PRs to main as
well as develop and has no deploy step.

The smart import tests cover flag/environment gating, both auth layers, invalid
keys/URLs/decimals, metadata, upstream errors/timeouts/redirects, HTML size limits,
rounding and both directions of the inclusive $10 hold rule. Arithmetic helpers
reject zero/non-finite JPY and invalid rates; an empty/unknown price must never be
substituted with zero.

## Still required after preview

- Approved source access and verified current discounted JPY + variant availability.
- Timestamped exchange rate provenance and stored previous selling price.
- Media/translation permissions and reviewed UZ/RU output.
- Idempotent staging-only upsert of inactive draft products with stable variant keys.
- Separately reviewed scheduler, partial-failure handling and sync audit trail.

No real upstream fetch, TEST deployment or deployed environment isolation is
established by local mock tests. Verify these separately during rollout.
