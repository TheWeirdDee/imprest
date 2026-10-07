// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Pure accounting rules from PRD v3 ("Position-use credit fee and debt
///         ceiling", "Breach and fee-cap settlement waterfall", claim()). Kept free of
///         state so the Python reference model (proof/reference_model) can score the
///         same inputs independently.
library SettlementMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant PPM = 1_000_000;
    uint256 internal constant DAY = 86_400;

    struct Waterfall {
        uint256 principalRepaid; // min(E, B)
        uint256 principalLoss; //   max(B - E, 0)
        uint256 keeperPaid; //      min(bounty, R)          (enforced settlement only)
        uint256 feesCollected; //   min(feeOutstanding, R - K)
        uint256 feesWrittenOff; //  feeOutstanding - F
        uint256 traderRemainder; // R - K - F
    }

    /// @param equity          E: actual recoverable AUSD after all positions are closed
    /// @param borrowed        B: outstanding borrowed principal
    /// @param feeOutstanding  accrued, unpaid credit-fee liability
    /// @param bounty          configured keeper bounty (0 for voluntary close)
    function waterfall(uint256 equity, uint256 borrowed, uint256 feeOutstanding, uint256 bounty)
        internal
        pure
        returns (Waterfall memory w)
    {
        w.principalRepaid = equity < borrowed ? equity : borrowed;
        w.principalLoss = borrowed - w.principalRepaid;
        uint256 residual = equity - w.principalRepaid;
        w.keeperPaid = bounty < residual ? bounty : residual;
        uint256 afterKeeper = residual - w.keeperPaid;
        w.feesCollected = feeOutstanding < afterKeeper ? feeOutstanding : afterKeeper;
        w.feesWrittenOff = feeOutstanding - w.feesCollected;
        w.traderRemainder = afterKeeper - w.feesCollected;
    }

    struct ClaimSplit {
        uint256 gross; //          realized equity above the high-water mark
        uint256 feesPaid; //       accrued fees netted first
        uint256 traderShare;
        uint256 protocolShare;
        uint256 poolShare; //      remainder, so rounding dust never leaves the pool's side
    }

    /// @param flatEquity      cash equity of a flat desk
    /// @param hwm             high-water mark (tier start equity; claims return equity to it)
    function claimSplit(
        uint256 flatEquity,
        uint256 hwm,
        uint256 feeOutstanding,
        uint256 traderBps,
        uint256 protocolBps
    ) internal pure returns (ClaimSplit memory c) {
        if (flatEquity <= hwm) return c;
        c.gross = flatEquity - hwm;
        c.feesPaid = feeOutstanding < c.gross ? feeOutstanding : c.gross;
        uint256 net = c.gross - c.feesPaid;
        c.traderShare = (net * traderBps) / BPS;
        c.protocolShare = (net * protocolBps) / BPS;
        c.poolShare = net - c.traderShare - c.protocolShare;
    }

    /// @notice Accrues a position-use fee over `elapsed` seconds on `borrowed` principal,
    ///         carrying the sub-unit remainder so repeated checkpoints cannot round fees away.
    /// @return added          fee units added to the outstanding liability (after the cap)
    /// @return newRemainder   carried numerator remainder (reset when the cap binds)
    function accrue(
        uint256 borrowed,
        uint256 ratePpmPerDay,
        uint256 elapsed,
        uint256 remainder,
        uint256 outstanding,
        uint256 cap
    ) internal pure returns (uint256 added, uint256 newRemainder) {
        if (outstanding >= cap) return (0, 0);
        uint256 num = borrowed * ratePpmPerDay * elapsed + remainder;
        uint256 den = PPM * DAY;
        added = num / den;
        newRemainder = num % den;
        if (outstanding + added >= cap) {
            added = cap - outstanding;
            newRemainder = 0;
        }
    }
}
