# Replay experiment protocol: atomic enforcement vs delayed keeper

Written before the first run (2026-10-07). Parameters below are fixed for the reported run;
any change is a new, separately reported run.

## Hypothesis (PRD v3)

Under the same order flow, limits and stakes, enforcing the policy inside the order
transaction, instead of with a keeper that reacts after the fill, cuts overshoot past the
floor at breach, because a limit-breaking order never reaches the book.

## Null threshold (pre-registered, from the PRD)

If the median overshoot gap between the 1-second keeper baseline and the treatment is
**under 10 bps of desk equity**, the atomic-enforcement headline is dropped.

## Data

Real Binance spot 1-second klines, BTCUSDT and ETHUSDT, 2026-09-17 to 2026-09-30, fetched
from data.binance.vision and verified against published SHA-256 checksums
(data/MANIFEST.json). Close price of each second is used as the mark. The contracts never
saw this data.

## Desk

Funded tier: start equity 500 (100 stake + 400 credit), floor 470 (6% drawdown), per-order
leverage 5x, taker fee 3.45 bps (Perpl taker fee read at Gate 0), forced-close slippage
1 bp on top of the fee.

## Order flow (identical in every arm)

1. At window start the trader opens 4x notional in the direction that turns out adverse
   over the window (windows are selected as breach windows).
2. Every time price moves a further 0.4% against the position since the last order, the
   trader tries to add 0.5x of current equity as notional ("averaging down"), as long as
   total notional stays within 5x equity.

## Arms

- **Treatment (atomic)**: every order is checked in-transaction. An add is refused if
  post-trade equity would be below the floor, or if the existing position's unrealized
  loss exceeds 50 bps of the resulting notional (the stamped maxNegPnlCollatBPS, which
  Perpl enforces on fills that increase a position). Price-driven breaches are enforced
  by a keeper at Monad block speed, modelled as the next 1-second bar.
- **Baseline k in {1, 5, 10} s**: same contracts with the in-transaction checks off and
  Perpl's default negative-PnL limit (1000 bps). A keeper closes the desk k seconds after
  equity first reads below the floor.

## Metrics

- Overshoot past the floor at close, in bps of start equity: max(0, floor - equity at close) / 500 * 10,000.
- Pool loss beyond stake: max(0, 400 - equity at close).
- Breach rate per arm.

## Windows

Non-overlapping 1-hour windows (30-minute step) whose max adverse excursion from the window
open is at least 1.3%. Classified as gapping (largest 5-second move >= 0.4%), trending
(|close - open| >= 1%) or calm. Up to 100 windows, stratified across classes, in time order.

## Known limits

- Python simulation on real prices, not the Perpl-bytecode harness the PRD names; reported
  as SIMULATED.
- Book depth on forced closes is not modelled beyond a fixed 1 bp slippage.
- The treatment's advantage can only come from order-caused risk; a pure price gap hits
  both arms equally once a keeper must act.
