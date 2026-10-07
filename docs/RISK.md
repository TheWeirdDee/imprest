# Risk

Every order is checked inside the desk contract before it reaches Perpl, and equity is
re-checked after the fill in the same transaction. The authoritative list of rules, their
limits and what enforces each one is on the landing page's risk table and in
[SECURITY.md](SECURITY.md); the code is `contracts/src/Desk.sol` (`_trade`). Tests:
`contracts/test/unit/DeskPolicy.t.sol` (28) and `contracts/test/security/Attacks.t.sol` (24).
Testnet evidence: a 6x order sent directly to the desk reverted `LeverageExceeded`
(`proof/receipts/testnet/testnet_canonical_guarded_rejection.json`). Imprest makes no
Sybil-resistance claim; the paired-desk self-attack and the caps it calibrated are in
[DECISIONS.md](DECISIONS.md) (D-009).
