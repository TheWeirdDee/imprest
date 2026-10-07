// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ImprestPool} from "../../src/ImprestPool.sol";
import {DeskFactory} from "../../src/DeskFactory.sol";
import {Desk} from "../../src/Desk.sol";
import {IPerplExchange} from "../../src/interfaces/IPerplExchange.sol";
import {Order, Market, TierParams, CohortParams, ImprestErrors as E} from "../../src/libraries/ImprestTypes.sol";

interface IAgoraFaucet {
    function requestFunds(address receiver) external;
    function maxDripFrequency() external view returns (uint256);
}

/// @notice Runs Imprest against a FORK of live Monad testnet: Perpl's deployed exchange,
///         Agora's testnet AUSD and faucet, and the real testnet order book at the fork
///         block. Nothing is broadcast. Evidence label: SIMULATED (testnet fork), never
///         TESTNET_VERIFIED. Skipped unless FORK_TESTNET=true.
///
///   FORK_TESTNET=true forge test --match-contract TestnetFork -vv
contract TestnetForkTest is Test {
    IPerplExchange constant EX = IPerplExchange(0x1964C32f0bE608E7D29302AFF5E61268E72080cc);
    IERC20 constant AUSD = IERC20(0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC);
    IAgoraFaucet constant FAUCET = IAgoraFaucet(0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C);
    uint256 constant BTC = 16;

    ImprestPool pool;
    DeskFactory factory;
    address trader = makeAddr("forkTrader");
    address lp = makeAddr("forkLp");
    bool enabled;

    function setUp() public {
        enabled = vm.envOr("FORK_TESTNET", false);
        if (!enabled) return;
        vm.createSelectFork(vm.envOr("MONAD_TESTNET_RPC_URL", string("https://testnet-rpc.monad.xyz")));
        pool = new ImprestPool(AUSD, address(this), address(this), 1 days);
        pool.setGrossCap(BTC, 5_000e6);
        pool.setGrossCap(32, 5_000e6);
        pool.setDeskNotionalCap(1_000e6);
        factory = new DeskFactory(pool, EX, address(this));
        pool.setFactory(address(factory));
        Market[] memory m = new Market[](2);
        m[0] = Market(BTC, 1, 5);
        m[1] = Market(32, 2, 3);
        CohortParams memory c;
        c.name = "demo-v0";
        c.demo = true;
        c.minStake = 100e6;
        c.maxDrawdownBps = 600;
        c.dailyLossBps = 300;
        c.maxLeverageHdths = 500;
        c.priceBandBps = 50;
        c.maxNegPnlBps = 50;
        c.execBlockWindow = 2;
        c.enforceSliceBandBps = 100;
        c.feeCapBps = 2_500;
        c.keeperBounty = 0.5e6;
        c.tierCount = 2;
        c.tiers[0] = TierParams(1, 0, 10_000, 0, 0, 0, 0, 0);
        c.tiers[1] = TierParams(5, 500, 8_000, 500, 200, 2, 0, 0);
        c.markets = m;
        factory.addCohort(c);
        // Real faucet drips (respecting its global 60 s frequency on the fork clock).
        uint256 t0 = vm.getBlockTimestamp(); // not block.timestamp: via-IR may re-read it after warp
        FAUCET.requestFunds(trader);
        vm.warp(t0 + FAUCET.maxDripFrequency() + 1);
        FAUCET.requestFunds(lp);
        vm.warp(t0); // restore the fork clock so Perpl's 60 s mark stays valid
    }

    function test_fork_deskOpensRealPerplAccountAndPolicyHolds() public {
        if (!enabled) return;
        assertGe(AUSD.balanceOf(trader), 100e6, "faucet drip");
        vm.startPrank(lp);
        AUSD.approve(address(pool), type(uint256).max);
        pool.deposit(5_000e6, lp);
        vm.stopPrank();

        vm.startPrank(trader);
        AUSD.approve(address(factory), 100e6);
        Desk d = Desk(factory.openDesk(100e6, 0));
        vm.stopPrank();
        IPerplExchange.AccountInfo memory a = EX.getAccountByAddr(address(d));
        assertEq(a.accountAddr, address(d), "desk owns a real Perpl testnet account");
        assertEq(a.balanceCNS, 100e6);

        (, uint256 mark, bool valid) = EX.getPosition(BTC, d.accountId());
        emit log_named_uint("live testnet BTC mark (PNS)", mark);
        emit log_named_string("mark valid at fork block", valid ? "true" : "false");
        IPerplExchange.PerpetualInfo memory pi = EX.getPerpetualInfo(BTC);
        emit log_named_uint("fork block.timestamp", block.timestamp);
        emit log_named_uint("fork block.number", block.number);
        emit log_named_uint("perp markTimestamp", pi.markTimestamp);
        emit log_named_uint("perp oracleTimestampSec", pi.oracleTimestampSec);

        // Contract-level refusal of an over-limit order, with no UI involved.
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(E.LeverageExceeded.selector, 600, 500));
        d.trade(Order(BTC, 0, mark, 100, 600, false, false));

        if (!valid) {
            emit log("mark not valid at fork block: new risk correctly refused; skipping fill");
            vm.prank(trader);
            vm.expectRevert(abi.encodeWithSelector(E.MarkStale.selector, BTC));
            d.trade(Order(BTC, 0, mark, 100, 500, false, false));
            return;
        }

        // IOC buy of 0.001 BTC at mark + 0.3% against the real testnet book.
        vm.prank(trader);
        d.trade(Order(BTC, 0, mark + mark * 30 / 10_000, 100, 500, false, false));
        (IPerplExchange.PositionInfo memory p,,) = EX.getPosition(BTC, d.accountId());
        emit log_named_uint("lots filled against live testnet book", p.lotLNS);
        (int256 eq,) = d.equity();
        emit log_named_int("desk equity after fill (base units)", eq);
        assertGe(eq, int256(d.floorEquity()));
        if (p.lotLNS > 0) {
            vm.prank(trader);
            d.trade(Order(BTC, 1, mark - mark * 30 / 10_000, p.lotLNS, 500, true, false));
            (IPerplExchange.PositionInfo memory p2,,) = EX.getPosition(BTC, d.accountId());
            emit log_named_uint("lots after reduce-only close", p2.lotLNS);
        }
    }
}
