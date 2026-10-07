# API

## Contracts

### Desk (one per trader)

| Function | Caller | Notes |
| --- | --- | --- |
| `trade(Order)` | trader | self-submitted order |
| `tradeWithSig(Order, nonce, deadline, sig)` | anyone (relayer) | EIP-712 `TradeIntent`, domain `{name: "Imprest Desk", version: "1", chainId, verifyingContract: desk}`; signer must be the trader; nonce must exceed `lastNonce` |
| `graduate()` | anyone | succeeds only if the next tier's rule holds; reverts `GraduationNotEligible(code)` (1 profit, 2 trades, 3 time, 4 claims, 5 unpaid fees) |
| `claim()` | trader | flat only; realized profit above HWM net of fees |
| `close()` | trader | flat only; split once, repay, settle, no keeper bounty |
| `enforce()` | anyone | trading floor, daily loss or fee cap; partial closes repeatable; bounty once at settlement |
| `checkpoint()` | anyone | accrue fees and refresh the exposure flag |
| `equity()`, `riskState()`, `policy()`, `floorEquity()`, `dailyFloor()` | views | display only |

`Order { perpId, side (0 buy, 1 sell), priceLimit (PNS), lots (LNS), leverage (hundredths), reduceOnly, fillOrKill }`.

Events: `DeskActivated`, `TradeExecuted`, `FeesAccrued`, `Graduated`, `Claimed`,
`EnforcementStarted`, `EnforceCloseFailed`, `PartialClose`, `SettlementPending`, `Settled`.

### DeskFactory

`openDesk(stake, cohortId)`, `predictDesk(trader, cohortId)`, `getCohort(id)`, `cohortCount()`,
`getDesks(trader)`, `allDesks(i)`, `deskTotal()`, `isDesk(addr)`; operator: `addCohort`,
`setCohortActive`, `setPaused`.

### ImprestPool (ERC-4626, shares `ipAUSD`)

LP: `deposit`, `withdraw`/`redeem` (idle only), `maxWithdraw`. Desks: `fundDesk`,
`recordExposure`, `releaseExposure`, `receiveIncome`, `settleDesk`. Views: `idleAssets`,
`deployedPrincipal`, `totalPrincipalLoss`, `totalFeesCollected`, `totalFeesWrittenOff`,
`totalProfitShare`, `grossExposure(perp)`, `grossCap(perp)`, `deskExposure(desk, perp)`,
`deskGross(desk)`, `deskNotionalCap`. Operator: `setGrossCap`, `setDeskNotionalCap`
(increases timelocked 24 h after factory wiring), `applyGrossCap`, `applyDeskNotionalCap`,
`setPaused`, `setTreasury`, `setFactory` (once).

All errors: `contracts/src/libraries/ImprestTypes.sol` (`ImprestErrors`); user-facing text
in `packages/core/src/errors.ts`.

## Relayer (HTTP)

| Method | Path | Body / result |
| --- | --- | --- |
| GET | `/health` | `{ ok, chainId, relayer, balanceWei }` |
| POST | `/v1/intents` | `{ chainId, desk, order: {perpId, side, priceLimit, lots, leverage, reduceOnly, fillOrKill}, nonce, deadline, signature }` (integers as decimal strings) -> `202 { txHash, gas, operation_id }` |
| GET | `/v1/tx/:hash` | `{ state: submitted | executed | failed, blockNumber }` |

Errors: 400 malformed / wrong chain / deadline too far; 401 bad signature or altered fields;
404 not an Imprest desk; 409 nonce used; 410 deadline passed; 422 simulation reverted (named
`code`) or gas above cap; 429 quota; 502 RPC failure. A 202 means submitted, not final.

## Keeper (HTTP)

`GET /` -> `{ ok, chainId, keeper, dryRun, loops, lastLoopAt, actionsSent, simulationsRejected, errors, watched }`.

## Web

`GET /api/perpl/<path>`: read-only proxy to Perpl's market data API. Allowlist:
`pub/context`, `market-data/:id/{ticker,book,candles/:res/:from-:to,funding/:from-:to}`.

## Indexer (GraphQL, Envio/Hasura)

Entities: `Desk`, `DeskEvent`, `Trade`, `Settlement`, `PoolTotals`, `PerpExposure`,
`VenueLiquidation`, `AccountIndex` (`indexer/schema.graphql`). Example:

```graphql
query ($desk: String!) {
  DeskEvent(where: { desk_id: { _eq: $desk } }, order_by: { blockNumber: desc }, limit: 100) {
    kind txHash blockNumber argsJson
  }
}
```
