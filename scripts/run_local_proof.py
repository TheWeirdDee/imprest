"""Reproduces the local proof campaign and records it under proof/local/.

    python -I scripts/run_local_proof.py            # full suite + reference model
    python -I scripts/run_local_proof.py --fork     # also run the live-testnet fork test

Every artifact records: exact command, dependency versions, Perpl bytecode revision and
hashes, per-test pass/fail, and UTC timestamps. Results are LOCAL_REPRODUCTION (or
SIMULATED for the testnet fork) and are never presented as network results.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTRACTS = ROOT / "contracts"
OUT = ROOT / "proof" / "local"
FORGE = shutil.which("forge") or str(pathlib.Path.home() / ".foundry" / "bin" / "forge")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run(cmd: list[str], cwd: pathlib.Path, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})}, capture_output=True, text=True)


def git_commit() -> str | None:
    r = run(["git", "rev-parse", "HEAD"], ROOT)
    return r.stdout.strip() if r.returncode == 0 else None


def env_info() -> dict:
    manifest = json.loads((CONTRACTS / "perpl-artifacts" / "MANIFEST.json").read_text())
    forge_v = run([FORGE, "--version"], ROOT).stdout.strip().splitlines()
    return {
        "forge": forge_v[0] if forge_v else None,
        "forge_commit": next((l.split(":", 1)[1].strip() for l in forge_v if "Commit" in l), None),
        "solc": "0.8.28 (foundry.toml)",
        "evm_version": "cancun",
        "code_size_limit": 131072,
        "perpl_revision": manifest["revision"],
        "perpl_artifacts": manifest["artifacts"],
        "perpl_source": manifest["source"],
        "openzeppelin": "v5.4.0",
        "python": sys.version.split()[0],
        "platform": sys.platform,
        "git_commit": git_commit(),
    }


def forge_suite() -> dict:
    cmd = [FORGE, "test", "--json", "--no-match-contract", "TestnetFork"]
    started = now()
    r = run(cmd, CONTRACTS)
    finished = now()
    # forge prints compiler output before the JSON object on some platforms
    m = re.search(r"\{.*\}\s*$", r.stdout, re.S)
    if not m:
        return {"command": " ".join(["forge"] + cmd[1:]), "error": r.stderr[-2000:], "exit_code": r.returncode}
    data = json.loads(m.group(0))
    suites, total, passed = [], 0, 0
    for suite_name, suite in sorted(data.items()):
        tests = []
        for test_name, t in sorted(suite["test_results"].items()):
            ok = t["status"] == "Success"
            total += 1
            passed += ok
            kind = t.get("kind", {})
            runs = None
            if isinstance(kind, dict):
                if "Fuzz" in kind:
                    runs = kind["Fuzz"].get("runs")
                elif "Invariant" in kind:
                    runs = kind["Invariant"].get("runs")
            tests.append({"test": test_name, "pass": ok, "runs": runs, "reason": t.get("reason")})
        suites.append({"suite": suite_name, "tests": tests})
    return {
        "command": "cd contracts && forge test --json --no-match-contract TestnetFork",
        "started_utc": started,
        "finished_utc": finished,
        "exit_code": r.returncode,
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "suites": suites,
    }


def fork_run() -> dict:
    cmd = [FORGE, "test", "--match-contract", "TestnetFork", "-vv"]
    started = now()
    r = run(cmd, CONTRACTS, {"FORK_TESTNET": "true"})
    logs = [l.strip() for l in r.stdout.splitlines() if ":" in l and not l.startswith(("Compiling", "Solc", "Ran ", "Suite"))]
    return {
        "status": "SIMULATED",
        "label": "Testnet fork simulation: live Monad testnet state (Perpl exchange, Agora AUSD + faucet, order book) forked locally; nothing broadcast",
        "command": "cd contracts && FORK_TESTNET=true forge test --match-contract TestnetFork -vv",
        "started_utc": started,
        "exit_code": r.returncode,
        "pass": r.returncode == 0 and "[PASS]" in r.stdout,
        "logs": logs,
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cov = OUT / "invariant-coverage.csv"
    if cov.exists():
        cov.unlink()
    info = env_info()
    suite = forge_suite()
    result = {"status": "LOCAL_REPRODUCTION", "network": "local Foundry EVM (not a public network)", "environment": info, "forge": suite}
    if cov.exists():
        rows = [list(map(int, l.split(","))) for l in cov.read_text().splitlines() if l.strip()]
        cols = ["handler_calls", "desks_opened", "random_trades_ok", "graduations", "claims", "settlements"]
        result["invariant_coverage"] = {"runs_logged": len(rows), **{c: sum(r[i] for r in rows) for i, c in enumerate(cols)}}
    (OUT / "forge-test-results.json").write_text(json.dumps(result, indent=2))
    print(f"forge: {suite.get('passed')}/{suite.get('total')} passed")

    if "--fork" in sys.argv:
        fr = fork_run()
        (OUT / "testnet-fork-run.json").write_text(json.dumps(fr, indent=2))
        print(f"testnet fork: {'PASS' if fr['pass'] else 'FAIL'}")

    ref = run([sys.executable, "-I", str(ROOT / "proof" / "reference_model" / "run_reference.py")], ROOT)
    print(ref.stdout.strip())
    ok = suite.get("failed", 1) == 0 and ref.returncode == 0
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
