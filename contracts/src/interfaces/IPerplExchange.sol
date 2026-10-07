// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal Perpl exchange interface used by Imprest desks.
/// @dev Signatures and struct layouts are copied from the Exchange ABI shipped in
///      perpl-sdk (crates.io, MIT), revision rc_v1.1.7-203-g0e5902dd. See
///      contracts/perpl-artifacts/MANIFEST.json for the artifact hashes.
///
///      Units: CNS = collateral native scale (AUSD, 6 decimals); PNS = price native
///      scale (perp priceDecimals); LNS = lot native scale (perp lotDecimals);
///      Hdths = hundredths (leverage 500 = 5.00x).
interface IPerplExchange {
    /// orderType: 0 OpenLong, 1 OpenShort, 2 CloseLong, 3 CloseShort, 4 Cancel,
    /// 5 IncreasePositionCollateral, 6 Change.
    struct OrderDesc {
        uint256 orderDescId;
        uint256 perpId;
        uint8 orderType;
        uint256 orderId;
        uint256 pricePNS;
        uint256 lotLNS;
        uint256 expiryBlock;
        bool postOnly;
        bool fillOrKill;
        bool immediateOrCancel;
        uint256 maxMatches;
        uint256 leverageHdths;
        uint256 lastExecutionBlock;
        uint256 amountCNS;
        uint256 maxNegPnlCollatBPS;
    }

    struct OrderSignature {
        uint256 perpId;
        uint256 orderId;
    }

    struct PositionBitMap {
        uint256 bank1;
        uint256 bank2;
        uint256 bank3;
        uint256 bank4;
    }

    struct AccountInfo {
        uint256 accountId;
        uint256 balanceCNS;
        uint256 lockedBalanceCNS;
        uint8 frozen;
        address accountAddr;
        PositionBitMap positions;
    }

    /// positionType: 0 Long, 1 Short.
    struct PositionInfo {
        uint256 accountId;
        uint256 nextNodeId;
        uint256 prevNodeId;
        uint8 positionType;
        uint256 depositCNS;
        uint256 pricePNS;
        uint256 lotLNS;
        uint256 entryBlock;
        int256 pnlCNS;
        int256 deltaPnlCNS;
        int256 premiumPnlCNS;
    }

    struct PerpetualInfo {
        string name;
        string symbol;
        uint256 priceDecimals;
        uint256 lotDecimals;
        bytes32 linkFeedId;
        uint256 priceTolPer100K;
        uint256 marginTol;
        uint256 marginTolDecimals;
        uint256 refPriceMaxAgeSec;
        uint256 positionBalanceCNS;
        uint256 insuranceBalanceCNS;
        uint256 markPNS;
        uint256 markTimestamp;
        uint256 lastPNS;
        uint256 lastTimestamp;
        uint256 oraclePNS;
        uint256 oracleTimestampSec;
        uint256 longOpenInterestLNS;
        uint256 shortOpenInterestLNS;
        uint256 fundingStartBlock;
        int16 fundingRatePct100k;
        uint256 absFundingClampPctPer100K;
        uint8 status;
        uint256 basePricePNS;
        uint256 maxBidPriceONS;
        uint256 minBidPriceONS;
        uint256 maxAskPriceONS;
        uint256 minAskPriceONS;
        uint256 numOrders;
        bool ignOracle;
    }

    // ---- account ----
    function createAccount(uint256 amountCNS) external returns (uint256);
    function depositCollateral(uint256 amountCNS) external;
    function withdrawCollateral(uint256 amountCNS) external;

    // ---- trading ----
    function execOrder(OrderDesc calldata orderDesc) external returns (OrderSignature memory);

    // ---- views ----
    function getAccountByAddr(address accountAddress) external view returns (AccountInfo memory);
    function getPosition(uint256 perpId, uint256 accountId)
        external
        view
        returns (PositionInfo memory positionInfo, uint256 markPricePNS, bool markPriceValid);
    function getPerpetualInfo(uint256 perpId) external view returns (PerpetualInfo memory);
    function getMinAccountOpenCNS() external view returns (uint256);
    function getExchangeInfo()
        external
        view
        returns (
            uint256 balanceCNS,
            uint256 protocolBalanceCNS,
            uint256 recycleBalanceCNS,
            uint256 collateralDecimals,
            address collateralToken,
            address verifierProxy
        );
    function whitelistingEnabled() external view returns (bool);
    function whitelisted(address) external view returns (bool);
    function getWithdrawAllowanceData(uint256 blockNumber)
        external
        view
        returns (uint256 allowanceCNS, uint256 expiryBlock, uint256 lastAllowanceBlock, uint256 cnsPerBlock);
    function getContractVersion() external view returns (uint256, uint256, uint256);
    function perpetualExists(uint256 perpId) external view returns (bool);
    function isHalted() external view returns (bool);
    function getTakerFee(uint256 perpId) external view returns (uint256);
}

/// @notice Admin surface of the Perpl exchange. Used ONLY by the local bytecode
///         harness to stand up markets; production Imprest contracts never call it.
interface IPerplExchangeAdmin is IPerplExchange {
    function initialize(address collateralToken) external;
    function setWhitelistingEnabled(bool enabled) external;
    function setAddressWhitelisted(address[] calldata addresses, bool whitelisted_) external;
    function setAdministrator(address administrator, bool add) external;
    function setPriceAdministrator(address priceAdministrator, bool add) external;
    function addContract(
        string calldata name,
        string calldata symbol,
        uint256 perpId,
        uint256 basePricePNS,
        uint256 priceDecimals,
        uint256 lotDecimals,
        uint256 initMarginFracHdths,
        uint256 maintMarginFracHdths
    ) external;
    function setIgnOracle(uint256 perpId, bool ignOracle) external;
    function updateMarkPricePNS(uint256 perpId, uint32 markPricePNS) external;
    function setContractPaused(uint256 perpId, bool paused) external;
    function setExchangeHalted(bool halted) external;
    function setFrozen(address account, uint8 status) external;
    function setDefaultPerpFeeSchedValues(uint256[8] calldata takerFeesPPM, uint256[8] calldata makerFeesPPM)
        external;
    function setPriceMaxAge(uint256 perpId, uint256 maxAgeSec) external;
    function setFundingSum(uint256 perpId, int256 fundingRatePct100k, uint32 pricePNS, bool allowOverwrite, bool revertOnFail)
        external;
    function setThousandthsTvlWRLS(uint256 thousandthsTvl) external;
    function setMinWithdrawLimit(uint256 limitCNS) external;
    function depositToProtocol(uint256 amountCNS) external;
    struct LiquidationDesc {
        uint256 perpId;
        uint256 posAccountId;
        uint256 lotLNS;
        bool userProceedsToPosition;
    }
    function liquidation(LiquidationDesc calldata liquidationDesc) external;
    struct AdlDesc {
        uint256 perpId;
        uint256 posAccountId;
        uint256[] sortedPositionIds;
    }
    function autoDeleverage(AdlDesc[] calldata adlDescs, bool revertOnFail) external;
    function setLiquidationBuyer(address liquidationBuyer, bool add) external;
    function setPositionAdministrator(address positionAdministrator, bool add) external;
    function xferProtocolToPerp(uint256 perpId, uint256 amountCNS, bool insurance) external;
}
