"""Read-only staging check. Run on the staging server with environment secrets configured."""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from environment import validate_environment
import httpx


async def main():
    configuration = validate_environment(os.environ)
    if configuration.name != "staging":
        raise RuntimeError("Run only against staging")
    key = (
        os.environ.get("SUPABASE_SECRET_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )
    url = os.environ["SUPABASE_URL"].rstrip("/")
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = "Bearer " + key
    expected = {
        "products": "id,code,price,sale_price,sale_start,sale_end",
        "orders": "id,order_code,lookup_token_hash,payment_version,telegram_verified,customer_language",
        "order_items": "id,order_id,product_code",
        "payment_audit": "id,order_id,action",
        "store_settings": "id,data",
        "banners": "id,image,starts_at,ends_at",
        "notification_outbox": "id,status,attempts",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        for table, columns in expected.items():
            response = await client.get(
                url + "/rest/v1/" + table,
                headers=headers,
                params={"select": columns, "limit": "0"},
            )
            if not response.is_success:
                raise RuntimeError("Schema check failed: " + table)
            print("Schema OK:", table)
        response = await client.get(
            url + "/storage/v1/bucket/payment-receipts", headers=headers
        )
        if not response.is_success or response.json().get("public") is not False:
            raise RuntimeError("Private receipt bucket unavailable")
        print("Private bucket OK")
        anon = os.environ["SUPABASE_KEY"]
        public_headers = {"apikey": anon}
        if not anon.startswith("sb_publishable_"):
            public_headers["Authorization"] = "Bearer " + anon
        for table in [
            "payment_audit",
            "orders",
            "order_items",
            "notification_outbox",
            "store_settings",
        ]:
            response = await client.get(
                url + "/rest/v1/" + table,
                headers=public_headers,
                params={"select": "*", "limit": "0"},
            )
            # Empty RLS-filtered data cannot prove policies are safe. Fail if REST grants allow a read.
            if response.is_success:
                raise RuntimeError(
                    "Manual RLS/grant review required for "
                    + table
                    + "; successful empty reads cannot prove privacy"
                )
        print(
            "Anonymous table access denied; still review actual RLS/storage policies in metadata."
        )
    print(
        "No customer data read or modified. Staging deployment and real-device tests remain separate."
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        # Deliberately avoid exceptions containing URLs/keys or raw server responses.
        if isinstance(exc, RuntimeError):
            print(str(exc), file=sys.stderr)
        else:
            print(
                "Preflight failed; inspect configuration and connectivity securely.",
                file=sys.stderr,
            )
        raise SystemExit(1)
