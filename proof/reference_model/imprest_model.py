"""Independent reference model of Imprest V0 accounting.

Written from the PRD v3 text, NOT from the Solidity or TypeScript code. It uses exact
rational arithmetic (fractions.Fraction) and deliberately different formulations:

* Fees: the contract carries a remainder between checkpoints; this model integrates the
  exact fee over every exposed interval and floors the cumulative total once.
* Claims: the contract computes shares with integer division in a fixed order; this model
  computes exact rational shares and floors each recipient's share, giving the pool the
  rounding dust, as the PRD requires ("rounding dust never leaves the pool's side").
* Waterfall: implemented as the four numbered steps of the PRD section
  "Breach and fee-cap settlement waterfall".

All amounts are AUSD base units (6 decimals) as Python ints.
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from math import floor

SECONDS_PER_DAY = 86_400
PPM = 1_000_000
BPS = 10_000


# ---------------------------------------------------------------------------
# Credit fee (PRD: "Position-use credit fee and debt ceiling")
# ---------------------------------------------------------------------------

def fee_accrued(borrowed: int, rate_ppm_per_day: int, intervals: list[tuple[int, bool]], fee_cap: int) -> int:
    """Fee owed after a sequence of (seconds, exposed) intervals.

    Only exposed intervals accrue; flat intervals accrue nothing; multiple positions do
    not multiply the fee; outstanding liability never exceeds the cap.
    """
    exact = Fraction(0)
    for seconds, exposed in intervals:
        if exposed:
            exact += Fraction(borrowed * rate_ppm_per_day * seconds, PPM * SECONDS_PER_DAY)
    return min(floor(exact), fee_cap)


# ---------------------------------------------------------------------------
# Flat-only claim (PRD: claim())
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Claim:
    gross: int
    fees_paid: int
    trader: int
    protocol: int
    pool_share: int


def claim(flat_equity: int, hwm: int, fee_outstanding: int, trader_bps: int, protocol_bps: int) -> Claim:
    if flat_equity <= hwm:
        return Claim(0, 0, 0, 0, 0)
    gross = flat_equity - hwm
    fees_paid = min(gross, fee_outstanding)       # "net accrued fees against realized profit first"
    net = gross - fees_paid
    trader = floor(Fraction(net) * Fraction(trader_bps, BPS))
    protocol = floor(Fraction(net) * Fraction(protocol_bps, BPS))
    pool_share = net - trader - protocol          # pool keeps rounding dust
    return Claim(gross, fees_paid, trader, protocol, pool_share)


# ---------------------------------------------------------------------------
# Settlement waterfall (PRD: four numbered steps)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Settlement:
    principal_repaid: int
    principal_loss: int
    keeper: int
    fees_collected: int
    fees_written_off: int
    trader: int

    @property
    def pool_in(self) -> int:
        return self.principal_repaid + self.fees_collected


def settle(recoverable_equity: int, borrowed: int, fee_outstanding: int, bounty: int, enforced: bool) -> Settlement:
    E = max(recoverable_equity, 0)
    B = borrowed
    # 1. repay min(E, B) to the pool; principalLoss = max(B - E, 0)
    repaid = min(E, B)
    loss = max(B - E, 0)
    # 2. R = max(E - B, 0); keeper K = min(bounty, R) only for enforcement settlement
    R = max(E - B, 0)
    K = min(bounty, R) if enforced else 0
    # 3. collect F = min(fees, R - K); write off the rest
    F = min(fee_outstanding, R - K)
    written_off = fee_outstanding - F
    # 4. trader receives R - K - F
    trader = R - K - F
    return Settlement(repaid, loss, K, F, written_off, trader)


# ---------------------------------------------------------------------------
# Risk geometry (PRD: credit policy)
# ---------------------------------------------------------------------------

def floor_equity(start_equity: int, max_drawdown_bps: int) -> int:
    return floor(Fraction(start_equity) * Fraction(BPS - max_drawdown_bps, BPS))


def daily_floor(day_start_equity: int, daily_loss_bps: int) -> int:
    return floor(Fraction(day_start_equity) * Fraction(BPS - daily_loss_bps, BPS))


def notional(lots: int, price_pns: int, price_decimals: int, lot_decimals: int, collateral_decimals: int = 6) -> int:
    exact = Fraction(lots * price_pns) * Fraction(10 ** collateral_decimals, 10 ** (price_decimals + lot_decimals))
    return floor(exact)
