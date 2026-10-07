// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ImprestFixture} from "../ImprestFixture.sol";
import {Desk} from "../../src/Desk.sol";
import {DeskStatus} from "../../src/libraries/ImprestTypes.sol";

/// @notice Generates input/output vectors from REAL desk executions (Perpl bytecode) for
///         the independent Python reference model (proof/reference_model). The model
///         recomputes outputs from inputs with its own code; any mismatch fails the gate.
contract ReferenceVectorsTest is ImprestFixture {

    struct Interval {
        uint256 elapsed;
        bool exposed;
    }

    string internal accrualJson = "[";
    string internal claimJson = "[";
    string internal settleJson = "[";
    uint256 internal nA;
    uint256 internal nC;
    uint256 internal nS;

    function _sep(uint256 n) internal pure returns (string memory) {
        return n == 0 ? "" : ",";
    }

    function _graduated(address t) internal returns (Desk d) {
        d = _openDesk(t, demoCohort, STAKE);
        _profitableRoundTrip(d, 400, 100);
        _profitableRoundTrip(d, 400, 100);
        d.graduate();
    }

    /// Fee accrual over an exposure schedule driven by real trades and checkpoints.
    function _accrualCase(uint256 seed) internal {
        address t = address(uint160(0xF00D00 + seed));
        _fund(t, 1_000e6);
        Desk d = _graduated(t);
        string memory steps = "[";
        uint256 n;
        uint256 borrowed = d.borrowed();
        for (uint256 i; i < 6; i++) {
            uint256 h = uint256(keccak256(abi.encode(seed, i)));
            uint256 elapsed = 1 + (h % 3 days);
            bool openNext = (h >> 128) % 2 == 0;
            // exposure truth from the venue, not from the desk's own flag
            bool wasExposed = _lots(d, BTC) > 0 || _lots(d, ETH) > 0;
            _advance(elapsed);
            if (openNext && _lots(d, BTC) == 0) _trade(d, _buy(BTC, 500, 500));
            else if (!openNext && _lots(d, BTC) > 0) _trade(d, _closeLong(BTC, _lots(d, BTC)));
            else d.checkpoint();
            // the interval just charged was [prev, now) at the PREVIOUS flag; _advance adds
            // exactly `elapsed` seconds, and checkpoints happen in the same block
            steps = string.concat(steps, _sep(n), "{\"elapsed\":", vm.toString(elapsed), ",\"exposed\":", wasExposed ? "true" : "false", "}");
            n++;
        }
        steps = string.concat(steps, "]");
        accrualJson = string.concat(
            accrualJson,
            _sep(nA),
            "{\"case\":",
            vm.toString(seed),
            ",\"borrowed\":",
            vm.toString(borrowed),
            ",\"rate_ppm_per_day\":500,\"fee_cap\":",
            vm.toString(d.originalStake() * 2_500 / 10_000),
            ",\"steps\":",
            steps,
            ",\"contract_fee_accrued\":",
            vm.toString(d.feeAccrued()),
            "}"
        );
        nA++;
    }

    /// Claim split observed through actual token transfers.
    function _claimCase(uint256 seed) internal {
        address t = address(uint160(0xC1A100 + seed));
        _fund(t, 1_000e6);
        Desk d = _graduated(t);
        uint256 h = uint256(keccak256(abi.encode("claim", seed)));
        _trade(d, _buy(BTC, 600 + h % 1_800, 500));
        _advance(1 hours + h % 4 days);
        _moveBtc(btcMark + btcMark * (20 + h % 120) / 10_000);
        _trade(d, _closeLong(BTC, _lots(d, BTC)));
        (int256 eq,) = d.equity();
        uint256 hwm = d.hwm();
        uint256 fees = d.feeOutstanding();
        uint256 trBefore = usd.balanceOf(t);
        uint256 tsBefore = usd.balanceOf(treasury);
        uint256 poolFeesBefore = pool.totalFeesCollected();
        uint256 poolShareBefore = pool.totalProfitShare();
        vm.prank(t);
        d.claim();
        claimJson = string.concat(
            claimJson,
            _sep(nC),
            "{\"case\":", vm.toString(seed),
            ",\"flat_equity\":", vm.toString(uint256(eq)),
            ",\"hwm\":", vm.toString(hwm),
            ",\"fee_outstanding\":", vm.toString(fees),
            ",\"trader_bps\":8000,\"protocol_bps\":500",
            ",\"observed\":{\"trader\":", vm.toString(usd.balanceOf(t) - trBefore),
            ",\"protocol\":", vm.toString(usd.balanceOf(treasury) - tsBefore),
            ",\"pool_fees\":", vm.toString(pool.totalFeesCollected() - poolFeesBefore),
            ",\"pool_share\":", vm.toString(pool.totalProfitShare() - poolShareBefore),
            "}}"
        );
        nC++;
    }

    /// Breach settlement observed through actual transfers.
    function _settleCase(uint256 seed) internal {
        address t = address(uint160(0x5E7700 + seed));
        _fund(t, 1_000e6);
        Desk d = _graduated(t);
        uint256 h = uint256(keccak256(abi.encode("settle", seed)));
        _trade(d, _buy(BTC, 2_000 + h % 400, 500));
        _advance(1 hours + h % 3 days);
        _moveBtc(btcMark - btcMark * (300 + h % 400) / 10_000); // -3%..-7%
        uint256 b = d.borrowed();
        uint256 kBefore = usd.balanceOf(keeper);
        uint256 tBefore = usd.balanceOf(t);
        uint256 idleBefore = pool.idleAssets();
        uint256 lossBefore = pool.totalPrincipalLoss();
        uint256 woBefore = pool.totalFeesWrittenOff();
        vm.recordLogs();
        vm.prank(keeper);
        d.enforce();
        if (d.status() != DeskStatus.Closed) return;
        // E as recovered: everything that left the desk at settlement
        uint256 kPaid = usd.balanceOf(keeper) - kBefore;
        uint256 tPaid = usd.balanceOf(t) - tBefore;
        uint256 poolIn = pool.idleAssets() - idleBefore;
        uint256 e = kPaid + tPaid + poolIn;
        settleJson = string.concat(
            settleJson,
            _sep(nS),
            "{\"case\":", vm.toString(seed),
            ",\"recoverable_equity\":", vm.toString(e),
            ",\"borrowed\":", vm.toString(b),
            // no claims precede these settlements, so the liability at settlement is
            // every fee accrued, including the accrual enforce() checkpointed itself
            ",\"fee_outstanding\":", vm.toString(d.feeAccrued()),
            ",\"bounty\":500000",
            ",\"observed\":{\"pool_in\":", vm.toString(poolIn),
            ",\"keeper\":", vm.toString(kPaid),
            ",\"trader\":", vm.toString(tPaid),
            ",\"principal_loss\":", vm.toString(pool.totalPrincipalLoss() - lossBefore),
            ",\"fees_written_off\":", vm.toString(pool.totalFeesWrittenOff() - woBefore),
            ",\"fees_collected\":", vm.toString(d.feeCollected()),
            "}}"
        );
        nS++;
    }

    string constant DIR = "../proof/reference_model/vectors/";

    function test_vectors_accrual() public {
        for (uint256 i; i < 6; i++) {
            _accrualCase(i);
        }
        vm.writeFile(string.concat(DIR, "accrual.json"), string.concat(accrualJson, "]"));
    }

    function test_vectors_claims() public {
        for (uint256 i; i < 6; i++) {
            _claimCase(i);
        }
        vm.writeFile(string.concat(DIR, "claims.json"), string.concat(claimJson, "]"));
    }

    function test_vectors_settlements() public {
        for (uint256 i; i < 6; i++) {
            _settleCase(i);
        }
        assertGt(nS, 0);
        vm.writeFile(string.concat(DIR, "settlements.json"), string.concat(settleJson, "]"));
    }
}
