"""Durable at-least-once Telegram delivery. Disabled by default and always off in staging."""

import asyncio, logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import httpx

log = logging.getLogger("burando.notifications")


def install(app, ns):
    async def rest(method, path, **kwargs):
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(
                method,
                ns.SUPABASE_URL + "/rest/v1/" + path,
                headers=ns.sb_headers(True, "return=minimal"),
                **kwargs,
            )
        response.raise_for_status()
        return response.json() if response.content else None

    async def dispatch():
        if (
            ns.ENVIRONMENT.name != "production"
            or not ns.ENVIRONMENT.notifications_enabled
        ):
            return {"enabled": False, "processed": 0}
        if not ns.BOT_TOKEN or not ns.ADMIN_CHAT_ID:
            return {"enabled": False, "processed": 0}
        processed = 0
        for _ in range(10):
            item = await rest("POST", "rpc/burando_claim_notification", json={})
            if not item:
                break
            target = (
                ns.ADMIN_CHAT_ID
                if item["audience"] == "admin"
                else item["telegram_user_id"]
            )
            try:
                message = item["message"]
                if item["audience"] == "admin":
                    orders = await rest(
                        "GET",
                        "orders",
                        params={
                            "id": "eq." + str(item["order_id"]),
                            "select": "customer_name,phone,backup_phone,address,comment,telegram_username",
                        },
                    )
                    products = await rest(
                        "GET",
                        "order_items",
                        params={
                            "order_id": "eq." + str(item["order_id"]),
                            "select": "product_code,title,qty,size,color,line_total",
                        },
                    )
                    if orders:
                        order = orders[0]
                        message += "\n" + "\n".join(
                            str(order.get(key) or "")
                            for key in [
                                "customer_name",
                                "phone",
                                "backup_phone",
                                "address",
                                "comment",
                                "telegram_username",
                            ]
                        )
                    message += "\n" + "\n".join(
                        f"{p['product_code']} · {p['title']} × {p['qty']} · {p['size']} / {p['color']} · USD {p['line_total']}"
                        for p in products
                    )
                async with httpx.AsyncClient(timeout=20) as client:
                    r = await client.post(
                        "https://api.telegram.org/bot" + ns.BOT_TOKEN + "/sendMessage",
                        json={"chat_id": target, "text": message[:4000]},
                    )
                if not r.is_success or not r.json().get("ok"):
                    raise RuntimeError("Telegram delivery refused")
                patch = {"status": "sent", "last_error": "", "lease_until": None}
            except Exception:
                # Do not log URLs or exception strings: Telegram URL contains a bot token.
                patch = {
                    "status": "pending" if item["attempts"] < 5 else "failed",
                    "last_error": "Telegram delivery failed",
                    "available_at": (
                        datetime.now(timezone.utc)
                        + timedelta(seconds=min(3600, 30 * 2 ** item["attempts"]))
                    ).isoformat(),
                    "lease_until": None,
                }
            await rest(
                "PATCH",
                "notification_outbox",
                params={
                    "id": "eq." + str(item["id"]),
                    "status": "eq.sending",
                    "attempts": "eq." + str(item["attempts"]),
                },
                json=patch,
            )
            processed += 1
        return {"enabled": True, "processed": processed}

    from fastapi import Header

    @app.post("/api/admin/notifications/dispatch")
    async def manual(x_admin_key: str = Header(default="")):
        ns.require_admin_key(x_admin_key)
        return await dispatch()

    @app.get("/api/admin/notifications")
    async def status(x_admin_key: str = Header(default="")):
        ns.require_admin_key(x_admin_key)
        return await rest(
            "GET",
            "notification_outbox",
            params={
                "select": "id,order_id,audience,status,attempts,last_error,created_at",
                "order": "id.desc",
                "limit": "100",
            },
        )

    async def run():
        while True:
            try:
                await dispatch()
            except Exception:
                log.warning("Notification outbox unavailable; retry scheduled")
            await asyncio.sleep(30)

    previous_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application):
        async with previous_lifespan(application):
            task = (
                asyncio.create_task(run())
                if ns.ENVIRONMENT.name == "production"
                and ns.ENVIRONMENT.notifications_enabled
                else None
            )
            try:
                yield
            finally:
                if task:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

    app.router.lifespan_context = lifespan
