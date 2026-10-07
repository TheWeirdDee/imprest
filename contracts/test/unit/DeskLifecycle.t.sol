// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ImprestFixture} from "../ImprestFixture.sol";
import {Desk} from "../../src/Desk.sol";
import {Order, DeskStatus, EnforceReason, ImprestErrors as E} from "../../src/libraries/ImprestTypes.sol";

/// @notice Desk lifecycle against Perpl's own bytecode: open -> evaluate -> graduate ->
///         funded trading -> flat-only claim -> close / enforce. LOCAL_REPRODUCTION.
contract DeskLifecycleTest is ImprestFixture {
    Desk desk;

    function setUp() public override {
        super.setUp();
        desk = _openDesk(traderA, demoCohort, STAKE);
    }

    function test_openDesk_ownsPerplAccountWithFullStake() public view {
        assertEq(desk.trader(), traderA);
        assertGt(desk.accountId(), 0);
        assertEq(ex.getAccountByAddr(address(desk)).balanceCNS, STAKE);
        (int256 eq, bool valid) = desk.equity();
        assertEq(eq, int256(STAKE));
        assertTrue(valid);
        assertEq(desk.floorEquity(), 94e6);
        assertEq(uint8(desk.status()), uint8(DeskStatus.Active));
    }

    function test_predictDesk_matchesDeployment() public {
        address predicted = factory.predictDesk(traderB, demoCohort);
        Desk d = _openDesk(traderB, demoCohort, STAKE);
        assertEq(address(d), predicted);
    }

    function test_evaluationTrade_opensAndClosesPosition() public {
        _trade(desk, _buy(BTC, 200, 500)); // 200 USD notional at 5x
        assertEq(_lots(desk, BTC), 200);
        _trade(desk, _closeLong(BTC, 200));
        assertEq(_lots(desk, BTC), 0);
        assertEq(desk.closedTradesThisTier(), 1);
        assertLt(_eq(desk), int256(STAKE)); // paid spread + taker fee
        assertGt(_eq(desk), int256(STAKE) - 1e6);
    }

    function test_fullLifecycle_demoCohort_graduateTradeClaimClose() public {
        // Evaluation: two profitable round trips reach +2%.
        _profitableRoundTrip(desk, 400, 100); // +1% on 400 notional ~ +4
        _profitableRoundTrip(desk, 400, 100);
        assertGe(desk.closedTradesThisTier(), 2);
        int256 eqEval = _eq(desk);
        assertGe(eqEval, int256(STAKE * 102 / 100), "eval target");

        // Graduation is permissionless and funds 4x stake from the pool.
        uint256 idleBefore = pool.idleAssets();
        vm.prank(stranger);
        desk.graduate();
        assertEq(desk.tier(), 1);
        assertEq(desk.borrowed(), 4 * STAKE);
        assertEq(pool.idleAssets(), idleBefore - 4 * STAKE);
        assertEq(desk.startEquity(), uint256(eqEval) + 4 * STAKE);
        assertEq(_eq(desk), eqEval + int256(4 * STAKE));

        // Funded trade inside limits, recorded in the pool's exposure guard.
        _trade(desk, _buy(BTC, 1_000, 500));
        assertGt(pool.grossExposure(BTC), 0);
        assertEq(pool.deskGross(address(desk)), pool.grossExposure(BTC));

        // Claim is refused while a position is open.
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.PositionNotFlat.selector, BTC));
        desk.claim();

        // Mark rises, trader flattens, claim pays realized profit above HWM after fees.
        _advance(1 hours);
        _moveBtc(btcMark + btcMark * 60 / 10_000);
        _trade(desk, _closeLong(BTC, _lots(desk, BTC)));
        assertEq(pool.grossExposure(BTC), 0, "exposure released");
        uint256 feesBefore = desk.feeOutstanding();
        assertGt(feesBefore, 0, "fees accrued while exposed");

        uint256 traderBal = usd.balanceOf(traderA);
        uint256 treasuryBal = usd.balanceOf(treasury);
        (int256 eqFlat,) = desk.equity();
        uint256 gross = uint256(eqFlat) - desk.hwm();
        vm.prank(traderA);
        desk.claim();
        uint256 net = gross - feesBefore;
        assertEq(desk.feeOutstanding(), 0);
        assertEq(desk.feeCollected(), feesBefore);
        assertEq(usd.balanceOf(traderA) - traderBal, net * 8_000 / 10_000);
        assertEq(usd.balanceOf(treasury) - treasuryBal, net * 500 / 10_000);
        assertEq(uint256(_eq(desk)), desk.hwm(), "equity back at HWM");

        // Second claim with nothing new reverts (no double claim).
        vm.prank(traderA);
        vm.expectRevert(E.NothingToClaim.selector);
        desk.claim();

        // Voluntary close repays principal and returns the residual; no keeper bounty.
        uint256 deployedBefore = pool.deployedPrincipal();
        traderBal = usd.balanceOf(traderA);
        vm.prank(traderA);
        desk.close();
        assertEq(uint8(desk.status()), uint8(DeskStatus.Closed));
        assertEq(pool.deployedPrincipal(), deployedBefore - 4 * STAKE);
        assertEq(pool.totalPrincipalLoss(), 0);
        assertGt(usd.balanceOf(traderA), traderBal);
        assertEq(usd.balanceOf(address(desk)), 0);
        assertEq(ex.getAccountByAddr(address(desk)).balanceCNS, 0);
    }
}
