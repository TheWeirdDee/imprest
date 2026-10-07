"""Downloads real 1-second BTC/ETH spot klines from Binance's public data archive
(data.binance.vision) and verifies each file against its published SHA-256 checksum.

    python -I proof/experiments/replay/fetch_data.py 2026-09-17 2026-09-30

Raw data is NOT committed (see .gitignore); data/MANIFEST.json records source URL,
retrieval time and hashes so the exact dataset can be re-fetched and checked.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / "data"
BASE = "https://data.binance.vision/data/spot/daily/klines/{sym}/1s/{sym}-1s-{day}.zip"
SYMBOLS = ["BTCUSDT", "ETHUSDT"]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "imprest-replay/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print(f"  retry {attempt + 1}: {e}")
    raise RuntimeError("unreachable")


def main() -> int:
    start = dt.date.fromisoformat(sys.argv[1])
    end = dt.date.fromisoformat(sys.argv[2])
    DATA.mkdir(parents=True, exist_ok=True)
    manifest_path = DATA / "MANIFEST.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"source": "Binance public market data, https://data.binance.vision (spot klines, 1s)", "terms": "https://www.binance.com/en/terms", "files": {}}
    day = start
    while day <= end:
        for sym in SYMBOLS:
            name = f"{sym}-1s-{day.isoformat()}.zip"
            dest = DATA / name
            url = BASE.format(sym=sym, day=day.isoformat())
            if dest.exists() and name in manifest["files"]:
                day_done = True
            else:
                body = fetch(url)
                expected = fetch(url + ".CHECKSUM").decode().split()[0]
                got = hashlib.sha256(body).hexdigest()
                if got != expected:
                    print(f"CHECKSUM MISMATCH {name}: {got} != {expected}")
                    return 1
                dest.write_bytes(body)
                manifest["files"][name] = {
                    "url": url,
                    "sha256": got,
                    "bytes": len(body),
                    "retrieved_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
                print(f"  {name} ok ({len(body)} bytes)")
        day += dt.timedelta(days=1)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"{len(manifest['files'])} files in manifest")
    return 0


if __name__ == "__main__":
    sys.exit(main())
