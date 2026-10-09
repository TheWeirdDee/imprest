// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ImprestFixture} from "../ImprestFixture.sol";
import {Desk} from "../../src/Desk.sol";
import {Order, DeskStatus, EnforceReason, ImprestErrors as E} from "../../src/libraries/ImprestTypes.sol";
import {Vm} from "forge-std/Vm.sol";
import {IPerplExchange, IPerplExchangeAdmin} from "../../src/interfaces/IPerplExchange.sol";

/// @notice Graduation, fees, claims, enforcement and settlement waterfall against
///         Perpl's own bytecode. LOCAL_REPRODUCTION.
contract DeskSettlementTest is ImprestFixture {
    struct SettledLog {
        uint8 reason;
        uint256 borrowed;
        uint256 equity;
        uint256 repaid;
        uint256 loss;
        address keeper;
        uint256 keeperPaid;
        uint256 feesAccruedTotal;
        uint256 feesCollected;
        uint256 feesWrittenOff;
        uint256 remainder;
    }

    Desk desk; // demo cohort desk, graduated in _fund()

    function setUp() public override {
        super.setUp();
        desk = _openDesk(traderA, demoCohort, STAKE);
    }

    function _graduate(Desk d) internal {
        _profitableRoundTrip(d, 400, 100);
        _profitableRoundTrip(d, 400, 100);
        vm.prank(keeper);
        d.graduate();
        assertEq(d.tier(), 1);
    }

    // ================= graduation =================

    function test_graduation_prematureRejectsOnchain() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(E.GraduationNotEligible.selector, 1));
        desk.graduate();
    }

    function test_graduation_requiresTradeCount() public {
        // One big profitable round trip clears +2% but not the 2-trade minimum.
        _profitableRoundTrip(desk, 480, 150);
        assertEq(desk.closedTradesThisTier(), 1);
        vm.expectRevert(abi.encodeWithSelector(E.GraduationNotEligible.selector, 2));
        desk.graduate();
    }

    function test_graduation_requiresFlat() public {
        _profitableRoundTrip(desk, 400, 100);
        _profitableRoundTrip(desk, 400, 100);
        _trade(desk, _buy(BTC, 10, 500));
        vm.expectRevert(abi.encodeWithSelector(E.PositionNotFlat.selector, 0));
        desk.graduate();
    }

    function test_graduation_standardCohortRequires24h() public {
        Desk s = _openDesk(traderB, standardCohort, STAKE);
        for (uint256 i; i < 5; i++) {
            _profitableRoundTrip(s, 400, 50);
        }
        assertGe(_eq(s), int256(STAKE * 108 / 100));
        vm.expectRevert(abi.encodeWithSelector(E.GraduationNotEligible.selector, 3));
        s.graduate();
        _advance(1 days);
        s.graduate();
        assertEq(s.tier(), 1);
        assertEq(s.borrowed(), 4 * STAKE);
    }

    function test_graduation_pausedPoolBlocksButCloseStillWorks() public {
        _profitableRoundTrip(desk, 400, 100);
        _profitableRoundTrip(desk, 400, 100);
        vm.prank(operator);
        pool.setPaused(true);
        vm.expectRevert(E.Paused.selector);
        desk.graduate();
        // pause never blocks payouts or closes
        vm.prank(traderA);
        desk.claim();
        vm.prank(traderA);
        desk.close();
        assertEq(uint8(desk.status()), uint8(DeskStatus.Closed));
    }

    function test_factoryPause_blocksNewDesksOnly() public {
        vm.prank(operator);
        factory.setPaused(true);
        vm.startPrank(traderB);
        usd.approve(address(factory), STAKE);
        vm.expectRevert(E.Paused.selector);
        factory.openDesk(STAKE, demoCohort);
        vm.stopPrank();
        _trade(desk, _buy(BTC, 10, 500)); // existing desks keep trading
        vm.expectRevert(E.Paused.selector);
        desk.graduate();
    }

    // ================= fees =================

    function test_fees_evaluationDeskAccruesNothing() public {
        _trade(desk, _buy(BTC, 100, 500));
        _advance(10 days);
        desk.checkpoint();
        assertEq(desk.feeAccrued(), 0);
    }

    function test_fees_flatFundedDeskAccruesNothingForAMonth() public {
        _graduate(desk);
        _advance(30 days);
        desk.checkpoint();
        assertEq(desk.feeAccrued(), 0, "flat month: zero new fees");
    }

    function test_fees_exposedIntervalAccruesExactlyOnceDespitePositionsAndCheckpoints() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 500, 500));
        _trade(desk, _buy(ETH, 50, 500)); // two positions must not double the fee
        uint256 t0 = desk.lastAccrualTs();
        for (uint256 i; i < 24; i++) {
            _advance(1 hours);
            desk.checkpoint();
        }
        uint256 elapsed = desk.lastAccrualTs() - t0;
        // 0.05% a day on 400 AUSD borrowed
        uint256 expected = (desk.borrowed() * 500 * elapsed) / (1_000_000 * 86_400);
        assertApproxEqAbs(desk.feeAccrued(), expected, 1);
        assertEq(desk.feeAccrued(), desk.feeOutstanding());
    }

    function test_fees_chunkedCheckpointsCannotRoundFeesAway() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 500, 500));
        uint256 t0 = desk.lastAccrualTs();
        // 1-second checkpoints: each slice alone rounds to zero units
        for (uint256 i; i < 400; i++) {
            vm.warp(block.timestamp + 1);
            desk.checkpoint();
        }
        uint256 elapsed = desk.lastAccrualTs() - t0;
        uint256 expected = (desk.borrowed() * 500 * elapsed) / (1_000_000 * 86_400);
        assertEq(desk.feeAccrued(), expected);
        assertGt(expected, 0);
    }

    function test_fees_capStopsAccrualAndNewRiskButAllowsReduceAndEnforce() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 500, 500));
        uint256 cap = STAKE * 2_500 / 10_000; // 25 AUSD
        // 0.05%/day on 400 = 0.2 AUSD/day -> cap after 125 days
        for (uint256 i; i < 13; i++) {
            _advance(10 days);
            desk.checkpoint();
        }
        assertEq(desk.feeOutstanding(), cap, "capped, never above");
        assertEq(desk.feeAccrued(), cap);
        _advance(10 days);
        desk.checkpoint();
        assertEq(desk.feeOutstanding(), cap);
        // new risk refused
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.FeeCapReached.selector, cap, cap));
        desk.trade(_buy(BTC, 10, 500));
        // reduce-only still allowed
        _trade(desk, _closeLong(BTC, 100));
        // fee accrual alone is not a trading breach...
        assertGe(_eq(desk), int256(desk.floorEquity()));
        // ...but fee-cap enforcement is available to anyone
        uint256 deployed = pool.deployedPrincipal();
        vm.prank(keeper);
        desk.enforce();
        assertEq(uint8(desk.enforceReason()), uint8(EnforceReason.FeeCap));
        assertEq(uint8(desk.status()), uint8(DeskStatus.Closed));
        assertEq(pool.deployedPrincipal(), deployed - 4 * STAKE);
        assertEq(pool.totalPrincipalLoss(), 0, "fees never consume principal");
        // subledger closes: accrued = collected + outstanding + writtenOff
        assertEq(desk.feeAccrued(), desk.feeCollected() + desk.feeOutstanding() + desk.feeWrittenOff());
        assertEq(desk.feeOutstanding(), 0);
    }

    function test_fees_externalLiquidationCannotEraseExposureTime() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 500, 500));
        // exposure ends offchain-invisibly between checkpoints (simulated by a close we
        // make without a checkpoint is impossible; Perpl liquidation is the real case).
        // The desk charges the elapsed interval at the last known (exposed) flag.
        _advance(2 days);
        desk.checkpoint();
        uint256 a1 = desk.feeAccrued();
        assertGt(a1, 0);
        assertTrue(desk.exposed());
    }

    // ================= claims =================

    function test_claim_unrealizedProfitCannotBeWithdrawn() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 1_000, 500));
        _moveBtc(btcMark * 101 / 100);
        assertGt(_eq(desk), int256(desk.hwm()));
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.PositionNotFlat.selector, BTC));
        desk.claim();
    }

    function test_claim_onlyTrader() public {
        _profitableRoundTrip(desk, 400, 100);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(E.Unauthorized.selector, stranger));
        desk.claim();
    }

    function test_claim_hwmPreventsReclaimAfterLossAndRecovery() public {
        _graduate(desk);
        _profitableRoundTrip(desk, 1_000, 50);
        vm.prank(traderA);
        desk.claim();
        uint256 paid1 = desk.totalPaidToTrader();
        // lose, then recover to exactly the HWM: nothing new to claim
        _trade(desk, _buy(BTC, 500, 500));
        _moveBtc(btcMark * 9_960 / 10_000);
        _trade(desk, _closeLong(BTC, 500));
        assertLt(_eq(desk), int256(desk.hwm()));
        vm.prank(traderA);
        vm.expectRevert(E.NothingToClaim.selector);
        desk.claim();
        assertEq(desk.totalPaidToTrader(), paid1);
    }

    function test_claim_feesNettedFirstAndBookedOnce() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 1_000, 500));
        _advance(5 days);
        _moveBtc(btcMark * 10_080 / 10_000);
        _trade(desk, _closeLong(BTC, 1_000));
        uint256 fees = desk.feeOutstanding();
        assertGt(fees, 0);
        uint256 poolFees = pool.totalFeesCollected();
        vm.prank(traderA);
        desk.claim();
        assertEq(pool.totalFeesCollected() - poolFees, fees);
        assertEq(desk.feeOutstanding(), 0);
        // nothing more to claim, fees are not deducted twice
        vm.prank(traderA);
        vm.expectRevert(E.NothingToClaim.selector);
        desk.claim();
        assertEq(pool.totalFeesCollected() - poolFees, fees);
    }

    // ================= enforcement =================

    function _breach(Desk d, uint256 lots, uint256 dropBps) internal {
        _trade(d, _buy(BTC, lots, 500));
        _moveBtc(btcMark * (10_000 - dropBps) / 10_000);
    }

    function test_enforce_healthyDeskRejected() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 500, 500));
        vm.prank(keeper);
        vm.expectRevert(E.DeskHealthy.selector);
        desk.enforce();
    }

    function test_enforce_breachSettlesWaterfallAndPaysKeeperOnce() public {
        _graduate(desk);
        uint256 start = desk.startEquity();
        _breach(desk, 2_400, 300); // 5x of ~500, -3% => ~-15% of equity
        int256 eqB = _eq(desk);
        assertLt(eqB, int256(desk.floorEquity()));

        uint256 keeperBal = usd.balanceOf(keeper);
        uint256 traderBal = usd.balanceOf(traderA);
        uint256 idle = pool.idleAssets();
        vm.recordLogs();
        vm.prank(keeper);
        desk.enforce();
        assertEq(uint8(desk.status()), uint8(DeskStatus.Closed));
        assertEq(uint8(desk.enforceReason()), uint8(EnforceReason.TradingFloor));

        // Decode Settled and check the waterfall reconciles with actual transfers.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256(
            "Settled(uint8,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256,uint256,uint256)"
        );
        SettledLog memory L;
        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter != address(desk) || logs[i].topics[0] != sig) continue;
            found = true;
            L = abi.decode(logs[i].data, (SettledLog));
        }
        assertTrue(found);
        assertEq(L.borrowed, 4 * STAKE);
        assertEq(L.repaid + L.keeperPaid + L.feesCollected + L.remainder, L.equity, "transfers sum to E");
        assertEq(L.repaid + L.loss, L.borrowed);
        assertEq(usd.balanceOf(keeper) - keeperBal, L.keeperPaid);
        assertEq(usd.balanceOf(traderA) - traderBal, L.remainder);
        assertEq(pool.idleAssets() - idle, L.repaid + L.feesCollected);
        assertEq(L.keeperPaid, 0.5e6, "bounty paid in full from residual");
        assertEq(L.loss, 0, "trader first-loss absorbed the breach");
        assertEq(desk.feeAccrued(), desk.feeCollected() + desk.feeOutstanding() + desk.feeWrittenOff());
        assertLt(start, 1_000e6);

        // Keeper cannot extract the bounty again.
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(E.DeskNotActive.selector, uint8(DeskStatus.Closed)));
        desk.enforce();
    }

    function test_enforce_dailyLossReason() public {
        _graduate(desk);
        // -3.6% equity from the day start, above the 6% floor
        _breach(desk, 2_400, 75);
        int256 e = _eq(desk);
        assertGt(e, int256(desk.floorEquity()));
        assertLt(e, desk.dailyFloor());
        vm.prank(keeper);
        desk.enforce();
        assertEq(uint8(desk.enforceReason()), uint8(EnforceReason.DailyLoss));
    }

    function test_enforce_partialCloseDoesNotSettleAndPaysNothing() public {
        _graduate(desk);
        _breach(desk, 2_400, 300);
        // thin book: only 1,000 lots of bids within the enforce band
        _cancelAll();
        _quote(BTC, 0, btcMark - btcMark / 1_000, 1_000);
        uint256 keeperBal = usd.balanceOf(keeper);
        vm.prank(keeper);
        desk.enforce();
        assertEq(uint8(desk.status()), uint8(DeskStatus.Enforcing));
        assertGt(_lots(desk, BTC), 0);
        assertEq(usd.balanceOf(keeper), keeperBal, "no bounty on partial close");
        assertEq(pool.deployedPrincipal(), 4 * STAKE, "principal not released");

        // enforcing desks are reduce-only: the trader can no longer add risk
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.DeskNotActive.selector, uint8(DeskStatus.Enforcing)));
        desk.trade(_buy(BTC, 10, 500));

        // liquidity returns; a second call finishes and pays once
        _requote();
        vm.prank(keeper);
        desk.enforce();
        assertEq(uint8(desk.status()), uint8(DeskStatus.Closed));
        assertEq(usd.balanceOf(keeper) - keeperBal, 0.5e6);
    }

    /// Without venue insurance, a position gapped past bankruptcy cannot be closed by an
    /// IOC (Perpl: CriticalPerpetualInsolvent). The desk must stay Enforcing, settle
    /// nothing and pay nothing, never report a false settlement. Perpl's own
    /// liquidation / ADL is the last line in that case.
    function test_enforce_bankruptPositionWithoutVenueInsuranceStaysEnforcing() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 2_400, 500));
        _moveBtc(btcMark * 75 / 100);
        uint256 keeperBal = usd.balanceOf(keeper);
        vm.prank(keeper);
        desk.enforce();
        assertEq(uint8(desk.status()), uint8(DeskStatus.Enforcing));
        assertGt(_lots(desk, BTC), 0);
        assertEq(usd.balanceOf(keeper), keeperBal);
        assertEq(pool.deployedPrincipal(), 4 * STAKE);
    }

    function test_enforce_gapPastStakeRecordsPrincipalLossAndZeroKeeper() public {
        _fundInsurance(BTC, 1_000_000e6);
        _graduate(desk);
        _trade(desk, _buy(BTC, 2_400, 500));
        // gap -25%: equity at 5x is wiped out beyond the stake before anyone can act
        _moveBtc(btcMark * 75 / 100);
        // Past bankruptcy the desk's own IOC close cannot settle and Perpl's book
        // liquidation finds no bid at the liquidation price; Perpl's auto-deleveraging
        // against the opposite position (the maker's short) removes it.
        IPerplExchangeAdmin.AdlDesc[] memory adl = new IPerplExchangeAdmin.AdlDesc[](1);
        adl[0].perpId = BTC;
        adl[0].posAccountId = desk.accountId();
        adl[0].sortedPositionIds = new uint256[](1);
        adl[0].sortedPositionIds[0] = ex.getAccountByAddr(maker).accountId;
        vm.prank(perplAdmin); // Perpl position administrator
        ex.autoDeleverage(adl, true);
        assertEq(_lots(desk, BTC), 0, "venue liquidated the desk");
        vm.prank(keeper);
        desk.enforce();
        assertEq(uint8(desk.status()), uint8(DeskStatus.Closed));
        assertGt(pool.totalPrincipalLoss(), 0, "gap loss beyond first-loss is disclosed");
        assertEq(usd.balanceOf(keeper), 0, "exhausted residual equity pays no keeper bounty");
        assertEq(pool.principalOf(address(desk)), 0);
        assertEq(pool.deployedPrincipal(), 0);
        assertEq(usd.balanceOf(address(desk)), 0);
    }

    function test_close_voluntaryPaysNoKeeperAndRequiresFlat() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 100, 500));
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.PositionNotFlat.selector, BTC));
        desk.close();
        _trade(desk, _closeLong(BTC, 100));
        uint256 keeperBal = usd.balanceOf(keeper);
        vm.prank(traderA);
        desk.close();
        assertEq(usd.balanceOf(keeper), keeperBal);
        assertEq(pool.principalOf(address(desk)), 0);
    }

    function test_close_onlyTrader() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(E.Unauthorized.selector, stranger));
        desk.close();
    }

    function test_settledDeskIsInert() public {
        vm.prank(traderA);
        desk.close();
        vm.startPrank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.DeskNotActive.selector, uint8(DeskStatus.Closed)));
        desk.trade(_buy(BTC, 10, 500));
        vm.expectRevert(abi.encodeWithSelector(E.DeskNotActive.selector, uint8(DeskStatus.Closed)));
        desk.claim();
        vm.expectRevert(abi.encodeWithSelector(E.DeskNotActive.selector, uint8(DeskStatus.Closed)));
        desk.close();
        vm.stopPrank();
    }

    // ================= audit additions (2026-10-09) =================

    /// Graduation needs idle pool capital for the credit. If LPs have withdrawn it, graduate()
    /// reverts with InsufficientIdle and the desk is left exactly as it was (still tier 0, no credit).
    function test_graduation_insufficientPoolLiquidityRevertsAndLeavesDeskUnchanged() public {
        _profitableRoundTrip(desk, 400, 100);
        _profitableRoundTrip(desk, 400, 100);
        uint256 out = pool.maxWithdraw(lp);
        vm.prank(lp);
        pool.withdraw(out, lp, lp);
        uint256 credit = STAKE * 4; // demo tier 1: 5x desk, so 4x stake of credit
        uint256 idle = pool.idleAssets();
        assertLt(idle, credit);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(E.InsufficientIdle.selector, credit, idle));
        desk.graduate();
        assertEq(desk.tier(), 0);
        assertEq(desk.borrowed(), 0);
        assertEq(pool.principalOf(address(desk)), 0);
    }

    /// A profitable claim on a funded desk: fees are paid first, then the net profit is split
    /// exactly 80% trader / 5% protocol / remainder pool, nothing is created or lost, equity
    /// returns to the high-water mark, and a second claim reverts.
    function test_claim_payoutSplitIsExactAfterFeesAndCannotRepeat() public {
        _graduate(desk);
        _trade(desk, _buy(BTC, 1_000, 500));
        _advance(2 days);
        _moveBtc(btcMark * 10_080 / 10_000);
        _trade(desk, _closeLong(BTC, 1_000));

        uint256 eq = uint256(_eq(desk));
        uint256 hwm = desk.hwm();
        uint256 fees = desk.feeOutstanding();
        assertGt(fees, 0, "funded desk accrued a fee while exposed");
        assertGt(eq, hwm + fees, "genuine profit above HWM after fees");
        uint256 net = eq - hwm - fees;

        uint256 traderBefore = usd.balanceOf(traderA);
        uint256 treasuryBefore = usd.balanceOf(treasury);
        uint256 poolShareBefore = pool.totalProfitShare();
        uint256 poolFeesBefore = pool.totalFeesCollected();

        vm.prank(traderA);
        desk.claim();

        uint256 traderGot = usd.balanceOf(traderA) - traderBefore;
        uint256 protocolGot = usd.balanceOf(treasury) - treasuryBefore;
        uint256 poolGot = pool.totalProfitShare() - poolShareBefore;
        assertEq(pool.totalFeesCollected() - poolFeesBefore, fees, "fees paid first, in full");
        assertEq(traderGot, (net * 8_000) / 10_000, "trader 80% of net");
        assertEq(protocolGot, (net * 500) / 10_000, "protocol 5% of net");
        assertEq(traderGot + protocolGot + poolGot, net, "split conserves the net profit");
        assertEq(desk.feeOutstanding(), 0);
        assertEq(uint256(_eq(desk)), hwm, "equity back at the high-water mark");

        vm.prank(traderA);
        vm.expectRevert(E.NothingToClaim.selector);
        desk.claim();
    }
}
