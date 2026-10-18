# LIVE entry delivery

The public storefront remains at `https://burando-live-entry.onrender.com/`.
The gate waits for a production health response and fetches the current trusted
storefront HTML from `/shop` without sending launch query/fragment credentials.
It mounts the existing customer UI on the CDN origin, loading only the backend's
static assets and Telegram's SDK. The Telegram launch fragment remains intact.
Customer API requests use the original server validation and order-token headers;
cross-origin browser cookies are omitted. Only the exact production entrance can
read the customer API and `/shop`; admin APIs and staging remain excluded.

After inactivity, read-only health probes precede API operations. Mutating requests
are never automatically replayed. Backend cold starts still take time, but their
HTML is not used as a customer document. Failed assets have a branded retry action.

The production bot is checked with getMe before menu edits. Startup repairs the
default menu and at most 50 recent verified-order accounts. A validated WebApp
request repairs only that account's menu. This sends no messages and changes no
webhook. Legacy backend launches move to the CDN only after the new CDN asset is
confirmed available, avoiding a loop during rollout. Guest order credentials on
the legacy backend origin remain in place; Telegram users retain verified access.
During a legacy Telegram handoff, bounded cart item/variant/quantity data is copied
through a temporary fragment, sanitized, and removed before SDK initialization.
No customer fields, prices, or order access tokens are included in that cart copy.

Deploy backend first, confirm it is live, then deploy the existing production
static entrance. Check CORS boundaries, the startup menu summary and the actual
rendered storefront URL. No database migration or paid plan is required. Native
Telegram checks still need a real device. Raw backend URLs continue to have free
Render cold-start behavior. Main Mini App URL in BotFather must be the CDN URL.

Rollback: restore the previous static entrance build, then the previous backend
build. The CDN URL remains valid as its former health-gated redirect. No customer
or database state needs rollback.
