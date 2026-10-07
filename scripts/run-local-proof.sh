#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python -I scripts/run_local_proof.py "$@"
