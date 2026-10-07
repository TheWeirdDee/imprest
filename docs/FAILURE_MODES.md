# Failure modes

How each failure surfaces to the user, and what the system does.

| Failure | Detected by | User sees | System does |
| --- | --- | --- | --- |
| Order breaks a desk rule | frontend check, then the desk contract | "Order blocked by desk policy" with the rule and numbers; "Nothing was sent to Perpl" | contract reverts with a named error if sent anyway |
| Equity would end below the floor | desk post-fill check | `FloorBreach` with equity and floor | whole transaction reverts; no position remains |
| Mark stale (> 60 s) | Perpl `markPriceValid` | "Mark price is stale" pill; new risk blocked | reduce-only allowed; enforce waits |
| Fee cap reached | desk | "Credit-fee cap reached" | new risk refused; anyone can enforce |
| Pool cap reached | pool / desk pre-check | "Pool exposure cap reached ... Nothing was sent to Perpl" | revert before execOrder |
| IOC finds no liquidity | Perpl | trade shows "no fill" in history | no position, no error |
| FOK cannot fill | Perpl | "Not enough liquidity" | atomic revert |
| Adding to an underwater position | Perpl negPnl stamp | "Perpl refused the fill" | atomic revert |
| Position gapped past bankruptcy | enforce | desk shows Enforcing; history shows `EnforceCloseFailed` | stays Enforcing, pays nothing; settles after venue liquidation/ADL |
| Venue halted | Perpl | trade fails with the venue error | enforce records state, retries later |
| Withdraw rate-limited | Perpl | claim/close fails with a named error | enforce emits `SettlementPending`; retry |
| Transaction reverted | receipt | "Failed" with the decoded contract error and block | receipt kept in My receipts |
| Second RPC disagrees | verification readback | "Verification failed" with expected vs observed | never shown as success |
| Second RPC unavailable | runner | "Waiting on an external dependency" | no success state |
| Passkey has no PRF | Mera | `PRF_UNAVAILABLE` with browser guidance | no fallback account |
| User cancels passkey | Mera | "Request cancelled. Nothing was sent." | none |
| Perpl API down | proxy | "Chart data unavailable" / "Market data unavailable" | no placeholder data drawn |
| Indexer down | history | "Source: bounded RPC scan (indexer unavailable)" | falls back to bounded getLogs |
| Contracts not deployed | config | "Imprest contracts are not deployed on TESTNET yet: PENDING" | desk actions disabled |
| Relayer quota hit | relayer | 429 "self-submit or retry in a minute" | nothing sent |
| Relayer simulation reverts | relayer | named contract error | nothing sent (no gas spent) |
| Keeper action not accepted | keeper simulation | (operator logs) `not_sent` with the contract error | nothing sent |
