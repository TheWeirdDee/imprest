// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ImprestFixture} from "../ImprestFixture.sol";
import {Desk} from "../../src/Desk.sol";
import {Order, DeskStatus} from "../../src/libraries/ImprestTypes.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {StdCheats} from "forge-std/StdCheats.sol";

interface IInvariantHost {
    function h_graduatePath(address desk) external;
    function h_requote(uint256 btcMid, uint256 ethMid) external;
    function h_advance(uint256 secs) external;
    function btcMarkNow() external view returns (uint256);
    function ethMarkNow() external view returns (uint256);
}

/// @notice Random actor driving the full stack. Every call may legitimately revert at
///         the desk (that is the policy working); invariants are checked after each.
contract Handler is CommonBase, StdCheats, StdUtils {
    IInvariantHost host;
    address[] public desks;
    address[] traders;
    address lp;
    ImprestPoolLike pool;
    FactoryLike factory;
    TokenLike usd;
    uint256 demoCohort;

    uint256 public calls;
    uint256 public tradesOk;
    uint256 public graduations;
    uint256 public claims;
    uint256 public settlements;

    constructor(
        IInvariantHost host_,
        ImprestPoolLike pool_,
        FactoryLike factory_,
        TokenLike usd_,
        address lp_,
        uint256 demoCohort_
    ) {
        host = host_;
        pool = pool_;
        factory = factory_;
        usd = usd_;
        lp = lp_;
        demoCohort = demoCohort_;
        for (uint256 i; i < 4; i++) {
            traders.push(address(uint160(0xA11CE0 + i)));
        }
    }

    function openDesk(uint256 who) external {
        calls++;
        if (desks.length >= 4) return;
        address t = traders[who % traders.length];
        usd.mint(t, 100e6);
        vm.startPrank(t);
        usd.approve(address(factory), 100e6);
        try factory.openDesk(100e6, demoCohort) returns (address d) {
            desks.push(d);
        } catch {}
        vm.stopPrank();
    }

    function trade(uint256 di, uint256 perpSel, uint256 side, uint256 lots, uint256 lev, bool reduce) external {
        calls++;
        if (desks.length == 0) return;
        Desk d = Desk(desks[di % desks.length]);
        uint256 perpId = perpSel % 2 == 0 ? 16 : 32;
        uint256 mark = perpId == 16 ? host.btcMarkNow() : host.ethMarkNow();
        uint8 s = uint8(side % 2);
        uint256 price = s == 0 ? mark + mark * 20 / 10_000 : mark - mark * 20 / 10_000;
        // up to ~5x of a 100 AUSD evaluation desk, or of a ~500 AUSD funded desk
        lots = bound(lots, 1, perpId == 16 ? (d.borrowed() > 0 ? 2_400 : 480) : (d.borrowed() > 0 ? 600 : 120));
        lev = bound(lev, 100, 520); // includes illegal values above 5x
        if (reduce) {
            (bool okR, bytes memory data) = address(host).staticcall(abi.encodeWithSignature("lotsOf(address,uint256)", address(d), perpId));
            uint256 held = okR ? abi.decode(data, (uint256)) : 0;
            if (held == 0) reduce = false;
            else lots = bound(lots, 1, held);
        }
        vm.prank(d.trader());
        try d.trade(Order(perpId, s, price, lots, lev, reduce, false)) {
            tradesOk++;
        } catch {}
    }

    function moveMarket(uint256 bpsUp, uint256 bpsDown) external {
        calls++;
        uint256 b = host.btcMarkNow();
        uint256 e = host.ethMarkNow();
        b = b + b * bound(bpsUp, 0, 150) / 10_000 - b * bound(bpsDown, 0, 150) / 10_000;
        e = e + e * bound(bpsDown, 0, 150) / 10_000 - e * bound(bpsUp, 0, 150) / 10_000;
        host.h_requote(b, e);
    }

    function advance(uint256 secs) external {
        calls++;
        host.h_advance(bound(secs, 1, 3 days));
    }

    function graduate(uint256 di) external {
        calls++;
        if (desks.length == 0) return;
        try Desk(desks[di % desks.length]).graduate() {
            graduations++;
        } catch {}
    }

    /// Composite action: two profitable round trips then a permissionless graduation,
    /// so funded-desk ledgers are exercised (random walks rarely reach +2%).
    function graduatePath(uint256 di) external {
        calls++;
        if (desks.length == 0) return;
        Desk d = Desk(desks[di % desks.length]);
        if (d.status() != DeskStatus.Active || d.tier() != 0) return;
        try host.h_graduatePath(address(d)) {
            graduations++;
        } catch {}
    }

    function claim(uint256 di) external {
        calls++;
        if (desks.length == 0) return;
        Desk d = Desk(desks[di % desks.length]);
        vm.prank(d.trader());
        try d.claim() {
            claims++;
        } catch {}
    }

    function close(uint256 di) external {
        calls++;
        if (desks.length == 0) return;
        Desk d = Desk(desks[di % desks.length]);
        vm.prank(d.trader());
        try d.close() {
            settlements++;
        } catch {}
    }

    function enforce(uint256 di) external {
        calls++;
        if (desks.length == 0) return;
        Desk d = Desk(desks[di % desks.length]);
        try d.enforce() {
            if (d.status() == DeskStatus.Closed) settlements++;
        } catch {}
    }

    function lpDeposit(uint256 amt) external {
        calls++;
        amt = bound(amt, 1e6, 10_000e6);
        usd.mint(lp, amt);
        vm.prank(lp);
        pool.deposit(amt, lp);
    }

    function lpWithdraw(uint256 amt) external {
        calls++;
        uint256 maxW = pool.maxWithdraw(lp);
        if (maxW == 0) return;
        amt = bound(amt, 1, maxW);
        vm.prank(lp);
        pool.withdraw(amt, lp, lp);
    }

    function deskCount() external view returns (uint256) {
        return desks.length;
    }
}

