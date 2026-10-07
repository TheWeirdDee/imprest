// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SettlementMath} from "../../src/libraries/SettlementMath.sol";

/// @notice Property tests for the PRD v3 waterfall, claim split and fee accrual.
contract SettlementMathTest is Test {
    function testFuzz_waterfall_conservesCashAndOrdersPriority(
        uint256 equity,
        uint256 borrowed,
        uint256 fees,
        uint256 bounty
    ) public pure {
        equity = bound(equity, 0, 1e15);
        borrowed = bound(borrowed, 0, 1e15);
        fees = bound(fees, 0, 1e13);
        bounty = bound(bounty, 0, 1e9);
        SettlementMath.Waterfall memory w = SettlementMath.waterfall(equity, borrowed, fees, bounty);
        // Every unit of actual cash goes to exactly one destination.
        assertEq(w.principalRepaid + w.keeperPaid + w.feesCollected + w.traderRemainder, equity);
        // Principal first.
        assertEq(w.principalRepaid, equity < borrowed ? equity : borrowed);
        assertEq(w.principalLoss, borrowed > equity ? borrowed - equity : 0);
        assertEq(w.principalRepaid + w.principalLoss, borrowed);
        // Keeper and fees only consume residual trader equity; they never enlarge loss.
        if (w.principalLoss > 0) {
            assertEq(w.keeperPaid, 0);
            assertEq(w.feesCollected, 0);
            assertEq(w.traderRemainder, 0);
        }
        assertLe(w.keeperPaid, bounty);
        // Fee subledger closes exactly.
        assertEq(w.feesCollected + w.feesWrittenOff, fees);
        // Trader receives only after fees are fully collected.
        if (w.traderRemainder > 0) assertEq(w.feesWrittenOff, 0);
    }

    function test_waterfall_prdExampleExactTradingLoss() public pure {
        // PRD: Tier 1, 100 desk, 80 borrowed, 6 AUSD trading loss, 5 AUSD fee cap reached
        SettlementMath.Waterfall memory w = SettlementMath.waterfall(94e6, 80e6, 5e6, 0.5e6);
        assertEq(w.principalRepaid, 80e6);
        assertEq(w.principalLoss, 0);
        assertEq(w.keeperPaid, 0.5e6);
        assertEq(w.feesCollected, 5e6);
        assertEq(w.traderRemainder, 8.5e6); // 9 post-fee residual minus keeper
    }

    function test_waterfall_severeGapExhaustsResidual() public pure {
        SettlementMath.Waterfall memory w = SettlementMath.waterfall(70e6, 80e6, 3e6, 0.5e6);
        assertEq(w.principalLoss, 10e6);
        assertEq(w.keeperPaid, 0);
        assertEq(w.feesWrittenOff, 3e6);
    }

    function testFuzz_claimSplit_conservesGross(
        uint256 equity,
        uint256 hwm,
        uint256 fees,
        uint16 traderBps,
        uint16 protocolBps
    ) public pure {
        equity = bound(equity, 0, 1e15);
        hwm = bound(hwm, 0, 1e15);
        fees = bound(fees, 0, 1e13);
        traderBps = uint16(bound(traderBps, 0, 10_000));
        protocolBps = uint16(bound(protocolBps, 0, 10_000 - traderBps));
        SettlementMath.ClaimSplit memory c = SettlementMath.claimSplit(equity, hwm, fees, traderBps, protocolBps);
        if (equity <= hwm) {
            assertEq(c.gross, 0);
            return;
        }
        assertEq(c.gross, equity - hwm);
        assertEq(c.feesPaid + c.traderShare + c.protocolShare + c.poolShare, c.gross);
        assertLe(c.feesPaid, fees);
        if (c.feesPaid < fees) assertEq(c.feesPaid, c.gross, "fees take all profit before any split");
    }

    function test_claimSplit_prdIllustrativeMonth() public pure {
        // PRD economics: 10.00 realized, 1.20 fee -> 8.80 split 80/15/5
        SettlementMath.ClaimSplit memory c = SettlementMath.claimSplit(110e6, 100e6, 1.2e6, 8_000, 500);
        assertEq(c.feesPaid, 1.2e6);
        assertEq(c.traderShare, 7.04e6);
        assertEq(c.protocolShare, 0.44e6);
        assertEq(c.poolShare, 1.32e6);
    }

    function testFuzz_accrue_chunkedEqualsSingle(uint256 borrowed, uint256 t1, uint256 t2) public pure {
        borrowed = bound(borrowed, 1, 1e12);
        t1 = bound(t1, 0, 30 days);
        t2 = bound(t2, 0, 30 days);
        uint256 cap = type(uint128).max;
        (uint256 a1, uint256 r1) = SettlementMath.accrue(borrowed, 500, t1, 0, 0, cap);
        (uint256 a2,) = SettlementMath.accrue(borrowed, 500, t2, r1, a1, cap);
        (uint256 whole,) = SettlementMath.accrue(borrowed, 500, t1 + t2, 0, 0, cap);
        assertEq(a1 + a2, whole);
    }

    function testFuzz_accrue_neverExceedsCap(uint256 borrowed, uint256 elapsed, uint256 outstanding, uint256 cap)
        public
        pure
    {
        borrowed = bound(borrowed, 0, 1e12);
        elapsed = bound(elapsed, 0, 3650 days);
        cap = bound(cap, 0, 1e12);
        outstanding = bound(outstanding, 0, cap);
        (uint256 added,) = SettlementMath.accrue(borrowed, 1_000, elapsed, 0, outstanding, cap);
        assertLe(outstanding + added, cap);
    }

    function test_accrue_prdTier1Month() public pure {
        // 0.05% a day on 80 AUSD for 30 exposed days = 1.20 AUSD
        (uint256 a,) = SettlementMath.accrue(80e6, 500, 30 days, 0, 0, 5e6);
        assertEq(a, 1.2e6);
    }
}
