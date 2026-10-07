// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PerplHarness} from "./PerplHarness.sol";
import {IPerplExchange} from "../../src/interfaces/IPerplExchange.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev A bare contract that owns a Perpl account, used to probe venue semantics
///      before the Desk relies on them.
contract ProbeAccount {
    IPerplExchange public ex;
    uint256 public descId;

    constructor(IPerplExchange ex_) {
        ex = ex_;
    }

    function open(IERC20 token, uint256 amount) external returns (uint256) {
        token.approve(address(ex), amount);
        return ex.createAccount(amount);
    }

    function order(uint256 perpId, uint8 orderType, uint256 price, uint256 lots, uint256 lev, uint256 negPnlBps, bool fok)
        external
    {
        IPerplExchange.OrderDesc memory d;
        d.orderDescId = ++descId;
        d.perpId = perpId;
        d.orderType = orderType;
        d.pricePNS = price;
        d.lotLNS = lots;
        d.fillOrKill = fok;
        d.immediateOrCancel = !fok;
        d.leverageHdths = lev;
        d.lastExecutionBlock = block.number + 2;
        d.maxNegPnlCollatBPS = negPnlBps;
        ex.execOrder(d);
    }

    function withdraw(uint256 amount) external {
        ex.withdrawCollateral(amount);
    }
}

/// @notice Records the Perpl venue semantics Imprest depends on. Each test is a
///         LOCAL_REPRODUCTION against Perpl's own exchange bytecode.
contract PerplProbeTest is PerplHarness {
    ProbeAccount probe;

    function setUp() public {
        _setUpPerpl();
        _seedBook(BTC, 1_000_000, 50, 200_000, 10); // asks 100,005.0.. ; 2 BTC per level
        probe = new ProbeAccount(ex);
        _fund(address(probe), 1_000e6);
        probe.open(usd, 1_000e6);
    }

    function _pos() internal view returns (IPerplExchange.PositionInfo memory p, uint256 mark, bool valid) {
        uint256 id = ex.getAccountByAddr(address(probe)).accountId;
        return ex.getPosition(BTC, id);
    }

    function test_probe_contractOwnedAccountOpensAndTrades() public {
        IPerplExchange.AccountInfo memory a = ex.getAccountByAddr(address(probe));
        assertEq(a.accountAddr, address(probe));
        assertEq(a.balanceCNS, 1_000e6);
        // Buy 0.01 BTC (1,000 LNS) IOC at a limit 0.1% above mark, 5x.
        probe.order(BTC, 0, 1_001_000, 1_000, 500, 50, false);
        (IPerplExchange.PositionInfo memory p, uint256 mark, bool valid) = _pos();
        assertEq(p.lotLNS, 1_000, "filled");
        assertEq(p.positionType, 0, "long");
        assertTrue(valid);
        assertEq(mark, 1_000_000);
        emit log_named_uint("entry pricePNS", p.pricePNS);
        emit log_named_uint("depositCNS", p.depositCNS);
        emit log_named_int("deltaPnlCNS@mark", p.deltaPnlCNS);
        emit log_named_int("pnlCNS", p.pnlCNS);
        emit log_named_uint("account balance after open", ex.getAccountByAddr(address(probe)).balanceCNS);
    }

    function test_probe_deltaPnlTracksMark() public {
        probe.order(BTC, 0, 1_001_000, 1_000, 500, 50, false);
        (IPerplExchange.PositionInfo memory p0,,) = _pos();
        _setMark(BTC, 1_010_000); // +1%
        (IPerplExchange.PositionInfo memory p1, uint256 mark,) = _pos();
        assertEq(mark, 1_010_000);
        emit log_named_int("deltaPnl before", p0.deltaPnlCNS);
        emit log_named_int("deltaPnl after +1% mark", p1.deltaPnlCNS);
        // 0.01 BTC * (101,000 - entry) ~= +10 USD - spread; must reflect the new mark
        assertGt(p1.deltaPnlCNS, p0.deltaPnlCNS + 9e6);
    }

    function test_probe_markGoesStaleAfterMaxAge() public {
        probe.order(BTC, 0, 1_001_000, 1_000, 500, 50, false);
        (,, bool v0) = _pos();
        assertTrue(v0);
        vm.warp(block.timestamp + 3_600);
        vm.roll(block.number + 9_000);
        (,, bool v1) = _pos();
        emit log_named_string("markValid after 1h without update", v1 ? "true" : "false");
        assertFalse(v1, "mark should be invalid after max age");
    }

    function test_probe_closeAndWithdrawEverything() public {
        probe.order(BTC, 0, 1_001_000, 1_000, 500, 50, false);
        // close long: CloseLong (2) sell IOC at a limit 0.1% below mark
        probe.order(BTC, 2, 999_000, 1_000, 500, 50, false);
        (IPerplExchange.PositionInfo memory p,,) = _pos();
        assertEq(p.lotLNS, 0, "flat");
        uint256 bal = ex.getAccountByAddr(address(probe)).balanceCNS;
        emit log_named_uint("balance after round trip", bal);
        probe.withdraw(bal);
        assertEq(usd.balanceOf(address(probe)), bal, "full withdrawal");
        assertEq(ex.getAccountByAddr(address(probe)).balanceCNS, 0);
    }

    function test_probe_maxNegPnlRejectsOffMarketOpen() public {
        // Opening buy that would fill 1% above mark with a 50 bps negative-PnL cap.
        _setMark(BTC, 990_000); // asks rest at 100,005+, i.e. ~1% above the new mark
        vm.expectRevert();
        probe.order(BTC, 0, 1_002_000, 1_000, 500, 50, true);
    }

    function test_probe_iocNoLiquidityDoesNotRevert() public {
        // Buy with a limit below every ask: IOC should simply not fill.
        probe.order(BTC, 0, 999_000, 1_000, 500, 50, false);
        (IPerplExchange.PositionInfo memory p,,) = _pos();
        assertEq(p.lotLNS, 0);
    }

    function test_probe_fokNoLiquidityReverts() public {
        vm.expectRevert();
        probe.order(BTC, 0, 999_000, 1_000, 500, 50, true);
    }

    /// Observation (2026-10-07): Perpl rc_v1.1.7-203 does NOT revert an order with
    /// leverageHdths=2000 on a listing whose initial-margin multiple is 1500; it fills
    /// and clamps the posted deposit to the listing maximum (notional / 15). The venue
    /// therefore never enforces a desk-specific 5x cap: the Desk's leverage check is
    /// load-bearing.
    function test_probe_venueClampsLeverageAboveListing() public {
        probe.order(BTC, 0, 1_001_000, 1_000, 2_000, 50, false);
        (IPerplExchange.PositionInfo memory p,,) = _pos();
        emit log_named_uint("lots filled at requested 20x", p.lotLNS);
        emit log_named_uint("depositCNS at requested 20x", p.depositCNS);
        assertEq(p.lotLNS, 1_000);
        // notional 1,000.05 / 15 = 66.67; deposit is clamped to the listing's 15x, not 20x (50.00)
        assertGt(p.depositCNS, 66e6);
        assertLt(p.depositCNS, 67e6);
    }
}
