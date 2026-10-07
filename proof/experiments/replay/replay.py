"""Replay experiment, implemented exactly as PROTOCOL.md (written before the first run).

    python -I proof/experiments/replay/replay.py

Output: proof/experiments/replay/results.json (status SIMULATED). Independent of the
contracts' code: a fresh Python implementation of the policy on real price history.
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import json
import pathlib
import statistics
import sys
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / "data"

E0 = 500.0
FLOOR = 470.0
BORROWED = 400.0
MAX_LEV = 5.0
OPEN_LEV = 4.0
ADD_FRAC = 0.5
ADD_STEP = 0.004
FEE = 3.45e-4
SLIP = 1e-4
NEG_PNL_STAMP = 0.005  # 50 bps of resulting notional
NEG_PNL_DEFAULT = 0.10  # Perpl default 1000 bps
WINDOW = 3600
STEP = 1800
MIN_ADVERSE = 0.013
GAP_5S = 0.004
TREND = 0.01
TARGET = 100
DELAYS = [1, 5, 10]


def load_day(path: pathlib.Path) -> list[tuple[int, float, float, float]]:
    """Returns (t_sec, low, high, close) per second."""
    with zipfile.ZipFile(path) as z:
        name = z.namelist()[0]
        rows = []
        with z.open(name) as f:
            for r in csv.reader(io.TextIOWrapper(f)):
                if not r or not r[0].isdigit():
                    continue
                t = int(r[0])
                t = t // 1_000_000 if t > 10**14 else t // 1000  # microseconds (2025+) or ms
                rows.append((t, float(r[3]), float(r[2]), float(r[4])))
    rows.sort()
    return rows


def simulate(prices: list[float], side: int, arm: str, delay: int) -> dict:
    """side +1 long, -1 short. arm 'treatment' or 'baseline'."""
    entry_cost = 0.0
    p0 = prices[0]
    equity_cash = E0
    notional_units = OPEN_LEV * E0 / p0  # in base asset
    avg = p0
    equity_cash -= OPEN_LEV * E0 * FEE
    last_order_px = p0
    refused = 0
    adds = 0
    breach_t = None

    def equity(px: float) -> float:
        return equity_cash + side * notional_units * (px - avg)

    for t, px in enumerate(prices[1:], start=1):
        eq = equity(px)
        if breach_t is None and eq < FLOOR:
            breach_t = t
            break
        # averaging-down order flow
        if side * (last_order_px - px) / last_order_px >= ADD_STEP:
            last_order_px = px
            add_notional = ADD_FRAC * max(eq, 0.0)
            cur_notional = notional_units * px
            if cur_notional + add_notional > MAX_LEV * max(eq, 0.0):
                continue
            unreal_loss = max(0.0, -side * notional_units * (px - avg))
            resulting = cur_notional + add_notional
            post_eq = eq - add_notional * FEE
            if arm == "treatment":
                if post_eq < FLOOR or unreal_loss > NEG_PNL_STAMP * resulting:
                    refused += 1
                    continue
            else:
                if unreal_loss > NEG_PNL_DEFAULT * resulting:
                    refused += 1
                    continue
            new_units = add_notional / px
            avg = (avg * notional_units + px * new_units) / (notional_units + new_units)
            notional_units += new_units
            equity_cash -= add_notional * FEE
            adds += 1
    if breach_t is None:
        return {"breach": False, "overshoot_bps": 0.0, "pool_loss": 0.0, "adds": adds, "refused": refused}
    close_t = min(breach_t + delay, len(prices) - 1)
    close_px = prices[close_t]
    close_px_eff = close_px * (1 - side * SLIP)
    eq_close = equity_cash + side * notional_units * (close_px_eff - avg) - notional_units * close_px * FEE
    overshoot = max(0.0, FLOOR - eq_close) / E0 * 10_000
    return {
        "breach": True,
        "breach_second": breach_t,
        "close_second": close_t,
        "equity_at_close": round(eq_close, 6),
        "overshoot_bps": round(overshoot, 4),
        "pool_loss": round(max(0.0, BORROWED - eq_close), 6),
        "adds": adds,
        "refused": refused,
        "final_notional": round(notional_units * close_px, 4),
    }


def windows_for(sym: str, series: list[tuple[int, float, float, float]]):
    by_t = {t: (lo, hi, c) for t, lo, hi, c in series}
    if not series:
        return
    t0, tN = series[0][0], series[-1][0]
    start = t0 - t0 % STEP
    while start + WINDOW <= tN:
        closes, lows, highs = [], [], []
        last = None
        for t in range(start, start + WINDOW):
            v = by_t.get(t)
            if v is None:
                if last is None:
                    break
                v = last  # carry forward through gaps in the 1 s series
            last = v
            lows.append(v[0])
            highs.append(v[1])
            closes.append(v[2])
        if len(closes) == WINDOW:
            o = closes[0]
            adv_long = (o - min(lows)) / o
            adv_short = (max(highs) - o) / o
            side = 1 if adv_long >= adv_short else -1
            adv = max(adv_long, adv_short)
            if adv >= MIN_ADVERSE:
                max5 = max(abs(closes[i] - closes[i - 5]) / closes[i - 5] for i in range(5, WINDOW))
                drift = abs(closes[-1] - o) / o
                cls = "gapping" if max5 >= GAP_5S else ("trending" if drift >= TREND else "calm")
                yield {"symbol": sym, "start": start, "side": side, "adverse": adv, "class": cls, "closes": closes}
        start += STEP


def main() -> int:
    manifest = json.loads((DATA / "MANIFEST.json").read_text())
    files = sorted(DATA.glob("*.zip"))
    if not files:
        print("no data: run fetch_data.py first")
        return 2
    for f in files:
        if hashlib.sha256(f.read_bytes()).hexdigest() != manifest["files"][f.name]["sha256"]:
            print(f"hash mismatch {f.name}")
            return 1
    cands = []
    for sym in ["BTCUSDT", "ETHUSDT"]:
        for f in sorted(DATA.glob(f"{sym}-1s-*.zip")):
            cands.extend(windows_for(sym, load_day(f)))
    cands.sort(key=lambda w: (w["start"], w["symbol"]))
    by_cls = {c: [w for w in cands if w["class"] == c] for c in ("gapping", "trending", "calm")}
    quota = {"gapping": 34, "trending": 33, "calm": 33}
    chosen = []
    for c in quota:
        chosen.extend(by_cls[c][: quota[c]])
    if len(chosen) < TARGET:
        rest = [w for w in cands if w not in chosen]
        chosen.extend(rest[: TARGET - len(chosen)])
    chosen.sort(key=lambda w: (w["start"], w["symbol"]))

    rows = []
    for w in chosen:
        r = {"symbol": w["symbol"], "window_start_utc": dt.datetime.fromtimestamp(w["start"], dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "side": "long" if w["side"] == 1 else "short", "class": w["class"], "adverse_excursion": round(w["adverse"], 5)}
        r["treatment"] = simulate(w["closes"], w["side"], "treatment", 1)
        for d in DELAYS:
            r[f"keeper_{d}s"] = simulate(w["closes"], w["side"], "baseline", d)
        rows.append(r)

    def stats(key: str) -> dict:
        ov = [r[key]["overshoot_bps"] for r in rows]
        br = [r for r in rows if r[key]["breach"]]
        pl = [r[key]["pool_loss"] for r in rows]
        return {
            "breaches": len(br),
            "median_overshoot_bps": round(statistics.median(ov), 3),
            "p90_overshoot_bps": round(sorted(ov)[int(0.9 * (len(ov) - 1))], 3),
            "max_overshoot_bps": round(max(ov), 3),
            "mean_overshoot_bps": round(statistics.fmean(ov), 3),
            "total_pool_loss_beyond_stake": round(sum(pl), 4),
            "windows_with_pool_loss": sum(1 for x in pl if x > 0),
        }

    summary = {k: stats(k) for k in ["treatment"] + [f"keeper_{d}s" for d in DELAYS]}
    gaps = {f"keeper_{d}s": [r[f"keeper_{d}s"]["overshoot_bps"] - r["treatment"]["overshoot_bps"] for r in rows] for d in DELAYS}
    gap_stats = {k: {"median_gap_bps": round(statistics.median(v), 3), "mean_gap_bps": round(statistics.fmean(v), 3)} for k, v in gaps.items()}
    med1 = gap_stats["keeper_1s"]["median_gap_bps"]
    by_class = {}
    for c in ("gapping", "trending", "calm"):
        sub = [r for r in rows if r["class"] == c]
        if sub:
            by_class[c] = {
                "n": len(sub),
                "median_gap_vs_1s_bps": round(statistics.median([r["keeper_1s"]["overshoot_bps"] - r["treatment"]["overshoot_bps"] for r in sub]), 3),
                "median_overshoot_treatment_bps": round(statistics.median([r["treatment"]["overshoot_bps"] for r in sub]), 3),
                "median_overshoot_keeper_1s_bps": round(statistics.median([r["keeper_1s"]["overshoot_bps"] for r in sub]), 3),
            }
    out = {
        "status": "SIMULATED",
        "label": "Python simulation of PROTOCOL.md on real Binance 1 s BTC/ETH history; not the Perpl-bytecode harness",
        "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "protocol": "proof/experiments/replay/PROTOCOL.md",
        "data_manifest": "proof/experiments/replay/data/MANIFEST.json",
        "data_files": len(files),
        "candidate_windows": len(cands),
        "candidates_by_class": {c: len(v) for c, v in by_cls.items()},
        "windows": len(rows),
        "windows_by_class": {c: sum(1 for r in rows if r["class"] == c) for c in ("gapping", "trending", "calm")},
        "summary": summary,
        "overshoot_gap_vs_treatment": gap_stats,
        "by_class": by_class,
        "null_threshold_bps": 10,
        "median_gap_vs_1s_keeper_bps": med1,
        "decision": "HEADLINE_SUPPORTED" if med1 >= 10 else "NULL_THRESHOLD_HIT: drop the atomic-enforcement overshoot headline",
        "rows": rows,
    }
    (HERE / "results.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({k: out[k] for k in ["windows", "windows_by_class", "candidates_by_class", "summary", "overshoot_gap_vs_treatment", "by_class", "decision"]}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
