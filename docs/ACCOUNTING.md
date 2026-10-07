# Accounting

One canonical model, implemented three times and cross-checked:

| Implementation | Path | Role |
| --- | --- | --- |
| Solidity | `contracts/src/libraries/SettlementMath.sol` | authoritative (moves money) |
| TypeScript | `packages/core/src/accounting.ts` | UI previews (web and mobile) |
| Python (independent, exact rationals) | `proof/reference_model/imprest_model.py` | scores the contract |

Rules: position-use fee only while exposed, capped at 25% of stake; flat-only claims of
realized profit above the high-water mark, fees netted first, split trader/pool/protocol;
settlement waterfall principal -> keeper (once) -> fees -> trader. Agreement: 26/26 cases
from real executions (`proof/reference_model/results.json`); waterfall and split conservation
fuzzed (`contracts/test/accounting/SettlementMath.t.sol`).
