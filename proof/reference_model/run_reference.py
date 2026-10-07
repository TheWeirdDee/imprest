"""Gate: compare the independent reference model against contract outputs.

Inputs  : proof/reference_model/vectors/{accrual,claims,settlements}.json, produced by
          contracts/test/accounting/ReferenceVectors.t.sol from real desk executions on
          Perpl's exchange bytecode (LOCAL_REPRODUCTION), plus
          proof/experiments/paired-desk/*.json.
Output  : proof/reference_model/results.json
Exit    : 1 on any discrepancy, 2 if vectors are missing.

Run with:  python -I proof/reference_model/run_reference.py
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import imprest_model as m  # noqa: E402

ROOT = HERE.parent.parent
VEC = HERE / "vectors"


def load(name: str):
    p = VEC / f"{name}.json"
    if not p.exists():
        print(f"missing vectors: {p} (run: cd contracts && forge test --match-contract ReferenceVectors)")
        sys.exit(2)
    return json.loads(p.read_text())


def main() -> int:
    results = {"accrual": [], "claims": [], "settlements": [], "paired_desk_identities": []}
    failures = 0

    for v in load("accrual"):
        intervals = [(s["elapsed"], s["exposed"]) for s in v["steps"]]
        expected = m.fee_accrued(v["borrowed"], v["rate_ppm_per_day"], intervals, v["fee_cap"])
        ok = expected == v["contract_fee_accrued"]
        failures += not ok
        results["accrual"].append({"case": v["case"], "model": expected, "contract": v["contract_fee_accrued"], "match": ok})

    for v in load("claims"):
        c = m.claim(v["flat_equity"], v["hwm"], v["fee_outstanding"], v["trader_bps"], v["protocol_bps"])
        o = v["observed"]
        checks = {
            "trader": (c.trader, o["trader"]),
            "protocol": (c.protocol, o["protocol"]),
            "pool_fees": (c.fees_paid, o["pool_fees"]),
            "pool_share": (c.pool_share, o["pool_share"]),
        }
        ok = all(a == b for a, b in checks.values())
        failures += not ok
        results["claims"].append({"case": v["case"], "match": ok, "fields": {k: {"model": a, "contract": b} for k, (a, b) in checks.items()}})

    for v in load("settlements"):
        s = m.settle(v["recoverable_equity"], v["borrowed"], v["fee_outstanding"], v["bounty"], enforced=True)
        o = v["observed"]
        checks = {
            "pool_in": (s.pool_in, o["pool_in"]),
            "keeper": (s.keeper, o["keeper"]),
            "trader": (s.trader, o["trader"]),
            "principal_loss": (s.principal_loss, o["principal_loss"]),
            "fees_written_off": (s.fees_written_off, o["fees_written_off"]),
            "fees_collected": (s.fees_collected, o["fees_collected"]),
        }
        conserved = s.principal_repaid + s.keeper + s.fees_collected + s.trader == v["recoverable_equity"]
        ok = all(a == b for a, b in checks.values()) and conserved
        failures += not ok
        results["settlements"].append({"case": v["case"], "match": ok, "cash_conserved": conserved, "fields": {k: {"model": a, "contract": b} for k, (a, b) in checks.items()}})

    pd = ROOT / "proof" / "experiments" / "paired-desk"
    for f in sorted(pd.glob("*.json")):
        d = json.loads(f.read_text())
        pool_net = d["pool_fees_collected"] + d["pool_profit_share"] - d["pool_principal_loss"]
        ok = pool_net == d["pool_net_result"] and d["actor_net_extraction"] == d["actor_received_total"] - d["trader_stakes"]
        failures += not ok
        results["paired_desk_identities"].append({"scenario": d["scenario"], "match": ok})

    n = sum(len(v) for v in results.values())
    summary = {
        "status": "LOCAL_REPRODUCTION",
        "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "python": sys.version.split()[0],
        "cases": n,
        "failures": failures,
        "gate": "PASS" if failures == 0 else "FAIL",
        "method": "Independent Fraction-based model of PRD v3 rules vs outputs observed from real desk executions on Perpl exchange bytecode rc_v1.1.7-203.",
        "results": results,
    }
    (HERE / "results.json").write_text(json.dumps(summary, indent=2))
    print(f"reference model: {n} cases, {failures} discrepancies -> {summary['gate']}")
    for section, rows in results.items():
        bad = [r for r in rows if not r["match"]]
        print(f"  {section}: {len(rows) - len(bad)}/{len(rows)} match")
        for r in bad:
            print("    MISMATCH", json.dumps(r))
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
