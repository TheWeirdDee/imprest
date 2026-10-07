// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ImprestFixture} from "../ImprestFixture.sol";
import {Desk} from "../../src/Desk.sol";
import {IPerplExchange} from "../../src/interfaces/IPerplExchange.sol";
import {Order, DeskStatus, ImprestErrors as E} from "../../src/libraries/ImprestTypes.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ImprestPool} from "../../src/ImprestPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Red-team suite: malicious trader, relayer, keeper, operator surface and venue
///         failures, against Perpl's own bytecode. LOCAL_REPRODUCTION.
contract AttacksTest is ImprestFixture {
    Desk desk; // funded demo desk

    function setUp() public override {
        super.setUp();
        desk = _openDesk(traderA, demoCohort, STAKE);
        _profitableRoundTrip(desk, 400, 100);
        _profitableRoundTrip(desk, 400, 100);
        desk.graduate();
    }

    // ================= unauthorized callers =================

    function test_unauth_strangerCannotTradeClaimClose() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(E.Unauthorized.selector, stranger));
        desk.trade(_buy(BTC, 10, 500));
        vm.expectRevert(abi.encodeWithSelector(E.Unauthorized.selector, stranger));
        desk.claim();
        vm.expectRevert(abi.encodeWithSelector(E.Unauthorized.selector, stranger));
        desk.close();
        vm.expectRevert(abi.encodeWithSelector(E.Unauthorized.selector, stranger));
        desk.activate(1);
        vm.stopPrank();
    }

    function test_unauth_poolMoneyPathsRequireRegisteredDesk() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(E.UnknownDesk.selector, stranger));
        pool.fundDesk(stranger, 1e6);
        vm.expectRevert(abi.encodeWithSelector(E.UnknownDesk.selector, stranger));
        pool.settleDesk(0, 0, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(E.UnknownDesk.selector, stranger));
        pool.recordExposure(BTC, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(E.UnknownDesk.selector, stranger));
        pool.releaseExposure(BTC, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(E.UnknownDesk.selector, stranger));
        pool.receiveIncome(0, 0);
        vm.expectRevert(abi.encodeWithSelector(E.Unauthorized.selector, stranger));
        pool.registerDesk(stranger);
        vm.stopPrank();
    }

    function test_unauth_deskCannotDrawCreditForAnotherDesk() public {
        Desk other = _openDesk(traderB, demoCohort, STAKE);
        vm.prank(address(desk));
        vm.expectRevert(abi.encodeWithSelector(E.Unauthorized.selector, address(desk)));
        pool.fundDesk(address(other), 1e6);
    }

    function test_unauth_deskCannotUnderReportExposure() public {
        _trade(desk, _buy(BTC, 1_000, 500));
        uint256 g = pool.deskExposure(address(desk), BTC);
        vm.prank(address(desk));
        vm.expectRevert(E.SettlementMismatch.selector);
        pool.recordExposure(BTC, g - 1, g);
    }

    function test_unauth_operatorCannotMoveFunds() public {
        // The operator has no function that transfers desk or pool assets; its powers
        // are pause, caps (timelocked increases), treasury and cohort registration.
        vm.startPrank(operator);
        vm.expectRevert(abi.encodeWithSelector(E.InvalidParams.selector, 1));
        pool.setFactory(stranger); // factory wiring is one-shot
        vm.stopPrank();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.addCohort(_standardCohort());
    }

    function test_lp_cannotWithdrawDeployedPrincipal() public {
        uint256 idle = pool.idleAssets();
        assertEq(pool.maxWithdraw(lp), idle);
        vm.prank(lp);
        vm.expectRevert();
        pool.withdraw(idle + 1, lp, lp);
        vm.prank(lp);
        pool.withdraw(idle, lp, lp);
        assertEq(pool.idleAssets(), 0);
        assertEq(pool.deployedPrincipal(), 4 * STAKE);
    }

    // ================= malicious relayer (EIP-712) =================

    function test_relay_validSignedOrderExecutesOnce() public {
        Order memory o = _buy(BTC, 100, 500);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _signTrade(desk, traderAKey, o, 1, dl);
        vm.prank(stranger); // any relayer address
        desk.tradeWithSig(o, 1, dl, sig);
        assertEq(_lots(desk, BTC), 100);
        assertEq(desk.lastNonce(), 1);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(E.NonceInvalid.selector, 1, 1));
        desk.tradeWithSig(o, 1, dl, sig);
        assertEq(_lots(desk, BTC), 100, "executed at most once");
    }

    function test_relay_lowerNonceRejected() public {
        Order memory o = _buy(BTC, 10, 500);
        uint256 dl = block.timestamp + 60;
        desk.tradeWithSig(o, 5, dl, _signTrade(desk, traderAKey, o, 5, dl));
        bytes memory s4 = _signTrade(desk, traderAKey, o, 4, dl);
        vm.expectRevert(abi.encodeWithSelector(E.NonceInvalid.selector, 4, 5));
        desk.tradeWithSig(o, 4, dl, s4);
    }

    function test_relay_expiredDeadlineRejected() public {
        Order memory o = _buy(BTC, 10, 500);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _signTrade(desk, traderAKey, o, 1, dl);
        vm.warp(dl + 1);
        vm.expectRevert(abi.encodeWithSelector(E.DeadlineExpired.selector, dl, dl + 1));
        desk.tradeWithSig(o, 1, dl, sig);
    }

    function test_relay_alteredFieldsRejected() public {
        Order memory o = _buy(BTC, 10, 500);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _signTrade(desk, traderAKey, o, 1, dl);
        Order[6] memory tampered;
        for (uint256 i; i < 6; i++) {
            tampered[i] = o;
        }
        tampered[0].lots = 11;
        tampered[1].priceLimit = o.priceLimit - 1;
        tampered[2].leverage = 400;
        tampered[3].side = 1;
        tampered[4].reduceOnly = true;
        tampered[5].fillOrKill = true;
        for (uint256 i; i < 6; i++) {
            vm.expectRevert(E.InvalidSignature.selector);
            desk.tradeWithSig(tampered[i], 1, dl, sig);
        }
        vm.expectRevert(E.InvalidSignature.selector);
        desk.tradeWithSig(o, 1, dl + 1, sig); // altered deadline
        vm.expectRevert(E.InvalidSignature.selector);
        desk.tradeWithSig(o, 2, dl, sig); // altered nonce
    }

    function test_relay_wrongSignerRejected() public {
        Order memory o = _buy(BTC, 10, 500);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _signTrade(desk, traderBKey, o, 1, dl);
        vm.expectRevert(E.InvalidSignature.selector);
        desk.tradeWithSig(o, 1, dl, sig);
    }

    function test_relay_signatureForAnotherDeskRejected() public {
        Desk second = _openDesk(traderA, standardCohort, STAKE); // same trader, other desk
        Order memory o = _buy(BTC, 10, 500);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _signTrade(second, traderAKey, o, 1, dl);
        vm.expectRevert(E.InvalidSignature.selector);
        desk.tradeWithSig(o, 1, dl, sig);
    }

    function test_relay_malleableHighSRejected() public {
        Order memory o = _buy(BTC, 10, 500);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _signTrade(desk, traderAKey, o, 1, dl);
        bytes32 r = _word(sig, 0);
        bytes32 s = _word(sig, 32);
        uint8 v = uint8(sig[64]);
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 sHigh = bytes32(n - uint256(s));
        uint8 vFlip = v == 27 ? 28 : 27;
        vm.expectRevert(E.InvalidSignature.selector);
        desk.tradeWithSig(o, 1, dl, abi.encodePacked(r, sHigh, vFlip));
    }

    function _word(bytes memory b, uint256 off) internal pure returns (bytes32 w) {
        assembly {
            w := mload(add(add(b, 0x20), off))
        }
    }

    function test_relay_signedOrderStillPolicyChecked() public {
        Order memory o = _buy(BTC, 10, 600); // the trader signed 6x
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _signTrade(desk, traderAKey, o, 1, dl);
        vm.expectRevert(abi.encodeWithSelector(E.LeverageExceeded.selector, 600, 500));
        desk.tradeWithSig(o, 1, dl, sig);
        assertEq(desk.lastNonce(), 0, "rejected order does not burn the nonce");
    }

    // ================= malicious trader: off-market self-trade (PRD attack table) =================

    function test_attack_offMarketCloseIntoAccompliceBidRefused() public {
        _trade(desk, _buy(BTC, 1_000, 500));
        // accomplice rests a bid 2% under mark to buy the desk's long cheaply
        _fund(traderB, 10_000e6);
        vm.startPrank(traderB);
        usd.approve(address(ex), type(uint256).max);
        ex.createAccount(5_000e6);
        vm.stopPrank();
        Order memory c = _closeLong(BTC, 1_000);
        c.priceLimit = BTC_MID * 98 / 100;
        vm.prank(traderA);
        vm.expectRevert(abi.encodeWithSelector(E.PriceOutsideBand.selector, c.priceLimit, btcMark, 50));
        desk.trade(c);
    }

    // ================= malicious keeper =================

    function test_keeper_cannotGraduateIneligibleOrEnforceHealthy() public {
        Desk fresh = _openDesk(traderB, demoCohort, STAKE);
        vm.startPrank(keeper);
        vm.expectRevert(abi.encodeWithSelector(E.GraduationNotEligible.selector, 1));
        fresh.graduate();
        vm.expectRevert(E.DeskHealthy.selector);
        fresh.enforce();
        vm.expectRevert(E.DeskHealthy.selector);
        desk.enforce();
        vm.stopPrank();
    }

    // ================= exposure caps (invariants 28, 29) =================

    function test_caps_grossCapAcrossDesksCannotBeBypassed() public {
        Desk b = _openDesk(traderB, demoCohort, STAKE);
        _profitableRoundTrip(b, 400, 100);
        _profitableRoundTrip(b, 400, 100);
        b.graduate();
        vm.prank(operator);
        pool.setGrossCap(BTC, 3_000e6); // decrease: immediate
        _trade(desk, _buy(BTC, 2_000, 500)); // within desk A's own 2,500 notional cap
        uint256 used = pool.grossExposure(BTC);
        assertGt(used, 1_900e6);
        // Desk B's order would cross the shared cap: refused before Perpl sees it.
        vm.expectCall(address(ex), abi.encodeWithSelector(IPerplExchange.execOrder.selector), 0);
        vm.prank(traderB);
        vm.expectPartialRevert(E.ExposureCapReached.selector);
        b.trade(_buy(BTC, 1_000, 500));
    }

    function test_caps_perDeskNotionalCap() public {
        vm.prank(operator);
        pool.setDeskNotionalCap(1_000e6);
        vm.expectCall(address(ex), abi.encodeWithSelector(IPerplExchange.execOrder.selector), 0);
        vm.prank(traderA);
        vm.expectPartialRevert(E.DeskNotionalCapReached.selector);
        desk.trade(_buy(BTC, 1_200, 500));
    }

    function test_caps_reductionAlwaysPossibleEvenOverCap() public {
        _trade(desk, _buy(BTC, 2_000, 500));
        vm.prank(operator);
        pool.setGrossCap(BTC, 100e6); // operator lowers cap far below current exposure
        _moveBtc(btcMark * 10_030 / 10_000); // mark rises: reduced notional can exceed the old record
        _trade(desk, _closeLong(BTC, 500));
        assertEq(_lots(desk, BTC), 1_500);
        vm.prank(traderA);
        vm.expectPartialRevert(E.ExposureCapReached.selector);
        desk.trade(_buy(BTC, 10, 500));
    }

    function test_caps_increaseIsTimelocked() public {
        vm.prank(operator);
        pool.setGrossCap(BTC, 1_000_000e6);
        (, uint256 readyAt) = pool.pendingGrossCap(BTC);
        vm.expectRevert(abi.encodeWithSelector(E.TimelockNotReady.selector, readyAt));
        pool.applyGrossCap(BTC);
        assertEq(pool.grossCap(BTC), 50_000e6);
    }

    function test_caps_bootstrapImmediateOnlyBeforeFactoryWiring() public {
        ImprestPool p2 = new ImprestPool(IERC20(address(usd)), operator, treasury, 1 days);
        vm.startPrank(operator);
        p2.setGrossCap(BTC, 1_000e6); // before wiring: immediate
        assertEq(p2.grossCap(BTC), 1_000e6);
        p2.setFactory(address(factory));
        p2.setGrossCap(BTC, 2_000e6); // after wiring: queued
        vm.stopPrank();
        assertEq(p2.grossCap(BTC), 1_000e6);
    }

    function test_caps_evaluationDesksDoNotTouchPoolExposure() public {
        Desk ev = _openDesk(traderB, demoCohort, STAKE);
        _trade(ev, _buy(BTC, 400, 500));
        assertEq(pool.deskGross(address(ev)), 0);
    }

    // ================= venue failures (invariants 33, 34) =================

    function test_venue_perplErrorsSurfaceNamed() public {
        _cancelAll();
        Order memory o = _buy(BTC, 100, 500);
        o.fillOrKill = true;
        vm.prank(traderA);
        vm.expectPartialRevert(bytes4(keccak256("UnmatchedLotRemainsInFillOrKill(uint256,uint256,uint256)")));
        desk.trade(o);
    }

    function test_venue_haltedExchangeBlocksTradingButEnforceStatePersists() public {
        _trade(desk, _buy(BTC, 2_400, 500));
        _moveBtc(btcMark * 97 / 100); // breach
        vm.prank(perplOwner);
        ex.setExchangeHalted(true);
        vm.prank(traderA);
        vm.expectRevert();
        desk.trade(_closeLong(BTC, 10));
        // enforce cannot close on a halted venue; it records Enforcing instead of
        // reverting or pretending, and pays nothing
        vm.prank(keeper);
        desk.enforce();
        assertEq(uint8(desk.status()), uint8(DeskStatus.Enforcing));
        assertEq(usd.balanceOf(keeper), 0);
        vm.prank(perplOwner);
        ex.setExchangeHalted(false);
        _requote();
        vm.prank(keeper);
        desk.enforce();
        assertEq(uint8(desk.status()), uint8(DeskStatus.Closed));
    }
}