interface ImprestPoolLike {
    function deposit(uint256, address) external returns (uint256);
    function withdraw(uint256, address, address) external returns (uint256);
    function maxWithdraw(address) external view returns (uint256);
}

interface FactoryLike {
    function openDesk(uint256, uint256) external returns (address);
}

interface TokenLike {
    function mint(address, uint256) external;
    function approve(address, uint256) external returns (bool);
}

contract PoolInvariantTest is ImprestFixture, IInvariantHost {
    Handler handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(
            IInvariantHost(address(this)),
            ImprestPoolLike(address(pool)),
            FactoryLike(address(factory)),
            TokenLike(address(usd)),
            lp,
            demoCohort
        );
        vm.prank(lp);
        usd.approve(address(pool), type(uint256).max);
        targetContract(address(handler));
    }

    // ---- host hooks used by the handler ----
    function h_requote(uint256 b, uint256 e) external {
        btcMark = b;
        ethMark = e;
        _requote();
    }

    function h_graduatePath(address d) external {
        Desk desk = Desk(d);
        if (_lots(desk, BTC) > 0 || _lots(desk, ETH) > 0) revert("not flat");
        _profitableRoundTrip(desk, 400, 100);
        _profitableRoundTrip(desk, 400, 100);
        desk.graduate();
    }

    function h_advance(uint256 secs) external {
        _advance(secs);
    }

    function btcMarkNow() external view returns (uint256) {
        return btcMark;
    }

    function ethMarkNow() external view returns (uint256) {
        return ethMark;
    }

    // ---- invariants ----

    /// PRD invariant 6: cash-basis pool accounting.
    function invariant_cashBasisIdentity() public view {
        assertEq(
            pool.idleAssets() + pool.deployedPrincipal() + pool.totalPrincipalLoss() + pool.lpWithdrawn(),
            pool.lpDeposited() + pool.totalFeesCollected() + pool.totalProfitShare()
        );
    }

    function invariant_idleBackedByCash() public view {
        assertGe(usd.balanceOf(address(pool)), pool.idleAssets());
    }

    function invariant_principalAndExposureLedgers() public view {
        uint256 n = handler.deskCount();
        uint256 sumPrincipal;
        uint256 sumBtc;
        uint256 sumEth;
        for (uint256 i; i < n; i++) {
            Desk d = Desk(handler.desks(i));
            sumPrincipal += pool.principalOf(address(d));
            sumBtc += pool.deskExposure(address(d), BTC);
            sumEth += pool.deskExposure(address(d), ETH);
            assertEq(d.borrowed(), pool.principalOf(address(d)), "desk and pool principal agree");
        }
        assertEq(sumPrincipal, pool.deployedPrincipal());
        assertEq(sumBtc, pool.grossExposure(BTC));
        assertEq(sumEth, pool.grossExposure(ETH));
    }

    function invariant_feeSubledgerAndCap() public view {
        uint256 n = handler.deskCount();
        for (uint256 i; i < n; i++) {
            Desk d = Desk(handler.desks(i));
            assertEq(d.feeAccrued(), d.feeCollected() + d.feeOutstanding() + d.feeWrittenOff());
            assertLe(d.feeOutstanding(), d.originalStake() * 2_500 / 10_000);
        }
    }

    function invariant_closedDesksHoldNothing() public view {
        uint256 n = handler.deskCount();
        for (uint256 i; i < n; i++) {
            Desk d = Desk(handler.desks(i));
            if (d.status() != DeskStatus.Closed) continue;
            assertEq(usd.balanceOf(address(d)), 0);
            assertEq(ex.getAccountByAddr(address(d)).balanceCNS, 0);
            assertEq(d.borrowed(), 0);
        }
    }

    function lotsOf(address d, uint256 perpId) external view returns (uint256) {
        return _lots(Desk(d), perpId);
    }

    /// The handler really trades (guards against a vacuous campaign).
    function test_handlerCanTrade() public {
        handler.openDesk(0);
        assertEq(handler.deskCount(), 1);
        handler.trade(0, 0, 0, 100, 500, false);
        assertEq(handler.tradesOk(), 1);
    }

    function afterInvariant() external {
        vm.writeLine(
            "../proof/local/invariant-coverage.csv",
            string.concat(
                vm.toString(handler.calls()), ",", vm.toString(handler.deskCount()), ",",
                vm.toString(handler.tradesOk()), ",", vm.toString(handler.graduations()), ",",
                vm.toString(handler.claims()), ",", vm.toString(handler.settlements())
            )
        );
        emit log_named_uint("handler calls", handler.calls());
        emit log_named_uint("successful trades", handler.tradesOk());
        emit log_named_uint("graduations", handler.graduations());
        emit log_named_uint("claims", handler.claims());
        emit log_named_uint("settlements", handler.settlements());
    }
}

