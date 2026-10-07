// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PerplHarness} from "./perpl-harness/PerplHarness.sol";
import {IPerplExchange} from "../src/interfaces/IPerplExchange.sol";
import {ImprestPool} from "../src/ImprestPool.sol";
import {DeskFactory} from "../src/DeskFactory.sol";
import {Desk} from "../src/Desk.sol";
import {Order, Market, TierParams, CohortParams} from "../src/libraries/ImprestTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Full Imprest stack on top of Perpl's own exchange bytecode.
///         Prices: BTC mark 100,000.0 (PNS 1_000_000, 1 lot = 0.00001 BTC = 1 USD at mark)
///                 ETH mark   4,000.00 (PNS   400_000, 1 lot = 0.001 ETH  = 4 USD at mark)
abstract contract ImprestFixture is PerplHarness {
    ImprestPool internal pool;
    DeskFactory internal factory;

    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");
    address internal lp = makeAddr("lp");
    address internal traderA;
    uint256 internal traderAKey;
    address internal traderB;
    uint256 internal traderBKey;
    address internal keeper = makeAddr("keeper");
    address internal stranger = makeAddr("stranger");

    uint256 internal standardCohort;
    uint256 internal demoCohort;

    uint256 internal constant STAKE = 100e6; // local venue minimum account open is 100 USD
    uint256 internal constant LP_DEPOSIT = 100_000e6;
    uint256 internal constant BTC_MID = 1_000_000;
    uint256 internal constant ETH_MID = 400_000;

    struct Quote {
        uint256 perpId;
        uint256 orderId;
    }

    Quote[] internal quotes;

    function setUp() public virtual {
        _setUpPerpl();
        (traderA, traderAKey) = makeAddrAndKey("traderA");
        (traderB, traderBKey) = makeAddrAndKey("traderB");

        pool = new ImprestPool(IERC20(address(usd)), operator, treasury, 1 days);
        factory = new DeskFactory(pool, ex, operator);
        vm.startPrank(operator);
        pool.setFactory(address(factory));
        pool.setGrossCap(BTC, 0); // establish zero, then queue increases through the timelock
        vm.stopPrank();
        _setCapsNow(50_000e6, 50_000e6, 2_500e6);

        vm.startPrank(operator);
        standardCohort = factory.addCohort(_standardCohort());
        demoCohort = factory.addCohort(_demoCohort());
        vm.stopPrank();

        _fund(lp, LP_DEPOSIT);
        vm.startPrank(lp);
        usd.approve(address(pool), type(uint256).max);
        pool.deposit(LP_DEPOSIT, lp);
        vm.stopPrank();

        _fund(traderA, 1_000e6);
        _fund(traderB, 1_000e6);
        _requote();
    }

    function _setCapsNow(uint256 btcCap, uint256 ethCap, uint256 deskCap) internal {
        vm.startPrank(operator);
        pool.setGrossCap(BTC, btcCap);
        pool.setGrossCap(ETH, ethCap);
        pool.setDeskNotionalCap(deskCap);
        vm.stopPrank();
        uint256 t = vm.getBlockTimestamp(); // not block.timestamp: via-IR may re-read it after warp
        vm.warp(t + 1 days);
        pool.applyGrossCap(BTC);
        pool.applyGrossCap(ETH);
        pool.applyDeskNotionalCap();
        vm.warp(t); // keep marks fresh; caps are applied
    }

    function _markets() internal pure returns (Market[] memory m) {
        m = new Market[](2);
        m[0] = Market(BTC, uint8(BTC_PRICE_DEC), uint8(BTC_LOT_DEC));
        m[1] = Market(ETH, uint8(ETH_PRICE_DEC), uint8(ETH_LOT_DEC));
    }

    /// PRD v3 credit policy: Tier 0 evaluation, Tier 1 funded (5x), Tier 2 proven (10x).
    function _standardCohort() internal pure returns (CohortParams memory c) {
        c.name = "standard-v0";
        c.minStake = 20e6;
        c.maxDrawdownBps = 600;
        c.dailyLossBps = 300;
        c.maxLeverageHdths = 500;
        c.priceBandBps = 50;
        c.maxNegPnlBps = 50;
        c.execBlockWindow = 2;
        c.enforceSliceBandBps = 100;
        c.feeCapBps = 2_500;
        c.keeperBounty = 0.5e6;
        c.tierCount = 3;
        c.tiers[0] = TierParams(1, 0, 10_000, 0, 0, 0, 0, 0);
        c.tiers[1] = TierParams(5, 500, 8_000, 500, 800, 5, 1 days, 0);
        c.tiers[2] = TierParams(10, 300, 8_500, 375, 0, 0, 14 days, 1);
        c.markets = _markets();
    }

    /// PRD v3 labeled demo cohort: graduates at +2% after two trades, no time minimum.
    function _demoCohort() internal pure returns (CohortParams memory c) {
        c = _standardCohort();
        c.name = "demo-v0";
        c.demo = true;
        c.tiers[1] = TierParams(5, 500, 8_000, 500, 200, 2, 0, 0);
        c.tierCount = 2;
    }

    // ------------------------------------------------------------------
    // Market helpers
    // ------------------------------------------------------------------

    function _quote(uint256 perpId, uint8 orderType, uint256 pricePNS, uint256 lots) internal {
        IPerplExchange.OrderDesc memory d;
        d.orderDescId = ++makerDescId;
        d.perpId = perpId;
        d.orderType = orderType;
        d.pricePNS = pricePNS;
        d.lotLNS = lots;
        d.postOnly = true;
        d.leverageHdths = 100;
        d.maxNegPnlCollatBPS = 10_000;
        vm.prank(maker);
        IPerplExchange.OrderSignature memory s = ex.execOrder(d);
        quotes.push(Quote(perpId, s.orderId));
    }

    function _cancelAll() internal {
        for (uint256 i; i < quotes.length; i++) {
            IPerplExchange.OrderDesc memory d;
            d.orderDescId = ++makerDescId;
            d.perpId = quotes[i].perpId;
            d.orderType = 4;
            d.orderId = quotes[i].orderId;
            vm.prank(maker);
            try ex.execOrder(d) {} catch {}
        }
        delete quotes;
    }

    /// @dev Sets marks and a fresh two-sided book: 10 levels each side, 0.005% apart.
    function _moveMarkets(uint256 btcMid, uint256 ethMid) internal {
        _cancelAll();
        _setMark(BTC, btcMid);
        _setMark(ETH, ethMid);
        uint256 bStep = btcMid / 20_000; // 0.005%
        uint256 eStep = ethMid / 20_000;
        if (eStep == 0) eStep = 1;
        for (uint256 i = 1; i <= 10; i++) {
            _quote(BTC, 0, btcMid - i * bStep, 50_000);
            _quote(BTC, 1, btcMid + i * bStep, 50_000);
            _quote(ETH, 0, ethMid - i * eStep, 10_000);
            _quote(ETH, 1, ethMid + i * eStep, 10_000);
        }
    }

    uint256 internal btcMark = BTC_MID;
    uint256 internal ethMark = ETH_MID;

    function _requote() internal {
        _moveMarkets(btcMark, ethMark);
    }

    function _moveBtc(uint256 newMid) internal {
        btcMark = newMid;
        _requote();
    }

    /// @dev Advance time and blocks, then refresh marks so they stay valid.
    function _advance(uint256 secs) internal {
        vm.warp(block.timestamp + secs);
        vm.roll(block.number + secs * 5 / 2 + 1);
        _setMark(BTC, btcMark);
        _setMark(ETH, ethMark);
    }

    // ------------------------------------------------------------------
    // Desk helpers
    // ------------------------------------------------------------------

    function _openDesk(address trader, uint256 cohortId, uint256 stake) internal returns (Desk) {
        vm.startPrank(trader);
        usd.approve(address(factory), stake);
        address d = factory.openDesk(stake, cohortId);
        vm.stopPrank();
        return Desk(d);
    }

    function _buy(uint256 perpId, uint256 lots, uint256 lev) internal view returns (Order memory) {
        uint256 mark = perpId == BTC ? btcMark : ethMark;
        return Order(perpId, 0, mark + mark * 20 / 10_000, lots, lev, false, false);
    }

    function _sell(uint256 perpId, uint256 lots, uint256 lev) internal view returns (Order memory) {
        uint256 mark = perpId == BTC ? btcMark : ethMark;
        return Order(perpId, 1, mark - mark * 20 / 10_000, lots, lev, false, false);
    }

    function _closeLong(uint256 perpId, uint256 lots) internal view returns (Order memory) {
        uint256 mark = perpId == BTC ? btcMark : ethMark;
        return Order(perpId, 1, mark - mark * 20 / 10_000, lots, 500, true, false);
    }

    function _closeShort(uint256 perpId, uint256 lots) internal view returns (Order memory) {
        uint256 mark = perpId == BTC ? btcMark : ethMark;
        return Order(perpId, 0, mark + mark * 20 / 10_000, lots, 500, true, false);
    }

    function _trade(Desk d, Order memory o) internal {
        vm.prank(d.trader());
        d.trade(o);
    }

    function _lots(Desk d, uint256 perpId) internal view returns (uint256) {
        (IPerplExchange.PositionInfo memory p,,) = ex.getPosition(perpId, d.accountId());
        return p.lotLNS;
    }

    function _eq(Desk d) internal view returns (int256 e) {
        (e,) = d.equity();
    }

    /// @dev Round trip on BTC that ends flat with a gain: buy, mark up `bps`, sell.
    function _profitableRoundTrip(Desk d, uint256 lots, uint256 bps) internal {
        _trade(d, _buy(BTC, lots, 500));
        _moveBtc(btcMark + btcMark * bps / 10_000);
        _trade(d, _closeLong(BTC, _lots(d, BTC)));
    }

    function _signTrade(Desk d, uint256 key, Order memory o, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                d.TRADE_TYPEHASH(),
                o.perpId,
                o.side,
                o.priceLimit,
                o.lots,
                o.leverage,
                o.reduceOnly,
                o.fillOrKill,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", d.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
