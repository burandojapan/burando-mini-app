"""Render cron entry: same guarded service used by admin, no Telegram delivery."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from uniqlo_sync import Service

async def main():
    result = await Service(app).run(automatic=True)
    print(result)  # counts/run ID only; no credentials or source response
    if result['status'] != 'success':
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
