// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPerplExchange} from "./interfaces/IPerplExchange.sol";
import {ImprestPool} from "./ImprestPool.sol";
import {
    Order,
    Market,
    TierParams,
    CohortParams,
    DeskStatus,
    EnforceReason,
    ImprestErrors as E
} from "./libraries/ImprestTypes.sol";
import {SettlementMath} from "./libraries/SettlementMath.sol";

interface IDeskFactoryView {
    function pool() external view returns (ImprestPool);
    function exchange() external view returns (IPerplExchange);
    function ausd() external view returns (IERC20);
    function paused() external view returns (bool);
    function getCohort(uint256 cohortId) external view returns (CohortParams memory);
}

/// @title Desk
/// @notice One trader's funded desk. Owns a Perpl account and is the only path from
///         that account to the book. Every order is checked and stamped here, and the
///         equity floor is re-checked after the fill inside the same transaction, so a
///         limit-breaking order never survives on the book.
/// @dev    Money can leave this contract only to: the Perpl account (margin), the pool
///         (principal, fees, profit share), the protocol treasury (profit share), the
///         trader (profit above the high-water mark net of fees, or final residual), and
///         a keeper (bounded bounty, once, on enforced settlement). There is no admin
///         function and no arbitrary transfer.
contract Desk is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant COLLATERAL_DECIMALS = 6;

    bytes32 public constant TRADE_TYPEHASH = keccak256(
        "TradeIntent(uint256 perpId,uint8 side,uint256 priceLimit,uint256 lots,uint256 leverage,bool reduceOnly,bool fillOrKill,uint256 nonce,uint256 deadline)"
    );

    // ---- wiring (immutable) ----
    address public immutable factory;
    address public immutable trader;
    uint256 public immutable cohortId;
    ImprestPool public immutable pool;
    IPerplExchange public immutable exchange;
    IERC20 public immutable ausd;

    // ---- policy snapshot (never changes after creation) ----
    CohortParams internal p;

    // ---- desk state ----
    DeskStatus public status;
    EnforceReason public enforceReason;
    uint8 public tier;
    uint256 public accountId;
    uint256 public originalStake;
    uint256 public borrowed; //         outstanding pool principal
    uint256 public startEquity; //      equity at the start of the current tier
    uint256 public hwm; //              high-water mark for claims
    uint256 public deskStartTs;
    uint256 public tierStartTs;
    uint256 public closedTradesThisTier;
    uint256 public claimsThisTier;
    uint256 public totalTrades;
    uint256 public dayIndex;
    uint256 public dayStartEquity;
    uint256 public lastNonce;
    uint256 public orderDescId;

    // ---- fee subledger: accrued == collected + outstanding + writtenOff ----
    uint256 public feeAccrued;
    uint256 public feeCollected;
    uint256 public feeOutstanding;
    uint256 public feeWrittenOff;
    uint256 public feeRemainder;
    uint256 public lastAccrualTs;
    bool public exposed; //             any open position at the last checkpoint

    // ---- payout ledger ----
    uint256 public totalPaidToTrader;
    uint256 public totalProtocolShare;
    uint256 public totalPoolProfitShare;

    event DeskActivated(address indexed trader, uint256 indexed accountId, uint256 stake, uint256 cohortId);
    event TradeExecuted(
        uint256 indexed perpId,
        uint8 side,
        uint8 orderType,
        uint256 priceLimit,
        uint256 lots,
        uint256 leverage,
        bool fillOrKill,
        uint256 lotsBefore,
        uint256 lotsAfter,
        uint256 markPrice,
        int256 equityBefore,
        int256 equityAfter,
        uint256 nonce
    );
    event FeesAccrued(uint256 added, uint256 outstanding, uint256 elapsed);
    event Graduated(uint8 fromTier, uint8 toTier, uint256 credit, uint256 newStartEquity, uint256 floor);
    event Claimed(
        uint256 gross, uint256 feesPaid, uint256 traderShare, uint256 poolShare, uint256 protocolShare, uint256 hwm
    );
    event EnforcementStarted(EnforceReason reason, int256 equity, uint256 floor, int256 dailyFloor, uint256 feeOutstanding);
    event EnforceCloseFailed(uint256 indexed perpId, bytes reason);
    event PartialClose(uint256 openPositions);
    event SettlementPending(bytes reason);
    event Settled(
        EnforceReason reason,
        uint256 borrowed,
        uint256 equity,
        uint256 principalRepaid,
        uint256 principalLoss,
        address keeper,
        uint256 keeperPaid,
        uint256 feesAccruedTotal,
        uint256 feesCollected,
        uint256 feesWrittenOff,
        uint256 traderRemainder
    );

    modifier onlyTrader() {
        if (msg.sender != trader) revert E.Unauthorized(msg.sender);
        _;
    }

    constructor(address trader_, uint256 cohortId_) EIP712("Imprest Desk", "1") {
        factory = msg.sender;
        trader = trader_;
        cohortId = cohortId_;
        IDeskFactoryView f = IDeskFactoryView(msg.sender);
        pool = f.pool();
        exchange = f.exchange();
        ausd = f.ausd();
        CohortParams memory c = f.getCohort(cohortId_);
        p.name = c.name;
        p.demo = c.demo;
        p.minStake = c.minStake;
        p.maxDrawdownBps = c.maxDrawdownBps;
        p.dailyLossBps = c.dailyLossBps;
        p.maxLeverageHdths = c.maxLeverageHdths;
        p.priceBandBps = c.priceBandBps;
        p.maxNegPnlBps = c.maxNegPnlBps;
        p.execBlockWindow = c.execBlockWindow;
        p.enforceSliceBandBps = c.enforceSliceBandBps;
        p.feeCapBps = c.feeCapBps;
        p.keeperBounty = c.keeperBounty;
        p.tierCount = c.tierCount;
        for (uint256 i; i < 3; i++) {
            p.tiers[i] = c.tiers[i];
        }
        for (uint256 i; i < c.markets.length; i++) {
            p.markets.push(c.markets[i]);
        }
    }

    /// @notice Called once by the factory after the stake has been transferred in.
    ///         Opens the desk's own Perpl account with the full stake.
    function activate(uint256 stake) external {
        if (msg.sender != factory || accountId != 0) revert E.Unauthorized(msg.sender);
        ausd.forceApprove(address(exchange), stake);
        accountId = exchange.createAccount(stake);
        originalStake = stake;
        startEquity = stake;
        hwm = stake;
        deskStartTs = block.timestamp;
        tierStartTs = block.timestamp;
        lastAccrualTs = block.timestamp;
        emit DeskActivated(trader, accountId, stake, cohortId);
    }

    // ==================================================================
    // Trading
    // ==================================================================

    /// @notice Trader self-submits an order.
    function trade(Order calldata o) external nonReentrant onlyTrader {
        _trade(o, 0);
    }

    /// @notice Relayed order signed by the trader (EIP-712). The relayer can only submit
    ///         exactly what was signed: every field is in the digest, the nonce must rise
    ///         strictly and the deadline must not have passed.
    function tradeWithSig(Order calldata o, uint256 nonce, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
    {
        if (block.timestamp > deadline) revert E.DeadlineExpired(deadline, block.timestamp);
        if (nonce <= lastNonce) revert E.NonceInvalid(nonce, lastNonce);
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    TRADE_TYPEHASH,
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
            )
        );
        if (!SignatureChecker.isValidSignatureNow(trader, digest, sig)) revert E.InvalidSignature();
        lastNonce = nonce;
        _trade(o, nonce);
    }

    function _trade(Order calldata o, uint256 nonce) internal {
        if (status != DeskStatus.Active) revert E.DeskNotActive(uint8(status));
        _accrueFees();
        Market memory m = _market(o.perpId);
        if (o.side > 1) revert E.InvalidSide(o.side);
        if (o.lots == 0) revert E.InvalidLots();
        if (o.leverage == 0 || o.leverage > p.maxLeverageHdths) {
            revert E.LeverageExceeded(o.leverage, p.maxLeverageHdths);
        }

        (IPerplExchange.PositionInfo memory pos, uint256 mark, bool valid) = exchange.getPosition(o.perpId, accountId);
        bool increasesRisk = !o.reduceOnly;
        if (!valid && increasesRisk) revert E.MarkStale(o.perpId);
        if (mark == 0) revert E.MarkStale(o.perpId);
        // Price band on every order, closes included: Perpl skips its negative-PnL
        // check on reducing fills, so an off-market close could move losses onto the
        // pool without this band.
        uint256 dist = o.priceLimit > mark ? o.priceLimit - mark : mark - o.priceLimit;
        if (dist * BPS > mark * p.priceBandBps) revert E.PriceOutsideBand(o.priceLimit, mark, p.priceBandBps);

        uint8 orderType;
        if (o.reduceOnly) {
            // buy closes a short (positionType 1), sell closes a long (positionType 0)
            bool matches = pos.lotLNS > 0 && (o.side == 0 ? pos.positionType == 1 : pos.positionType == 0);
            if (!matches || o.lots > pos.lotLNS) revert E.ReduceOnlyInvalid(o.perpId);
            orderType = o.side == 0 ? 3 : 2;
        } else {
            if (feeOutstanding >= _feeCap()) revert E.FeeCapReached(feeOutstanding, _feeCap());
            orderType = o.side == 0 ? 0 : 1;
        }

        // Pre-trade equity check. With a stale mark only reduce-only orders reach here,
        // and their equity cannot be trusted, so the floor is not evaluated for them.
        (int256 eqBefore, bool allValid,) = _snapshot();
        bool checkFloor = allValid;
        if (increasesRisk && !allValid) revert E.MarkStale(0);
        if (checkFloor) {
            _rollDay(eqBefore);
            _requireAboveFloors(eqBefore);
        }

        // Pool caps are checked BEFORE the order reaches the book, using the worst-case
        // notional of the order, and re-recorded with the actual fill afterwards.
        uint256 oldGross = pool.deskExposure(address(this), o.perpId);
        if (borrowed > 0 && increasesRisk) {
            uint256 worstPrice = o.priceLimit > mark ? o.priceLimit : mark;
            uint256 upper = _notional(m, pos.lotLNS, mark) + _notional(m, o.lots, worstPrice);
            if (upper > oldGross) {
                uint256 perpGross = pool.grossExposure(o.perpId) - oldGross + upper;
                uint256 cap = pool.grossCap(o.perpId);
                if (perpGross > cap) revert E.ExposureCapReached(o.perpId, perpGross, cap);
                uint256 deskGross = pool.deskGross(address(this)) - oldGross + upper;
                uint256 dCap = pool.deskNotionalCap();
                if (deskGross > dCap) revert E.DeskNotionalCapReached(deskGross, dCap);
            }
        }

        exchange.execOrder(_stamp(o.perpId, orderType, o.priceLimit, o.lots, o.leverage, o.fillOrKill));

        (IPerplExchange.PositionInfo memory pos2, uint256 mark2,) = exchange.getPosition(o.perpId, accountId);
        int256 eqAfter;
        if (checkFloor) {
            bool validAfter;
            (eqAfter, validAfter,) = _snapshot();
            if (increasesRisk && !validAfter) revert E.MarkStale(o.perpId);
            if (validAfter) _requireAboveFloors(eqAfter);
        }

        if (borrowed > 0) {
            uint256 newGross = _notional(m, pos2.lotLNS, mark2);
            if (increasesRisk) pool.recordExposure(o.perpId, oldGross, newGross);
            else pool.releaseExposure(o.perpId, oldGross, newGross);
        }

        if (pos.lotLNS > 0 && pos2.lotLNS == 0) closedTradesThisTier++;
        if (pos2.lotLNS != pos.lotLNS || pos2.positionType != pos.positionType) totalTrades++;
        _refreshExposed();

        emit TradeExecuted(
            o.perpId,
            o.side,
            orderType,
            o.priceLimit,
            o.lots,
            o.leverage,
            o.fillOrKill,
            pos.lotLNS,
            pos2.lotLNS,
            mark2,
            eqBefore,
            eqAfter,
            nonce
        );
    }

    function _stamp(uint256 perpId, uint8 orderType, uint256 price, uint256 lots, uint256 leverage, bool fok)
        internal
        returns (IPerplExchange.OrderDesc memory d)
    {
        d.orderDescId = ++orderDescId;
        d.perpId = perpId;
        d.orderType = orderType;
        d.pricePNS = price;
        d.lotLNS = lots;
        d.fillOrKill = fok;
        d.immediateOrCancel = !fok;
        d.postOnly = false;
        d.leverageHdths = leverage;
        d.lastExecutionBlock = block.number + p.execBlockWindow;
        d.maxNegPnlCollatBPS = p.maxNegPnlBps;
    }

    // ==================================================================
    // Graduation
    // ==================================================================

    /// @notice Anyone may call; succeeds only if the next tier's rule holds onchain.
    function graduate() external nonReentrant {
        if (status != DeskStatus.Active) revert E.DeskNotActive(uint8(status));
        if (IDeskFactoryView(factory).paused() || pool.paused()) revert E.Paused();
        uint8 next = tier + 1;
        if (next >= p.tierCount) revert E.MaxTierReached();
        _accrueFees();
        (int256 eq,, bool flat) = _snapshot();
        if (!flat) revert E.PositionNotFlat(0);
        uint256 eqU = eq > 0 ? uint256(eq) : 0;
        TierParams memory t = p.tiers[next];
        if (eqU * BPS < startEquity * (BPS + t.gradProfitBps)) revert E.GraduationNotEligible(1);
        if (closedTradesThisTier < t.gradMinClosedTrades) revert E.GraduationNotEligible(2);
        if (block.timestamp - tierStartTs < t.gradMinSeconds) revert E.GraduationNotEligible(3);
        if (claimsThisTier < t.gradMinClaims) revert E.GraduationNotEligible(4);
        if (feeOutstanding > 0) revert E.GraduationNotEligible(5);

        uint256 target = originalStake * (uint256(t.sizeMultiple) - 1);
        uint256 credit = target > borrowed ? target - borrowed : 0;
        if (credit > 0) {
            pool.fundDesk(address(this), credit);
            ausd.forceApprove(address(exchange), credit);
            exchange.depositCollateral(credit);
            borrowed += credit;
        }
        uint8 from = tier;
        tier = next;
        startEquity = eqU + credit;
        hwm = startEquity;
        dayIndex = block.timestamp / 1 days;
        dayStartEquity = startEquity;
        tierStartTs = block.timestamp;
        closedTradesThisTier = 0;
        claimsThisTier = 0;
        lastAccrualTs = block.timestamp;
        emit Graduated(from, next, credit, startEquity, floorEquity());
    }

    // ==================================================================
    // Claims and voluntary close
    // ==================================================================

    /// @notice Flat-only claim of realized profit above the high-water mark. Accrued
    ///         credit fees are netted first; only the remainder is split. Unrealized
    ///         mark-to-market gains can never leave the desk.
    function claim() external nonReentrant onlyTrader {
        if (status != DeskStatus.Active) revert E.DeskNotActive(uint8(status));
        _accrueFees();
        uint256 eqU = _requireFlatEquity();
        SettlementMath.ClaimSplit memory c = _split(eqU);
        if (c.gross == 0) revert E.NothingToClaim();
        if (!_withdrawFromVenue(c.gross)) revert E.InsufficientIdle(c.gross, ausd.balanceOf(address(this)));
        _distribute(c);
        _refreshExposed();
    }

    /// @notice Trader closes a flat desk. Any profit above the HWM is split exactly
    ///         once, then principal is repaid and the remainder goes to the trader.
    ///         Voluntary close pays no keeper bounty.
    function close() external nonReentrant onlyTrader {
        if (status != DeskStatus.Active) revert E.DeskNotActive(uint8(status));
        _accrueFees();
        uint256 eqU = _requireFlatEquity();
        SettlementMath.ClaimSplit memory c = _split(eqU);
        if (c.gross > 0) {
            if (!_withdrawFromVenue(c.gross)) revert E.InsufficientIdle(c.gross, ausd.balanceOf(address(this)));
            _distribute(c);
        }
        status = DeskStatus.Closed;
        if (!_settle(EnforceReason.None, address(0))) revert E.InsufficientIdle(0, 0);
    }

    // ==================================================================
    // Enforcement (permissionless)
    // ==================================================================

    /// @notice Anyone may call. Proceeds only for a verified trading breach (floor or
    ///         daily loss) or a fee liability at its cap; a healthy desk reverts with
    ///         DeskHealthy. Once started the desk is reduce-only until settled; the call
    ///         can be repeated after a partial close. The keeper bounty is paid at most
    ///         once, from residual trader equity, on final settlement.
    function enforce() external nonReentrant {
        if (status == DeskStatus.Closed) revert E.DeskNotActive(uint8(status));
        _accrueFees();
        if (status == DeskStatus.Active) {
            (int256 eq, bool allValid,) = _snapshot();
            if (!allValid) revert E.MarkStale(0);
            EnforceReason reason;
            int256 fl = int256(floorEquity());
            int256 dfl = dailyFloor();
            if (eq < fl) reason = EnforceReason.TradingFloor;
            else if (eq < dfl) reason = EnforceReason.DailyLoss;
            else if (feeOutstanding >= _feeCap() && _feeCap() > 0) reason = EnforceReason.FeeCap;
            else revert E.DeskHealthy();
            status = DeskStatus.Enforcing;
            enforceReason = reason;
            emit EnforcementStarted(reason, eq, uint256(fl), dfl, feeOutstanding);
        }

        uint256 open = _closeAllSlices();
        _refreshExposed();
        if (open > 0) {
            emit PartialClose(open);
            return;
        }
        (int256 eqFlat,,) = _snapshot();
        uint256 eqU = eqFlat > 0 ? uint256(eqFlat) : 0;
        SettlementMath.ClaimSplit memory c = _split(eqU);
        if (c.gross > 0) {
            // Fee-cap enforcement of a profitable desk: split realized profit exactly once.
            if (!_withdrawFromVenue(c.gross)) {
                emit SettlementPending("withdraw");
                return;
            }
            _distribute(c);
        }
        status = DeskStatus.Closed;
        if (!_settle(enforceReason, msg.sender)) {
            status = DeskStatus.Enforcing;
            emit SettlementPending("withdraw");
        }
    }

    /// @notice Anyone may checkpoint fee accrual and refresh the exposure flag from
    ///         authoritative Perpl state (e.g. after an external liquidation). Exposure
    ///         time up to now is charged at the previous flag: conservative and capped.
    function checkpoint() external nonReentrant {
        if (status == DeskStatus.Closed) revert E.DeskNotActive(uint8(status));
        _accrueFees();
        _refreshExposed();
    }

    function _closeAllSlices() internal returns (uint256 open) {
        for (uint256 i; i < p.markets.length; i++) {
            uint256 perpId = p.markets[i].perpId;
            (IPerplExchange.PositionInfo memory pos, uint256 mark, bool valid) = exchange.getPosition(perpId, accountId);
            if (pos.lotLNS == 0) continue;
            uint256 oldGross = pool.deskExposure(address(this), perpId);
            if (!valid || mark == 0) {
                emit EnforceCloseFailed(perpId, "MARK_STALE");
                open++;
                continue;
            }
            bool isLong = pos.positionType == 0;
            uint256 price = isLong
                ? mark * (BPS - p.enforceSliceBandBps) / BPS
                : mark * (BPS + p.enforceSliceBandBps) / BPS;
            IPerplExchange.OrderDesc memory d =
                _stamp(perpId, isLong ? 2 : 3, price, pos.lotLNS, p.maxLeverageHdths, false);
            try exchange.execOrder(d) {}
            catch (bytes memory reason) {
                emit EnforceCloseFailed(perpId, reason);
            }
            (IPerplExchange.PositionInfo memory pos2, uint256 mark2,) = exchange.getPosition(perpId, accountId);
            if (oldGross > 0) pool.releaseExposure(perpId, oldGross, _notional(p.markets[i], pos2.lotLNS, mark2));
            if (pos2.lotLNS > 0) open++;
        }
    }

    // ==================================================================
    // Settlement internals
    // ==================================================================

    function _split(uint256 eqU) internal view returns (SettlementMath.ClaimSplit memory) {
        TierParams memory t = p.tiers[tier];
        return SettlementMath.claimSplit(eqU, hwm, feeOutstanding, t.traderSplitBps, t.protocolSplitBps);
    }

    function _distribute(SettlementMath.ClaimSplit memory c) internal {
        feeOutstanding -= c.feesPaid;
        feeCollected += c.feesPaid;
        totalPaidToTrader += c.traderShare;
        totalProtocolShare += c.protocolShare;
        totalPoolProfitShare += c.poolShare;
        claimsThisTier++;
        if (c.traderShare > 0) ausd.safeTransfer(trader, c.traderShare);
        if (c.protocolShare > 0) ausd.safeTransfer(pool.protocolTreasury(), c.protocolShare);
        uint256 toPool = c.feesPaid + c.poolShare;
        if (toPool > 0) {
            ausd.forceApprove(address(pool), toPool);
            pool.receiveIncome(c.feesPaid, c.poolShare);
        }
        emit Claimed(c.gross, c.feesPaid, c.traderShare, c.poolShare, c.protocolShare, hwm);
    }

    /// @dev Requires status already set to Closed by the caller. Returns false (and
    ///      changes nothing) if Perpl refuses the withdrawal, e.g. a rate limit.
    function _settle(EnforceReason reason, address keeper) internal returns (bool) {
        IPerplExchange.AccountInfo memory a = exchange.getAccountByAddr(address(this));
        if (a.balanceCNS > 0) {
            try exchange.withdrawCollateral(a.balanceCNS) {}
            catch {
                return false;
            }
        }
        for (uint256 i; i < p.markets.length; i++) {
            uint256 perpId = p.markets[i].perpId;
            uint256 g = pool.deskExposure(address(this), perpId);
            if (g > 0) pool.releaseExposure(perpId, g, 0);
        }
        uint256 eqU = ausd.balanceOf(address(this));
        uint256 bounty = keeper == address(0) ? 0 : p.keeperBounty;
        SettlementMath.Waterfall memory w = SettlementMath.waterfall(eqU, borrowed, feeOutstanding, bounty);

        uint256 b = borrowed;
        feeCollected += w.feesCollected;
        feeWrittenOff += w.feesWrittenOff;
        feeOutstanding = 0;
        borrowed = 0;
        exposed = false;
        totalPaidToTrader += w.traderRemainder;

        if (b > 0 || w.feesCollected > 0) {
            ausd.forceApprove(address(pool), w.principalRepaid + w.feesCollected);
            pool.settleDesk(w.principalRepaid, w.feesCollected, w.principalLoss, w.feesWrittenOff);
        }
        if (w.keeperPaid > 0) ausd.safeTransfer(keeper, w.keeperPaid);
        if (w.traderRemainder > 0) ausd.safeTransfer(trader, w.traderRemainder);

        emit Settled(
            reason,
            b,
            eqU,
            w.principalRepaid,
            w.principalLoss,
            keeper,
            w.keeperPaid,
            feeAccrued,
            w.feesCollected,
            w.feesWrittenOff,
            w.traderRemainder
        );
        return true;
    }

    /// @dev Ensures `amount` AUSD sits in the desk, withdrawing the shortfall from Perpl.
    function _withdrawFromVenue(uint256 amount) internal returns (bool) {
        uint256 idle = ausd.balanceOf(address(this));
        if (idle >= amount) return true;
        try exchange.withdrawCollateral(amount - idle) {}
        catch {
            return false;
        }
        return ausd.balanceOf(address(this)) >= amount;
    }

    // ==================================================================
    // Fees
    // ==================================================================

    function _feeCap() internal view returns (uint256) {
        return (originalStake * p.feeCapBps) / BPS;
    }

    /// @dev Accrues the tier's daily rate on borrowed principal for elapsed time during
    ///      which the desk had a nonzero position at the last checkpoint. Multiple
    ///      positions never multiply the fee; flat and evaluation intervals accrue zero.
    function _accrueFees() internal {
        uint256 nowTs = block.timestamp;
        uint256 elapsed = nowTs - lastAccrualTs;
        if (elapsed == 0) return;
        lastAccrualTs = nowTs;
        if (!exposed || borrowed == 0) return;
        uint256 rate = p.tiers[tier].feeRatePpmPerDay;
        if (rate == 0) return;
        (uint256 added, uint256 rem) =
            SettlementMath.accrue(borrowed, rate, elapsed, feeRemainder, feeOutstanding, _feeCap());
        feeRemainder = rem;
        if (added > 0) {
            feeOutstanding += added;
            feeAccrued += added;
            emit FeesAccrued(added, feeOutstanding, elapsed);
        }
    }

    function _refreshExposed() internal {
        bool any;
        for (uint256 i; i < p.markets.length; i++) {
            (IPerplExchange.PositionInfo memory pos,,) = exchange.getPosition(p.markets[i].perpId, accountId);
            if (pos.lotLNS > 0) {
                any = true;
                break;
            }
        }
        exposed = any;
    }

    // ==================================================================
    // Equity and floors
    // ==================================================================

    /// @return eq        risk equity: idle AUSD + Perpl balance + locked + sum(deposit + PnL)
    /// @return allValid  every open position has a valid mark
    /// @return flat      no open position on any allowlisted market
    function _snapshot() internal view returns (int256 eq, bool allValid, bool flat) {
        allValid = true;
        flat = true;
        IPerplExchange.AccountInfo memory a = exchange.getAccountByAddr(address(this));
        eq = int256(ausd.balanceOf(address(this)) + a.balanceCNS + a.lockedBalanceCNS);
        for (uint256 i; i < p.markets.length; i++) {
            (IPerplExchange.PositionInfo memory pos,, bool valid) = exchange.getPosition(p.markets[i].perpId, accountId);
            if (pos.lotLNS == 0) continue;
            flat = false;
            if (!valid) allValid = false;
            eq += int256(pos.depositCNS) + pos.deltaPnlCNS + pos.premiumPnlCNS;
        }
    }

    function _requireFlatEquity() internal view returns (uint256) {
        for (uint256 i; i < p.markets.length; i++) {
            (IPerplExchange.PositionInfo memory pos,,) = exchange.getPosition(p.markets[i].perpId, accountId);
            if (pos.lotLNS > 0) revert E.PositionNotFlat(p.markets[i].perpId);
        }
        (int256 eq,,) = _snapshot();
        return eq > 0 ? uint256(eq) : 0;
    }

    function _rollDay(int256 eqNow) internal {
        uint256 today = block.timestamp / 1 days;
        if (today != dayIndex) {
            dayIndex = today;
            dayStartEquity = eqNow > 0 ? uint256(eqNow) : 0;
        }
    }

    function _requireAboveFloors(int256 eq) internal view {
        int256 fl = int256(floorEquity());
        if (eq < fl) revert E.FloorBreach(eq, fl);
        int256 dfl = dailyFloor();
        if (eq < dfl) revert E.DailyLossExceeded(eq, dfl);
    }

    function floorEquity() public view returns (uint256) {
        return (startEquity * (BPS - p.maxDrawdownBps)) / BPS;
    }

    /// @notice Equity floor for today; none before the first trade of the UTC day.
    function dailyFloor() public view returns (int256) {
        if (block.timestamp / 1 days != dayIndex) return type(int256).min;
        return int256((dayStartEquity * (BPS - p.dailyLossBps)) / BPS);
    }

    function _market(uint256 perpId) internal view returns (Market memory) {
        for (uint256 i; i < p.markets.length; i++) {
            if (p.markets[i].perpId == perpId) return p.markets[i];
        }
        revert E.MarketNotAllowed(perpId);
    }

    /// @dev AUSD notional of `lots` at `price`, in collateral base units.
    function _notional(Market memory m, uint256 lots, uint256 price) internal pure returns (uint256) {
        uint256 dec = uint256(m.priceDecimals) + uint256(m.lotDecimals);
        if (dec >= COLLATERAL_DECIMALS) return (lots * price) / (10 ** (dec - COLLATERAL_DECIMALS));
        return lots * price * (10 ** (COLLATERAL_DECIMALS - dec));
    }

    // ==================================================================
    // Views
    // ==================================================================

    function equity() external view returns (int256 eq, bool markValid) {
        (eq, markValid,) = _snapshot();
    }

    struct RiskState {
        uint8 status;
        uint8 tier;
        uint8 enforceReason;
        int256 equity;
        bool markValid;
        bool flat;
        uint256 startEquity;
        uint256 floor;
        int256 dailyFloor;
        uint256 dayStartEquity;
        uint256 hwm;
        uint256 originalStake;
        uint256 borrowed;
        uint256 feeOutstanding;
        uint256 feeCap;
        uint256 feeAccrued;
        uint256 feeCollected;
        uint256 feeWrittenOff;
        uint256 closedTradesThisTier;
        uint256 claimsThisTier;
        uint256 tierStartTs;
        uint256 lastNonce;
        uint256 accountId;
        bool exposed;
    }

    /// @notice Everything the risk center needs in one read; never used to authorize.
    function riskState() external view returns (RiskState memory r) {
        (r.equity, r.markValid, r.flat) = _snapshot();
        r.status = uint8(status);
        r.tier = tier;
        r.enforceReason = uint8(enforceReason);
        r.startEquity = startEquity;
        r.floor = floorEquity();
        r.dailyFloor = dailyFloor();
        r.dayStartEquity = dayStartEquity;
        r.hwm = hwm;
        r.originalStake = originalStake;
        r.borrowed = borrowed;
        r.feeOutstanding = feeOutstanding;
        r.feeCap = _feeCap();
        r.feeAccrued = feeAccrued;
        r.feeCollected = feeCollected;
        r.feeWrittenOff = feeWrittenOff;
        r.closedTradesThisTier = closedTradesThisTier;
        r.claimsThisTier = claimsThisTier;
        r.tierStartTs = tierStartTs;
        r.lastNonce = lastNonce;
        r.accountId = accountId;
        r.exposed = exposed;
    }

    function policy() external view returns (CohortParams memory) {
        return p;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
