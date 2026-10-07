// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice A trader's order intent. There is deliberately no "resting" flag: every
///         order is immediate-or-cancel unless `fillOrKill` is set, so a resting order
///         that could fill later without a policy check cannot be expressed.
/// @param perpId     Perpl perpetual id (must be allowlisted by the desk's cohort)
/// @param side       0 = buy, 1 = sell
/// @param priceLimit limit price in the perp's price native scale (PNS)
/// @param lots       size in the perp's lot native scale (LNS)
/// @param leverage   leverage in hundredths (500 = 5.00x)
/// @param reduceOnly true closes/reduces an existing position only
/// @param fillOrKill true = FOK, false = IOC
struct Order {
    uint256 perpId;
    uint8 side;
    uint256 priceLimit;
    uint256 lots;
    uint256 leverage;
    bool reduceOnly;
    bool fillOrKill;
}

struct Market {
    uint256 perpId;
    uint8 priceDecimals;
    uint8 lotDecimals;
}

/// @notice Parameters of one credit tier. Requirements describe how a desk *enters*
///         this tier from the previous one; tier 0 requirements are unused.
struct TierParams {
    uint16 sizeMultiple; //          desk size as a multiple of the original stake (tier 0 = 1)
    uint32 feeRatePpmPerDay; //      position-use credit fee on borrowed principal, ppm per day
    uint16 traderSplitBps; //        share of eligible profit paid to the trader
    uint16 protocolSplitBps; //      share of eligible profit paid to the protocol (pool gets the rest)
    uint16 gradProfitBps; //         required equity gain over tier start equity
    uint16 gradMinClosedTrades; //   required round trips closed in the previous tier
    uint32 gradMinSeconds; //        required time spent in the previous tier
    uint16 gradMinClaims; //         required paid-out profit claims in the previous tier
}

/// @notice Immutable policy a desk runs under. Snapshotted into the desk at creation,
///         so no operator action can change a live desk's floor, limits or splits.
struct CohortParams {
    bytes32 name;
    bool demo; //                    labeled demo cohort (relaxed graduation rules)
    uint256 minStake; //             AUSD base units
    uint16 maxDrawdownBps; //        floor = start equity * (1 - maxDrawdownBps)
    uint16 dailyLossBps; //          daily floor = equity at first trade of UTC day * (1 - dailyLossBps)
    uint16 maxLeverageHdths; //      500 = 5x
    uint16 priceBandBps; //          max distance of a limit price from mark, closes included
    uint16 maxNegPnlBps; //          stamped into Perpl maxNegPnlCollatBPS
    uint8 execBlockWindow; //        stamped lastExecutionBlock = block.number + window
    uint16 enforceSliceBandBps; //   enforce() closes at mark -/+ this band
    uint16 feeCapBps; //             outstanding fee liability cap, share of original stake
    uint256 keeperBounty; //         configured bounty, paid at most once from residual equity
    uint8 tierCount; //              number of active tiers (1..3)
    TierParams[3] tiers;
    Market[] markets;
}

enum DeskStatus {
    Active,
    Enforcing,
    Closed
}

enum EnforceReason {
    None,
    TradingFloor,
    DailyLoss,
    FeeCap
}

/// @notice Named errors. Every one maps to a human-readable message in the app
///         (web/src/lib/errors.ts) so a contract rejection is never shown as a
///         generic failure.
library ImprestErrors {
    error Unauthorized(address caller);
    error MarketNotAllowed(uint256 perpId);
    error InvalidSide(uint8 side);
    error InvalidLots();
    error LeverageExceeded(uint256 requested, uint256 maximum);
    error PriceOutsideBand(uint256 priceLimit, uint256 markPrice, uint256 bandBps);
    error MarkStale(uint256 perpId);
    error FloorBreach(int256 equity, int256 floor);
    error DailyLossExceeded(int256 equity, int256 dailyFloor);
    error ReduceOnlyInvalid(uint256 perpId);
    error FeeCapReached(uint256 outstanding, uint256 cap);
    error ExposureCapReached(uint256 perpId, uint256 newGross, uint256 cap);
    error DeskNotionalCapReached(uint256 newDeskGross, uint256 cap);
    error NonceInvalid(uint256 nonce, uint256 lastNonce);
    error DeadlineExpired(uint256 deadline, uint256 nowTs);
    error InvalidSignature();
    error PositionNotFlat(uint256 perpId);
    error NothingToClaim();
    error DeskNotActive(uint8 status);
    error DeskHealthy();
    error GraduationNotEligible(uint8 code);
    error MaxTierReached();
    error Paused();
    error StakeTooLow(uint256 stake, uint256 minimum);
    error CohortInactive(uint256 cohortId);
    error InvalidParams(uint8 code);
    error InsufficientIdle(uint256 requested, uint256 idle);
    error AlreadySettled();
    error SettlementMismatch();
    error UnknownDesk(address desk);
    error TimelockNotReady(uint256 readyAt);
    error NoQueuedChange();
}
