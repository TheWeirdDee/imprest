# Operations

## Services

| Service | Start | Health | Logs |
| --- | --- | --- | --- |
| Web | `pnpm --filter @imprest/web build && pnpm --filter @imprest/web start` | `/status` | Next.js stdout |
| Relayer | `pnpm --filter @imprest/relayer start` | `GET /health` | JSON lines with `operation_id`, desk, nonce, result, code; never keys or signatures |
| Keeper | `pnpm --filter @imprest/keeper start` (`KEEPER_DRY_RUN=true` to observe only) | `GET :8788/` | JSON lines with `operation_id`, desk, action, tx, gas used, gas limit, gas price |
| Indexer | `cd indexer && pnpm dev` (Linux/macOS/Docker) | GraphQL `{ __typename }` | Envio logs |

Run two keeper instances (PRD); enforcement is permissionless, so any instance or anyone
else can act.

## Operator controls

| Action | Call | Effect | Cannot |
| --- | --- | --- | --- |
| Pause new desks | `DeskFactory.setPaused(true)` | `openDesk` reverts `Paused` | affect existing desks |
| Pause new credit | `ImprestPool.setPaused(true)` | `fundDesk` (graduation) reverts | block trading limits, claims, closes, LP withdrawals |
| Lower a cap | `setGrossCap` / `setDeskNotionalCap` with a lower value | immediate; blocks new risk only | block reductions |
| Raise a cap | same with a higher value, then `applyGrossCap` / `applyDeskNotionalCap` after 24 h | timelocked | skip the timelock |
| New policy | `DeskFactory.addCohort` | new desks only; validated against hard caps | change a live desk |

## Runbooks

- **Breach not enforced:** check keeper health; call `enforce()` yourself (anyone can). A
  stale mark makes enforce wait (`MarkStale`).
- **Desk stuck in Enforcing:** read history for `EnforceCloseFailed` (venue halted, no
  liquidity, bankrupt position). Call `enforce()` again once the venue has liquidity or has
  liquidated the position.
- **Settlement pending:** Perpl withdrawal refused (rate limit); retry `enforce()`.
- **Verification failures in the app:** compare `/status` RPC head agreement; a lagging
  verification RPC delays "verified", a disagreeing one fails it by design.
- **Perpl upgrade or unknown revert codes:** pause new desks and new credit, re-run Gate 0
  and the fork test against the new implementation.
