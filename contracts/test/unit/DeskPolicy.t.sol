// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ImprestFixture} from "../ImprestFixture.sol";
import {Desk} from "../../src/Desk.sol";
import {IPerplExchange} from "../../src/interfaces/IPerplExchange.sol";
import {Order, DeskStatus, EnforceReason, ImprestErrors as E} from "../../src/libraries/ImprestTypes.sol";

/// @notice Per-order policy enforcement (PRD "The desk enforces these on every order"),
///         against Perpl's own bytecode. LOCAL_REPRODUCTION.
contract DeskPolicyTest is ImprestFixture {
    Desk desk;

    function setUp() public override {
        super.setUp();
        desk = _openDesk(traderA, standardCohort, STAKE);
    }

    // ---------------- leverage (invariant 3, control 2) ----------------

    function test_leverage_exactlyAtCapAccepted() public {
        _trade(desk, _buy(BTC, 100, 500));
        assertEq(_lots(desk, BTC), 100);
    }

    function test_leverage_oneUnitOverCapRejected() public {
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.LeverageExceeded.selector, 501, 500));
        desk.trade(_buy(BTC, 100, 501));
        assertEq(_lots(desk, BTC), 0);
    }

    function test_leverage_zeroRejected() public {
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.LeverageExceeded.selector, 0, 500));
        desk.trade(_buy(BTC, 100, 0));
    }

    function testFuzz_leverage_aboveCapAlwaysRejected(uint256 lev) public {
        lev = bound(lev, 501, 1_000_000);
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.LeverageExceeded.selector, lev, 500));
        desk.trade(_buy(BTC, 100, lev));
    }

    // ---------------- market allowlist (invariant 4) ----------------

    function test_market_notAllowlistedRejected() public {
        Order memory o = _buy(BTC, 100, 500);
        o.perpId = 48; // SOL id on testnet; not in the cohort
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.MarketNotAllowed.selector, 48));
        desk.trade(o);
    }

    // ---------------- IOC / FOK only (invariant 5) ----------------

    function test_orderType_stampIsAlwaysImmediate() public {
        Order memory o = _buy(BTC, 100, 500);
        IPerplExchange.OrderDesc memory d;
        d.orderDescId = 1;
        d.perpId = BTC;
        d.orderType = 0;
        d.pricePNS = o.priceLimit;
        d.lotLNS = 100;
        d.fillOrKill = false;
        d.immediateOrCancel = true;
        d.postOnly = false;
        d.leverageHdths = 500;
        d.lastExecutionBlock = block.number + 2;
        d.maxNegPnlCollatBPS = 50;
        vm.expectCall(address(ex), abi.encodeCall(IPerplExchange.execOrder, (d)));
        _trade(desk, o);
    }

    function test_orderType_fokStampedAndRevertsAtomicallyWithoutLiquidity() public {
        _cancelAll(); // empty book
        Order memory o = _buy(BTC, 100, 500);
        o.fillOrKill = true;
        vm.prank(traderA);
        vm.expectRevert(); // Perpl UnmatchedLotRemainsInFillOrKill bubbles up
        desk.trade(o);
        assertEq(_lots(desk, BTC), 0);
    }

    function test_orderType_iocWithoutLiquidityLeavesNoPosition() public {
        _cancelAll();
        _trade(desk, _buy(BTC, 100, 500));
        assertEq(_lots(desk, BTC), 0);
        assertFalse(desk.exposed());
    }

    function test_side_invalidRejected() public {
        Order memory o = _buy(BTC, 100, 500);
        o.side = 2;
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.InvalidSide.selector, 2));
        desk.trade(o);
    }

    function test_lots_zeroRejected() public {
        vm.prank(traderA);
        vm.expectRevert(E.InvalidLots.selector);
        desk.trade(_buy(BTC, 0, 500));
    }

    // ---------------- price band (invariant 6) ----------------

    function test_priceBand_exactlyAtBandAccepted() public {
        Order memory o = _buy(BTC, 100, 500);
        o.priceLimit = BTC_MID + BTC_MID * 50 / 10_000;
        _trade(desk, o);
        assertEq(_lots(desk, BTC), 100);
    }

    function test_priceBand_oneTickOutsideRejected() public {
        Order memory o = _buy(BTC, 100, 500);
        o.priceLimit = BTC_MID + BTC_MID * 50 / 10_000 + 1;
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.PriceOutsideBand.selector, o.priceLimit, BTC_MID, 50));
        desk.trade(o);
    }

    function test_priceBand_appliesToClosesToo() public {
        _trade(desk, _buy(BTC, 100, 500));
        Order memory c = _closeLong(BTC, 100);
        c.priceLimit = BTC_MID - BTC_MID * 100 / 10_000; // 1% below mark
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.PriceOutsideBand.selector, c.priceLimit, BTC_MID, 50));
        desk.trade(c);
    }

    function testFuzz_priceBand(uint256 price) public {
        price = bound(price, 1, BTC_MID * 3);
        Order memory o = _buy(BTC, 10, 500);
        o.priceLimit = price;
        uint256 dist = price > BTC_MID ? price - BTC_MID : BTC_MID - price;
        vm.prank(traderA);
        if (dist * 10_000 > BTC_MID * 50) {
            vm.expectRevert(abi.encodeWithSelector(E.PriceOutsideBand.selector, price, BTC_MID, 50));
            desk.trade(o);
        } else {
            desk.trade(o); // inside the band: never refused by the desk policy
        }
    }

    // ---------------- maxNegPnl + lastExecutionBlock stamps (invariants 7, 8) ----------------

    function test_stamp_negPnlAndExecutionBlock() public {
        vm.roll(5_000);
        Order memory o = _sell(BTC, 100, 300);
        IPerplExchange.OrderDesc memory d;
        d.orderDescId = 1;
        d.perpId = BTC;
        d.orderType = 1;
        d.pricePNS = o.priceLimit;
        d.lotLNS = 100;
        d.immediateOrCancel = true;
        d.leverageHdths = 300;
        d.lastExecutionBlock = 5_002;
        d.maxNegPnlCollatBPS = 50;
        vm.expectCall(address(ex), abi.encodeCall(IPerplExchange.execOrder, (d)));
        _trade(desk, o);
    }

    function test_negPnlStamp_perplRejectsFillFarFromMarkWithinBand() public {
        // Asks rest ~0.5% above a lowered mark; a band-legal buy that would fill past the
        // 50 bps loss cap is refused by Perpl itself inside the same transaction.
        _cancelAll();
        _setMark(BTC, BTC_MID);
        _quote(BTC, 1, BTC_MID + BTC_MID * 49 / 10_000, 1_000);
        Order memory o = _buy(BTC, 1_000, 500);
        o.priceLimit = BTC_MID + BTC_MID * 50 / 10_000;
        o.fillOrKill = true;
        vm.prank(traderA);
        vm.expectRevert();
        desk.trade(o);
        assertEq(_lots(desk, BTC), 0);
    }

    // ---------------- floor and daily loss (invariants 9, 10) ----------------

    /// Drives a long position's equity into (floor, floor + 0.15) by lowering the mark.
    function _driveEquityNear(uint256 target) internal {
        _driveEquityNear(target, 450);
    }

    function _driveEquityNear(uint256 target, uint256 lots) internal {
        _trade(desk, _buy(BTC, lots, 500));
        uint256 lo = BTC_MID * 90 / 100;
        uint256 hi = BTC_MID;
        for (uint256 i; i < 40; i++) {
            uint256 mid = (lo + hi) / 2;
            _setMark(BTC, mid);
            int256 e = _eq(desk);
            if (e < int256(target)) lo = mid;
            else hi = mid;
        }
        btcMark = hi;
        _requote();
    }

    function test_floor_breachedDeskRejectsNewRiskAndReduce() public {
        _driveEquityNear(93e6); // below the 94 floor
        int256 e = _eq(desk);
        assertLt(e, 94e6);
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.FloorBreach.selector, e, int256(94e6)));
        desk.trade(_buy(BTC, 10, 500));
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.FloorBreach.selector, e, int256(94e6)));
        desk.trade(_closeLong(BTC, 10));
    }

    function test_floor_postTradeBreachRevertsWholeTransaction() public {
        _driveEquityNear(94.02e6, 300); // 300 lots at 5x leaves free margin for an add
        // Next UTC day: no daily floor until the first trade, which snapshots ~94.05, so
        // the daily limit (3% below that) cannot be what fires here.
        _advance(1 days);
        int256 eq0 = _eq(desk);
        assertGe(eq0, 94e6);
        assertLt(eq0, 94.04e6);
        uint256 lots0 = _lots(desk, BTC);
        // Opening ETH risk pays spread + taker fee, which pushes equity under the trading
        // floor after the fill: the pre-check passes, the post-check reverts everything.
        // (Adding to the underwater BTC long is refused by Perpl itself: its negative PnL
        // exceeds the stamped 50 bps maxNegPnlCollatBPS of resulting notional.)
        vm.prank(traderA);
        vm.expectPartialRevert(E.FloorBreach.selector);
        desk.trade(_buy(ETH, 25, 500));
        assertEq(_lots(desk, ETH), 0, "no ETH position survives");
        assertEq(_lots(desk, BTC), lots0, "no partial state");
        assertEq(_eq(desk), eq0);
    }

    function test_negPnlStamp_venueRefusesAddingToUnderwaterPosition() public {
        _driveEquityNear(97e6, 300); // BTC long ~1% under water
        vm.prank(traderA);
        vm.expectRevert(); // Perpl TakerOrderSettlementFailed (ExceedsMaxNegPnlCollat)
        desk.trade(_buy(BTC, 10, 500));
    }

    function test_dailyLoss_measuredFromFirstTradeOfDay() public {
        _trade(desk, _buy(BTC, 400, 500));
        int256 dayStart = int256(desk.dayStartEquity());
        assertEq(dayStart, int256(STAKE)); // first trade of the day snapshots pre-trade equity
        assertEq(desk.dailyFloor(), int256(STAKE * 9_700 / 10_000));
    }

    function test_dailyLoss_breachBlocksNewRiskButAboveFloor() public {
        _driveEquityNear(96e6); // below 97 daily floor, above 94 trading floor
        int256 e = _eq(desk);
        assertLt(e, 97e6);
        assertGt(e, 94e6);
        int256 dfl = desk.dailyFloor();
        assertEq(dfl, 97e6);
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.DailyLossExceeded.selector, e, dfl));
        desk.trade(_buy(BTC, 10, 500));
    }

    function test_dailyLoss_resetsNextUtcDay() public {
        _driveEquityNear(96e6);
        _advance(1 days);
        assertEq(desk.dailyFloor(), type(int256).min, "no daily floor before today's first trade");
        // Trading floor still applies; a new day's first trade snapshots the new start.
        int256 before = _eq(desk);
        _trade(desk, _closeLong(BTC, 10));
        assertEq(desk.dayStartEquity(), uint256(before));
        assertEq(desk.dailyFloor(), int256(uint256(before) * 9_700 / 10_000));
    }

    // ---------------- stale mark (invariants 14, 15; control 3) ----------------

    function test_staleMark_refusesNewRiskAllowsReduceOnly() public {
        _trade(desk, _buy(BTC, 100, 500));
        vm.warp(block.timestamp + 2 hours);
        vm.roll(block.number + 20_000);
        (,, bool valid) = ex.getPosition(BTC, desk.accountId());
        assertFalse(valid);
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.MarkStale.selector, BTC));
        desk.trade(_buy(BTC, 10, 500));
        // reduce-only is still accepted with a stale mark
        _trade(desk, _closeLong(BTC, 100));
        assertEq(_lots(desk, BTC), 0);
    }

    function test_staleMark_enforceWaits() public {
        _driveEquityNear(93e6);
        vm.warp(block.timestamp + 2 hours);
        vm.roll(block.number + 20_000);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(E.MarkStale.selector, 0));
        desk.enforce();
    }

    // ---------------- reduce-only validation ----------------

    function test_reduceOnly_withoutPositionRejected() public {
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.ReduceOnlyInvalid.selector, BTC));
        desk.trade(_closeLong(BTC, 10));
    }

    function test_reduceOnly_wrongSideRejected() public {
        _trade(desk, _buy(BTC, 100, 500));
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.ReduceOnlyInvalid.selector, BTC));
        desk.trade(_closeShort(BTC, 10));
    }

    function test_reduceOnly_largerThanPositionRejected() public {
        _trade(desk, _buy(BTC, 100, 500));
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.ReduceOnlyInvalid.selector, BTC));
        desk.trade(_closeLong(BTC, 101));
    }

    // ---------------- control 1: healthy trader, 50 trades, zero enforcements ----------------

    function test_control_healthyTraderFiftyTradesNoEnforcement() public {
        for (uint256 i; i < 25; i++) {
            _trade(desk, _buy(BTC, 100, 500));
            _trade(desk, _closeLong(BTC, 100));
        }
        assertEq(desk.closedTradesThisTier(), 25);
        assertGe(_eq(desk), int256(desk.floorEquity()));
        vm.prank(keeper);
        vm.expectRevert(E.DeskHealthy.selector);
        desk.enforce();
    }
}
