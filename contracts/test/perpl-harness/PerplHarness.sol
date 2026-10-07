// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IPerplExchange, IPerplExchangeAdmin} from "../../src/interfaces/IPerplExchange.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITestToken is IERC20 {
    function mint(address to, uint256 amount) external;
    function decimals() external view returns (uint8);
}

/// @notice Stands up Perpl's own exchange bytecode (perpl-sdk rc_v1.1.7-203) on the
///         local Foundry EVM, mirroring perpl-sdk's TestExchange setup: test USD
///         token, exchange implementation behind ERC1967Proxy, whitelist off,
///         admin + price admin roles, BTC/ETH perps with oracle ignored and a mark.
/// @dev    Perp ids mirror Perpl testnet (BTC=16, ETH=32) and decimals mirror the
///         live testnet listing read on 2026-10-07 (BTC price 1dp / lot 5dp,
///         ETH price 2dp / lot 3dp). This is a LOCAL_REPRODUCTION, never a
///         network result.
abstract contract PerplHarness is Test {
    uint256 internal constant BTC = 16;
    uint256 internal constant ETH = 32;
    uint256 internal constant BTC_PRICE_DEC = 1;
    uint256 internal constant BTC_LOT_DEC = 5;
    uint256 internal constant ETH_PRICE_DEC = 2;
    uint256 internal constant ETH_LOT_DEC = 3;

    IPerplExchangeAdmin internal ex;
    ITestToken internal usd;

    address internal perplOwner = makeAddr("perplOwner");
    address internal perplAdmin = makeAddr("perplAdmin");
    address internal priceAdmin = makeAddr("priceAdmin");
    address internal maker = makeAddr("maker");

    uint256 internal makerDescId;

    function _deployBytecode(string memory hexPath, bytes memory ctorArgs) internal returns (address addr) {
        bytes memory code = abi.encodePacked(vm.parseBytes(vm.readFile(hexPath)), ctorArgs);
        assembly {
            addr := create(0, add(code, 0x20), mload(code))
        }
        require(addr != address(0), string.concat("deploy failed: ", hexPath));
    }

    function _setUpPerpl() internal {
        vm.roll(1_000);
        vm.warp(1_790_000_000);
        vm.startPrank(perplOwner);
        usd = ITestToken(
            _deployBytecode("perpl-artifacts/TestToken.creation.hex", abi.encode("Test USD", "USD", uint8(6)))
        );
        address impl = _deployBytecode("perpl-artifacts/Exchange.creation.hex", "");
        bytes memory init = abi.encodeCall(IPerplExchangeAdmin.initialize, (address(usd)));
        ex = IPerplExchangeAdmin(_deployBytecode("perpl-artifacts/ERC1967Proxy.creation.hex", abi.encode(impl, init)));
        ex.setWhitelistingEnabled(false);
        ex.setAdministrator(perplAdmin, true);
        ex.setPriceAdministrator(priceAdmin, true);
        ex.setPositionAdministrator(perplAdmin, true); // venue liquidations
        // Initial/maintenance "margin fractions" are leverage multiples in hundredths,
        // matching live testnet: BTC 15x / 25x, ETH 12x / 20x.
        ex.addContract("BTC", "BTC", BTC, 50_000, BTC_PRICE_DEC, BTC_LOT_DEC, 1500, 2500);
        ex.setIgnOracle(BTC, true);
        ex.addContract("ETH", "ETH", ETH, 1, ETH_PRICE_DEC, ETH_LOT_DEC, 1200, 2000);
        ex.setIgnOracle(ETH, true);
        vm.stopPrank();
        _setMark(BTC, 1_000_000); // 100,000.0
        _setMark(ETH, 400_000); //   4,000.00
        vm.startPrank(perplOwner);
        ex.setContractPaused(BTC, false);
        ex.setContractPaused(ETH, false);
        vm.stopPrank();

        // A market maker with deep balance provides resting liquidity on both sides.
        usd.mint(maker, 100_000_000e6);
        vm.startPrank(maker);
        usd.approve(address(ex), type(uint256).max);
        ex.createAccount(50_000_000e6);
        vm.stopPrank();
    }

    function _setMark(uint256 perpId, uint256 markPNS) internal {
        vm.prank(priceAdmin);
        ex.updateMarkPricePNS(perpId, uint32(markPNS));
    }

    /// @dev Posts a resting maker order (postOnly, GTC) from the maker account.
    function _makerQuote(uint256 perpId, uint8 orderType, uint256 pricePNS, uint256 lots) internal {
        IPerplExchange.OrderDesc memory d;
        d.orderDescId = ++makerDescId;
        d.perpId = perpId;
        d.orderType = orderType;
        d.pricePNS = pricePNS;
        d.lotLNS = lots;
        d.postOnly = true;
        d.leverageHdths = 100; // 1x maker
        d.maxNegPnlCollatBPS = 10_000;
        vm.prank(maker);
        ex.execOrder(d);
    }

    /// @dev Two-sided book: `levels` price levels each side, `step` PNS apart, `lots` per level.
    function _seedBook(uint256 perpId, uint256 mid, uint256 step, uint256 lots, uint256 levels) internal {
        for (uint256 i = 1; i <= levels; i++) {
            _makerQuote(perpId, 0, mid - i * step, lots); // bids (OpenLong)
            _makerQuote(perpId, 1, mid + i * step, lots); // asks (OpenShort)
        }
    }

    /// @dev Seeds a perp's insurance fund through the protocol balance, as a live venue has.
    function _fundInsurance(uint256 perpId, uint256 amount) internal {
        usd.mint(perplOwner, amount);
        vm.startPrank(perplOwner);
        usd.approve(address(ex), amount);
        ex.depositToProtocol(amount);
        ex.xferProtocolToPerp(perpId, amount, true);
        vm.stopPrank();
    }

    function _fund(address who, uint256 amount) internal {
        usd.mint(who, amount);
    }
}
