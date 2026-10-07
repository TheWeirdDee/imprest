# Architecture

Imprest turns a trader's onchain record into use-restricted trading credit. Three contracts
on Monad hold all the money; every offchain service can only submit, watch or index.

```
            trader (Mera passkey EOA)
                 |  EIP-712 intent            self-submit
                 v                           /
  web app --> relayer --(tradeWithSig)--> Desk ----execOrder----> Perpl exchange
     |                                     |  ^                    (desk-owned account)
     | reads (2 RPCs)                      |  | getPosition / equity
     v                                     v  |
  status / proof                     ImprestPool  <-- LPs (ERC-4626, idle-only withdrawals)
                                      ^   exposure caps, credit, settlement
  keeper (RPC) --enforce/graduate------+
  indexer (Envio) --display only--> web history, LP console
```

## Contracts (`contracts/src`)

| Contract | Holds | Job |
| --- | --- | --- |
| `Desk` | the trader's Perpl account (stake + any pool credit) | Checks and stamps every order, re-checks equity after the fill, accrues position-use fees, pays flat-only claims, runs the settlement waterfall. No admin functions. |
| `DeskFactory` | nothing | Registers immutable cohorts (validated against hard caps), deploys one desk per trader per slot with CREATE2 (`predictDesk`), pause for new desks only. |
| `ImprestPool` | LP AUSD | ERC-4626 shares; LPs withdraw idle assets only; lends credit to graduating desks; gross-exposure cap per perp and per-desk notional cap, accounted in the same transaction as each trade; cash-basis ledger. |
| `SettlementMath` | n/a | Pure waterfall, claim split and fee accrual, scored independently by the Python reference model. |
| `IPerplExchange` | n/a | Signatures copied from Perpl's published ABI (rc_v1.1.7-203). |

### The order path

1. The trader signs an EIP-712 `TradeIntent` (domain = the desk) with the Mera session key,
   or calls `Desk.trade()` directly.
2. The relayer verifies, simulates and submits `tradeWithSig` with a capped gas limit.
3. The desk checks: active status, allowlisted market, leverage <= 5x, price within 50 bps
   of mark (closes too), valid mark for new risk, reduce-only consistency, fee cap, equity
   above the trading and daily floors, and the pool caps with the worst-case price.
4. It stamps the Perpl order: IOC or FOK only, `leverageHdths`, `maxNegPnlCollatBPS = 50`,
   `lastExecutionBlock = block + 2`.
5. Perpl fills or fails inside the same transaction.
6. The desk re-reads equity; below either floor the whole transaction reverts.
7. Funded desks record the new gross notional in the pool (capped for increases).

### Lifecycle

`Active (tier 0 evaluation) -> graduate() -> Active (funded) -> ... -> close() | enforce() -> Closed`.
`enforce()` moves a breached or fee-capped desk to `Enforcing` (reduce-only), closes
positions in IOC slices at mark +/- 1%, and settles once flat:

1. repay `min(E, B)` principal, record `max(B - E, 0)` loss;
2. keeper bounty `min(bounty, R)` from residual, once, only on enforced settlement;
3. collect fees `min(fees, R - K)`, write off the rest;
4. the trader gets the remainder. Transfers always sum to recoverable equity `E`.

## Services

| Service | Path | Trust |
| --- | --- | --- |
| Web | `web/` (Next.js) | Displays chain state; every action shows `requested -> submitted -> verifying -> verified` and becomes "verified" only when a second, independent RPC reads the expected post-state at the receipt block. |
| Relayer | `relayer/` | Pays gas for signed intents. Cannot alter, replay or invent orders (the desk re-verifies). |
| Keeper | `keeper/` | Reads chain directly, simulates, sends. The contract decides. |
| Indexer | `indexer/` (Envio) | Display data only. Never used to authorize money movement. |
| Shared core | `packages/core` | ABIs, config, accounting library, error taxonomy, verification state machine, evidence rules. |

## Configuration

`config/networks.json` is the only place addresses live. `packages/core/src/networks.ts`
resolves `development | testnet | mainnet` and throws on anything else. The web app reads
`NEXT_PUBLIC_IMPREST_ENV`; services read `IMPREST_ENV`. Testnet builds show a persistent
TESTNET banner.

## Evidence

`proof/` holds receipts, experiments, the reference model and generated claims. The web
proof page renders claims exactly as generated; `scripts/src/validate-evidence.ts` fails CI
on any rule break. See [EVIDENCE_STANDARD.md](EVIDENCE_STANDARD.md).
