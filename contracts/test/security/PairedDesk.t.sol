// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ImprestFixture} from "../ImprestFixture.sol";
import {Desk} from "../../src/Desk.sol";
import {Order, DeskStatus} from "../../src/libraries/ImprestTypes.sol";

/// @notice PRD Phase 14 / invariant 12: paired opposite desks run by ONE economic actor,
///         scored jointly (winner payout + loser breach). This is a self-attack on the
///         pool. Results are a LOCAL_REPRODUCTION scenario envelope against Perpl's own
///         bytecode, not a universal loss bound. Each scenario writes
///         proof/experiments/paired-desk/<scenario>.json.
contract PairedDeskTest is ImprestFixture {
    struct Run {
        string name;
        uint256 deskCap;
        uint256 lots;
        int256 movePathBps; // total move applied to BTC
        uint256 steps; //       move applied in this many equal steps
        bool enforceEachStep; // keeper reacts after every step (else only at the end)
    }

    struct Result {
        uint256 stakes;
        uint256 evalProfitIn; //   equity above stake at graduation, already the actor's
        uint256 received; //       everything both desks paid the actor
        uint256 principalLoss;
        uint256 feesCollected;
        uint256 feesWrittenOff;
        uint256 keeperPaid;
        uint256 protocolShare;
        uint256 poolProfitShare;
        uint256 grossFundedExposure;
        uint256 loserStatus;
        uint256 winnerStatus;
    }

    address actor; // one human, two passkey EOAs
    address actor2;

    function _pairedRun(Run memory r) internal returns (Result memory res) {
        vm.prank(operator);
        pool.setDeskNotionalCap(r.deskCap);
        actor = traderA;
        actor2 = traderB;
        Desk a = _openDesk(actor, demoCohort, STAKE);
        Desk b = _openDesk(actor2, demoCohort, STAKE);
        res.stakes = 2 * STAKE;
        uint256 balBefore = usd.balanceOf(actor) + usd.balanceOf(actor2) + 2 * STAKE;

        // Both graduate (simultaneous graduation is allowed: the pool cap is the guard).
        _profitableRoundTrip(a, 400, 100);
        _profitableRoundTrip(a, 400, 100);
        _profitableRoundTrip(b, 400, 100);
        _profitableRoundTrip(b, 400, 100);
        a.graduate();
        b.graduate();
        res.evalProfitIn = (a.startEquity() - 4 * STAKE - STAKE) + (b.startEquity() - 4 * STAKE - STAKE);

        // A long, B short, same size.
        _trade(a, _buy(BTC, r.lots, 500));
        Order memory s = _sell(BTC, r.lots, 500);
        _trade(b, s);
        res.grossFundedExposure = pool.grossExposure(BTC);

        // Price path.
        int256 stepBps = r.movePathBps / int256(r.steps);
        for (uint256 i; i < r.steps; i++) {
            int256 m = int256(btcMark) + int256(btcMark) * stepBps / 10_000;
            _moveBtc(uint256(m));
            if (r.enforceEachStep) {
                _tryEnforce(a);
                _tryEnforce(b);
            }
        }
        _tryEnforce(a);
        _tryEnforce(b);

        // Winner flattens and claims, then closes; anything still active closes.
        _flattenClaimClose(a);
        _flattenClaimClose(b);

        res.received = usd.balanceOf(actor) + usd.balanceOf(actor2) + 2 * STAKE - balBefore + 0;
        res.received = usd.balanceOf(actor) + usd.balanceOf(actor2) - (balBefore - 2 * STAKE);
        res.principalLoss = pool.totalPrincipalLoss();
        res.feesCollected = pool.totalFeesCollected();
        res.feesWrittenOff = pool.totalFeesWrittenOff();
        res.keeperPaid = usd.balanceOf(keeper);
        res.protocolShare = usd.balanceOf(treasury);
        res.poolProfitShare = pool.totalProfitShare();
        res.winnerStatus = uint256(r.movePathBps >= 0 ? a.status() : b.status());
        res.loserStatus = uint256(r.movePathBps >= 0 ? b.status() : a.status());
        _write(r, res);
    }

    function _tryEnforce(Desk d) internal {
        vm.prank(keeper);
        try d.enforce() {} catch {}
    }

    function _flattenClaimClose(Desk d) internal {
        if (d.status() != DeskStatus.Active) return;
        uint256 l = _lots(d, BTC);
        if (l > 0) {
            (bool longPos) = _isLong(d);
            _trade(d, longPos ? _closeLong(BTC, l) : _closeShort(BTC, l));
        }
        vm.startPrank(d.trader());
        try d.claim() {} catch {}
        d.close();
        vm.stopPrank();
    }

    function _isLong(Desk d) internal view returns (bool) {
        (bool ok, bytes memory data) = address(ex).staticcall(
            abi.encodeWithSignature("getPosition(uint256,uint256)", BTC, d.accountId())
        );
        require(ok);
        (,,, uint8 positionType) = abi.decode(data, (uint256, uint256, uint256, uint8));
        return positionType == 0;
    }

    function _write(Run memory r, Result memory res) internal {
        string memory k = r.name;
        vm.serializeString(k, "scenario", r.name);
        vm.serializeString(k, "status", "LOCAL_REPRODUCTION");
        vm.serializeString(k, "harness", "Perpl exchange bytecode rc_v1.1.7-203 on Foundry EVM (code size limit 131072)");
        vm.serializeUint(k, "desk_notional_cap_base_units", r.deskCap);
        vm.serializeUint(k, "lots_each_side", r.lots);
        vm.serializeInt(k, "total_move_bps", r.movePathBps);
        vm.serializeUint(k, "steps", r.steps);
        vm.serializeBool(k, "keeper_enforces_each_step", r.enforceEachStep);
        vm.serializeUint(k, "trader_stakes", res.stakes);
        vm.serializeUint(k, "eval_profit_already_owned", res.evalProfitIn);
        vm.serializeUint(k, "actor_received_total", res.received);
        vm.serializeInt(k, "actor_net_extraction", int256(res.received) - int256(res.stakes));
        vm.serializeUint(k, "pool_principal_loss", res.principalLoss);
        vm.serializeUint(k, "pool_fees_collected", res.feesCollected);
        vm.serializeUint(k, "pool_fees_written_off", res.feesWrittenOff);
        vm.serializeUint(k, "pool_profit_share", res.poolProfitShare);
        vm.serializeInt(
            k,
            "pool_net_result",
            int256(res.feesCollected + res.poolProfitShare) - int256(res.principalLoss)
        );
        vm.serializeUint(k, "keeper_paid", res.keeperPaid);
        vm.serializeUint(k, "protocol_share", res.protocolShare);
        vm.serializeUint(k, "gross_funded_exposure_btc", res.grossFundedExposure);
        vm.serializeUint(k, "winner_final_status", res.winnerStatus);
        string memory json = vm.serializeUint(k, "loser_final_status", res.loserStatus);
        vm.writeJson(json, string.concat("../proof/experiments/paired-desk/", r.name, ".json"));
    }

    // ---------------- scenarios ----------------

    function test_paired_calm() public {
        Result memory r = _pairedRun(Run("calm_cap2500", 2_500e6, 2_000, 50, 2, true));
        assertEq(r.principalLoss, 0);
    }

    function test_paired_trend_keeperEachStep() public {
        _pairedRun(Run("trend3pct_atomic_keeper_cap2500", 2_500e6, 2_000, 300, 12, true));
    }

    function test_paired_trend_delayedKeeper() public {
        _pairedRun(Run("trend3pct_delayed_keeper_cap2500", 2_500e6, 2_000, 300, 12, false));
    }

    function test_paired_gap8_cap2500() public {
        _pairedRun(Run("gap8pct_cap2500", 2_500e6, 2_000, 800, 1, true));
    }

    function test_paired_gap15_cap2500() public {
        _pairedRun(Run("gap15pct_cap2500", 2_500e6, 2_000, 1_500, 1, true));
    }

    function test_paired_gap15_cap1500() public {
        _pairedRun(Run("gap15pct_cap1500", 1_500e6, 1_200, 1_500, 1, true));
    }

    function test_paired_gap15_cap1000() public {
        _pairedRun(Run("gap15pct_cap1000", 1_000e6, 800, 1_500, 1, true));
    }

    function test_paired_gapDown15_cap2500() public {
        _pairedRun(Run("gapdown15pct_cap2500", 2_500e6, 2_000, -1_500, 1, true));
    }
}
