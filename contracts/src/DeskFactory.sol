// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPerplExchange} from "./interfaces/IPerplExchange.sol";
import {ImprestPool} from "./ImprestPool.sol";
import {Desk} from "./Desk.sol";
import {CohortParams, TierParams, ImprestErrors as E} from "./libraries/ImprestTypes.sol";

/// @title DeskFactory
/// @notice Registers immutable cohort policies and opens one desk per trader per
///         cohort slot. Cohorts are validated against hard caps when added and can
///         never be edited afterwards, only deactivated for new desks.
contract DeskFactory is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---- hard caps on any cohort the operator can register ----
    uint16 public constant HARD_MAX_LEVERAGE_HDTHS = 500; // 5x
    uint16 public constant HARD_MAX_PRICE_BAND_BPS = 100; // 1%
    uint16 public constant HARD_MAX_NEG_PNL_BPS = 100;
    uint16 public constant HARD_MAX_DRAWDOWN_BPS = 2_000;
    uint16 public constant HARD_MAX_FEE_CAP_BPS = 2_500; //   25% of stake
    uint32 public constant HARD_MAX_FEE_PPM_PER_DAY = 1_000; // 0.1% a day
    uint16 public constant HARD_MAX_SIZE_MULTIPLE = 10;
    uint256 public constant MAX_MARKETS = 4;

    ImprestPool public immutable pool;
    IPerplExchange public immutable exchange;
    IERC20 public immutable ausd;

    bool public paused; // stops new desks; never blocks trading limits, claims or closes

    CohortParams[] internal cohorts;
    mapping(uint256 => bool) public cohortActive;

    mapping(address => mapping(uint256 => uint256)) public deskCount; // trader => cohort => desks opened
    mapping(address => address[]) internal desksOf;
    address[] public allDesks;
    mapping(address => bool) public isDesk;

    event CohortAdded(uint256 indexed cohortId, bytes32 name, bool demo);
    event CohortActiveSet(uint256 indexed cohortId, bool active);
    event PausedSet(bool paused);
    event DeskOpened(address indexed trader, address indexed desk, uint256 indexed cohortId, uint256 stake, uint256 index);

    constructor(ImprestPool pool_, IPerplExchange exchange_, address operator) Ownable(operator) {
        pool = pool_;
        exchange = exchange_;
        ausd = IERC20(pool_.asset());
        (,,, uint256 collateralDecimals, address collateralToken,) = exchange_.getExchangeInfo();
        if (collateralToken != address(ausd) || collateralDecimals != 6) revert E.InvalidParams(10);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    function setCohortActive(uint256 cohortId, bool active) external onlyOwner {
        if (cohortId >= cohorts.length) revert E.CohortInactive(cohortId);
        cohortActive[cohortId] = active;
        emit CohortActiveSet(cohortId, active);
    }

    /// @notice Registers a new immutable cohort. Existing desks are unaffected.
    function addCohort(CohortParams calldata c) external onlyOwner returns (uint256 cohortId) {
        _validate(c);
        cohortId = cohorts.length;
        cohorts.push();
        CohortParams storage s = cohorts[cohortId];
        s.name = c.name;
        s.demo = c.demo;
        s.minStake = c.minStake;
        s.maxDrawdownBps = c.maxDrawdownBps;
        s.dailyLossBps = c.dailyLossBps;
        s.maxLeverageHdths = c.maxLeverageHdths;
        s.priceBandBps = c.priceBandBps;
        s.maxNegPnlBps = c.maxNegPnlBps;
        s.execBlockWindow = c.execBlockWindow;
        s.enforceSliceBandBps = c.enforceSliceBandBps;
        s.feeCapBps = c.feeCapBps;
        s.keeperBounty = c.keeperBounty;
        s.tierCount = c.tierCount;
        for (uint256 i; i < 3; i++) {
            s.tiers[i] = c.tiers[i];
        }
        for (uint256 i; i < c.markets.length; i++) {
            s.markets.push(c.markets[i]);
        }
        cohortActive[cohortId] = true;
        emit CohortAdded(cohortId, c.name, c.demo);
    }

    function _validate(CohortParams calldata c) internal view {
        if (c.maxLeverageHdths == 0 || c.maxLeverageHdths > HARD_MAX_LEVERAGE_HDTHS) revert E.InvalidParams(11);
        if (c.priceBandBps == 0 || c.priceBandBps > HARD_MAX_PRICE_BAND_BPS) revert E.InvalidParams(12);
        if (c.maxNegPnlBps == 0 || c.maxNegPnlBps > HARD_MAX_NEG_PNL_BPS) revert E.InvalidParams(13);
        if (c.maxDrawdownBps == 0 || c.maxDrawdownBps > HARD_MAX_DRAWDOWN_BPS) revert E.InvalidParams(14);
        if (c.dailyLossBps == 0 || c.dailyLossBps > c.maxDrawdownBps) revert E.InvalidParams(15);
        if (c.feeCapBps > HARD_MAX_FEE_CAP_BPS) revert E.InvalidParams(16);
        if (c.execBlockWindow == 0 || c.execBlockWindow > 10) revert E.InvalidParams(17);
        if (c.enforceSliceBandBps == 0 || c.enforceSliceBandBps > 500) revert E.InvalidParams(18);
        if (c.minStake == 0 || c.keeperBounty * 10 > c.minStake) revert E.InvalidParams(19);
        if (c.tierCount == 0 || c.tierCount > 3) revert E.InvalidParams(20);
        if (c.markets.length == 0 || c.markets.length > MAX_MARKETS) revert E.InvalidParams(21);
        TierParams calldata t0 = c.tiers[0];
        if (t0.sizeMultiple != 1 || t0.feeRatePpmPerDay != 0 || t0.traderSplitBps != 10_000 || t0.protocolSplitBps != 0) {
            revert E.InvalidParams(22);
        }
        for (uint256 i = 1; i < c.tierCount; i++) {
            TierParams calldata t = c.tiers[i];
            if (t.sizeMultiple <= c.tiers[i - 1].sizeMultiple || t.sizeMultiple > HARD_MAX_SIZE_MULTIPLE) {
                revert E.InvalidParams(23);
            }
            if (t.feeRatePpmPerDay > HARD_MAX_FEE_PPM_PER_DAY) revert E.InvalidParams(24);
            if (uint256(t.traderSplitBps) + t.protocolSplitBps > 10_000) revert E.InvalidParams(25);
            // The trader's stake share must exceed the max drawdown, so trading losses
            // up to the floor are absorbed by first-loss equity before pool principal.
            if (10_000 / uint256(t.sizeMultiple) <= c.maxDrawdownBps) revert E.InvalidParams(26);
        }
        for (uint256 i; i < c.markets.length; i++) {
            if (!exchange.perpetualExists(c.markets[i].perpId)) revert E.InvalidParams(27);
            for (uint256 j; j < i; j++) {
                if (c.markets[j].perpId == c.markets[i].perpId) revert E.InvalidParams(28);
            }
        }
    }

    // ------------------------------------------------------------------
    // Desks
    // ------------------------------------------------------------------

    /// @notice Opens a desk: pulls the stake, deploys the desk with CREATE2, and opens
    ///         the desk's own Perpl account with the full stake.
    function openDesk(uint256 stake, uint256 cohortId) external nonReentrant returns (address desk) {
        if (paused) revert E.Paused();
        if (cohortId >= cohorts.length || !cohortActive[cohortId]) revert E.CohortInactive(cohortId);
        uint256 minStake = cohorts[cohortId].minStake;
        uint256 venueMin = exchange.getMinAccountOpenCNS();
        if (venueMin > minStake) minStake = venueMin;
        if (stake < minStake) revert E.StakeTooLow(stake, minStake);

        uint256 index = deskCount[msg.sender][cohortId]++;
        desk = address(new Desk{salt: _salt(msg.sender, cohortId, index)}(msg.sender, cohortId));
        isDesk[desk] = true;
        desksOf[msg.sender].push(desk);
        allDesks.push(desk);
        pool.registerDesk(desk);
        ausd.safeTransferFrom(msg.sender, desk, stake);
        Desk(desk).activate(stake);
        emit DeskOpened(msg.sender, desk, cohortId, stake, index);
    }

    /// @notice Address the trader's next desk in `cohortId` will be deployed at.
    function predictDesk(address trader, uint256 cohortId) external view returns (address) {
        bytes32 initHash = keccak256(abi.encodePacked(type(Desk).creationCode, abi.encode(trader, cohortId)));
        bytes32 h = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), _salt(trader, cohortId, deskCount[trader][cohortId]), initHash)
        );
        return address(uint160(uint256(h)));
    }

    function _salt(address trader, uint256 cohortId, uint256 index) internal pure returns (bytes32) {
        return keccak256(abi.encode(trader, cohortId, index));
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function getCohort(uint256 cohortId) external view returns (CohortParams memory) {
        return cohorts[cohortId];
    }

    function cohortCount() external view returns (uint256) {
        return cohorts.length;
    }

    function getDesks(address trader) external view returns (address[] memory) {
        return desksOf[trader];
    }

    function deskTotal() external view returns (uint256) {
        return allDesks.length;
    }
}
