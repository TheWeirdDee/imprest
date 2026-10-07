# Threat model

Assume the trader, relayer and keeper are malicious, the UI is compromised, the indexer
lies, an RPC returns stale data, the market gaps, and third parties revert. The question in
each row: can funds move other than by the contract rules?

| Assumption | What the adversary tries | What stops it | Residual risk |
| --- | --- | --- | --- |
| Trader is malicious | over-leverage, off-market closes, claim paper profit, withdraw credit, average down past limits | desk policy checks + stamps; flat-only claims; no credit withdrawal path; Perpl negPnl stamp | losing their own stake; gap risk beyond the stake (measured, see paired desk) |
| Relayer is malicious | alter fields, replay, delay, hold orders | signature over all fields + per-desk domain; nonce; deadline; lastExecutionBlock stamp | can drop or delay orders; trader can self-submit |
| Keeper is malicious | enforce healthy desks, farm bounty, enforce at a bad moment | `DeskHealthy`; bounty once at final settlement from residual only; closes priced at mark +/- 1% | a breached desk can be enforced at any moment after the breach (by design) |
| UI is compromised | trick the trader into a bad order | the trader still signs the exact fields; contract limits hold regardless of UI | a malicious UI can request a valid-but-unwanted order inside limits |
| Indexer lies | fake history, fake exposure | nothing authorizes from the indexer; money screens read chain on two RPCs; keeper reads RPC | misleading history display |
| RPC is stale or lying | fake success | "verified" requires agreement of an independent RPC at the receipt block; disagreement shows `verification failed` | both RPCs colluding |
| Market gaps | jump through the floor before enforcement | stake share above max drawdown; per-desk notional and gross caps; venue liquidation/ADL | principal loss beyond stakes on large gaps (measured: 206.40 AUSD at a 15% gap without an effective desk cap; ~0 with the 2x cap) |
| Perpl reverts / halts / freezes | trap a desk | named errors; enforce records `EnforceCloseFailed` and stays `Enforcing`; trading reverts cleanly | funds stuck while the venue is halted or the account is frozen |
| AUSD frozen / paused | block transfers | none (issuer power) | funds stuck |
| Opposite desks across identities | win on one desk, breach the other into pool capital | caps calibrated by the paired-desk self-attack; no Sybil claim | bounded by caps in the measured scenarios only |
| Operator compromised | drain the pool | no transfer function; cap increases timelocked; cohorts immutable | pausing growth; lowering caps (blocks new risk, never reductions) |

## Out of scope

Perpl and Agora admin actions; a stolen, unlocked trader device during an active session
(30-minute idle timeout limits the window; payouts only go to the trader's own address);
smart-contract bugs not covered by tests (no audit yet).
