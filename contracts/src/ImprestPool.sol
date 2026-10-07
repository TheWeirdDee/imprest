// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ImprestErrors as E} from "./libraries/ImprestTypes.sol";

/// @title ImprestPool
/// @notice LP pool that lends AUSD credit to graduated desks. Holds the V0 portfolio
///         guard: every funded desk must account its gross notional per perp here, in
///         the same transaction as the trade, so neither a relayer nor a UI can bypass
///         the gross-exposure or per-desk notional caps.
/// @dev    Cash-basis accounting (PRD invariant 6). Assets are tracked explicitly rather
///         than read from balanceOf, so donations never inflate NAV and every movement
///         is attributable:
///           idle + deployed + principalLoss + lpWithdrawn
///             == lpDeposited + feesCollected + profitShareReceived
///         Pending or written-off fees are never income.
contract ImprestPool is ERC4626, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Delay before an operator *increase* of a risk cap takes effect.
    ///         Decreases apply immediately (they only reduce risk).
    uint256 public immutable capIncreaseDelay;

    address public factory;
    address public protocolTreasury;
    bool public paused; // stops new credit (graduations); never blocks settlement or LP withdrawals

    mapping(address => bool) public isDesk;
    mapping(address => uint256) public principalOf;
    mapping(address => bool) public deskSettled;

    // ---- cash-basis ledger (AUSD base units) ----
    uint256 public idleAssets;
    uint256 public deployedPrincipal;
    uint256 public totalPrincipalLoss;
    uint256 public totalFeesCollected;
    uint256 public totalFeesWrittenOff;
    uint256 public totalProfitShare;
    uint256 public lpDeposited;
    uint256 public lpWithdrawn;

    // ---- exposure guard (AUSD notional) ----
    mapping(uint256 => uint256) public grossExposure; //               perpId => gross funded notional
    mapping(uint256 => uint256) public grossCap; //                    perpId => cap
    mapping(address => mapping(uint256 => uint256)) public deskExposure;
    mapping(address => uint256) public deskGross;
    uint256 public deskNotionalCap;

    struct Pending {
        uint256 value;
        uint256 readyAt;
    }

    mapping(uint256 => Pending) public pendingGrossCap;
    Pending public pendingDeskNotionalCap;

    event FactorySet(address factory);
    event TreasurySet(address treasury);
    event PausedSet(bool paused);
    event DeskRegistered(address indexed desk);
    event DeskFunded(address indexed desk, uint256 credit, uint256 idleAfter);
    event DeskSettled(
        address indexed desk,
        uint256 principalRepaid,
        uint256 feesCollected,
        uint256 principalLoss,
        uint256 feesWrittenOff
    );
    event IncomeReceived(address indexed desk, uint256 feesCollected, uint256 profitShare);
    event ExposureRecorded(address indexed desk, uint256 indexed perpId, uint256 oldGross, uint256 newGross, uint256 perpGross);
    event GrossCapQueued(uint256 indexed perpId, uint256 value, uint256 readyAt);
    event GrossCapSet(uint256 indexed perpId, uint256 value);
    event DeskNotionalCapQueued(uint256 value, uint256 readyAt);
    event DeskNotionalCapSet(uint256 value);

    modifier onlyDesk() {
        if (!isDesk[msg.sender]) revert E.UnknownDesk(msg.sender);
        _;
    }

    constructor(IERC20 ausd, address operator, address treasury, uint256 capIncreaseDelay_)
        ERC20("Imprest Pool AUSD", "ipAUSD")
        ERC4626(ausd)
        Ownable(operator)
    {
        protocolTreasury = treasury;
        capIncreaseDelay = capIncreaseDelay_;
    }

    // ------------------------------------------------------------------
    // Operator
    // ------------------------------------------------------------------

    /// @notice One-time wiring of the factory that is allowed to register desks.
    function setFactory(address factory_) external onlyOwner {
        if (factory != address(0)) revert E.InvalidParams(1);
        factory = factory_;
        emit FactorySet(factory_);
    }

    function setTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert E.InvalidParams(2);
        protocolTreasury = treasury;
        emit TreasurySet(treasury);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    /// @notice Lowering a cap is immediate; raising it is queued behind the timelock.
    ///         Bootstrap: before the factory is wired no desk can exist, so initial caps
    ///         apply immediately; from wiring onwards every increase is timelocked.
    function setGrossCap(uint256 perpId, uint256 value) external onlyOwner {
        if (value <= grossCap[perpId] || factory == address(0)) {
            grossCap[perpId] = value;
            delete pendingGrossCap[perpId];
            emit GrossCapSet(perpId, value);
        } else {
            uint256 readyAt = block.timestamp + capIncreaseDelay;
            pendingGrossCap[perpId] = Pending(value, readyAt);
            emit GrossCapQueued(perpId, value, readyAt);
        }
    }

    function applyGrossCap(uint256 perpId) external {
        Pending memory p = pendingGrossCap[perpId];
        if (p.readyAt == 0) revert E.NoQueuedChange();
        if (block.timestamp < p.readyAt) revert E.TimelockNotReady(p.readyAt);
        grossCap[perpId] = p.value;
        delete pendingGrossCap[perpId];
        emit GrossCapSet(perpId, p.value);
    }

    function setDeskNotionalCap(uint256 value) external onlyOwner {
        if (value <= deskNotionalCap || factory == address(0)) {
            deskNotionalCap = value;
            delete pendingDeskNotionalCap;
            emit DeskNotionalCapSet(value);
        } else {
            uint256 readyAt = block.timestamp + capIncreaseDelay;
            pendingDeskNotionalCap = Pending(value, readyAt);
            emit DeskNotionalCapQueued(value, readyAt);
        }
    }

    function applyDeskNotionalCap() external {
        Pending memory p = pendingDeskNotionalCap;
        if (p.readyAt == 0) revert E.NoQueuedChange();
        if (block.timestamp < p.readyAt) revert E.TimelockNotReady(p.readyAt);
        deskNotionalCap = p.value;
        delete pendingDeskNotionalCap;
        emit DeskNotionalCapSet(p.value);
    }

    // ------------------------------------------------------------------
    // Factory / desks
    // ------------------------------------------------------------------

    function registerDesk(address desk) external {
        if (msg.sender != factory) revert E.Unauthorized(msg.sender);
        isDesk[desk] = true;
        emit DeskRegistered(desk);
    }

    /// @notice Lends idle AUSD to a graduating desk. Only a factory desk can draw, and
    ///         only for itself. Paused pools fund nothing.
    function fundDesk(address desk, uint256 credit) external onlyDesk nonReentrant {
        if (desk != msg.sender) revert E.Unauthorized(msg.sender);
        if (paused) revert E.Paused();
        if (deskSettled[desk]) revert E.AlreadySettled();
        if (credit > idleAssets) revert E.InsufficientIdle(credit, idleAssets);
        idleAssets -= credit;
        deployedPrincipal += credit;
        principalOf[desk] += credit;
        IERC20(asset()).safeTransfer(desk, credit);
        emit DeskFunded(desk, credit, idleAssets);
    }

    /// @notice Gross-cap headroom check for an exposure *increase* of `grossNotional`.
    function canIncreaseExposure(uint256 perpId, uint256 grossNotional) external view returns (bool) {
        return grossExposure[perpId] + grossNotional <= grossCap[perpId];
    }

    /// @notice Same-transaction exposure accounting. `oldGross` must equal what the pool
    ///         already holds for this desk and perp, so a desk cannot under-report.
    ///         Increases are checked against both caps; decreases always succeed.
    function recordExposure(uint256 perpId, uint256 oldGross, uint256 newGross) external onlyDesk {
        if (deskExposure[msg.sender][perpId] != oldGross) revert E.SettlementMismatch();
        uint256 perpGross = grossExposure[perpId] - oldGross + newGross;
        uint256 dGross = deskGross[msg.sender] - oldGross + newGross;
        if (newGross > oldGross) {
            if (perpGross > grossCap[perpId]) revert E.ExposureCapReached(perpId, perpGross, grossCap[perpId]);
            if (dGross > deskNotionalCap) revert E.DeskNotionalCapReached(dGross, deskNotionalCap);
        }
        grossExposure[perpId] = perpGross;
        deskGross[msg.sender] = dGross;
        deskExposure[msg.sender][perpId] = newGross;
        emit ExposureRecorded(msg.sender, perpId, oldGross, newGross, perpGross);
    }

    /// @notice Uncapped exposure update for reduce-only fills and settlement. A desk only
    ///         calls this when the order it just executed was reduce-only, so reductions
    ///         stay possible even when the mark moved since the last record (PRD
    ///         invariant 13: "reducing trades always remain possible").
    function releaseExposure(uint256 perpId, uint256 oldGross, uint256 newGross) external onlyDesk {
        if (deskExposure[msg.sender][perpId] != oldGross) revert E.SettlementMismatch();
        grossExposure[perpId] = grossExposure[perpId] - oldGross + newGross;
        deskGross[msg.sender] = deskGross[msg.sender] - oldGross + newGross;
        deskExposure[msg.sender][perpId] = newGross;
        emit ExposureRecorded(msg.sender, perpId, oldGross, newGross, grossExposure[perpId]);
    }

    /// @notice Realized income from a claim: netted credit fees plus the pool's profit
    ///         share. Pulled, so only cash that actually arrives is booked.
    function receiveIncome(uint256 feesCollected, uint256 profitShare) external onlyDesk nonReentrant {
        uint256 amount = feesCollected + profitShare;
        if (amount == 0) return;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        idleAssets += amount;
        totalFeesCollected += feesCollected;
        totalProfitShare += profitShare;
        emit IncomeReceived(msg.sender, feesCollected, profitShare);
    }

    /// @notice Final settlement of a closing desk. principalRepaid + principalLoss must
    ///         equal the desk's outstanding principal; repayment and fees are pulled.
    function settleDesk(uint256 principalRepaid, uint256 feesCollected, uint256 principalLoss, uint256 feesWrittenOff)
        external
        onlyDesk
        nonReentrant
    {
        address desk = msg.sender;
        if (deskSettled[desk]) revert E.AlreadySettled();
        if (principalRepaid + principalLoss != principalOf[desk]) revert E.SettlementMismatch();
        if (deskGross[desk] != 0) revert E.SettlementMismatch(); // exposure must be released first
        deskSettled[desk] = true;
        uint256 pull = principalRepaid + feesCollected;
        if (pull > 0) IERC20(asset()).safeTransferFrom(desk, address(this), pull);
        principalOf[desk] = 0;
        deployedPrincipal -= principalRepaid + principalLoss;
        idleAssets += pull;
        totalPrincipalLoss += principalLoss;
        totalFeesCollected += feesCollected;
        totalFeesWrittenOff += feesWrittenOff;
        emit DeskSettled(desk, principalRepaid, feesCollected, principalLoss, feesWrittenOff);
    }

    // ------------------------------------------------------------------
    // ERC4626: NAV is idle + deployed principal at par; LPs withdraw idle only.
    // ------------------------------------------------------------------

    function totalAssets() public view override returns (uint256) {
        return idleAssets + deployedPrincipal;
    }

    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 a = super.maxWithdraw(owner_);
        return a < idleAssets ? a : idleAssets;
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 s = super.maxRedeem(owner_);
        uint256 idleShares = convertToShares(idleAssets);
        return s < idleShares ? s : idleShares;
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        super._deposit(caller, receiver, assets, shares);
        idleAssets += assets;
        lpDeposited += assets;
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        if (assets > idleAssets) revert E.InsufficientIdle(assets, idleAssets);
        idleAssets -= assets;
        lpWithdrawn += assets;
        super._withdraw(caller, receiver, owner_, assets, shares);
    }
}
