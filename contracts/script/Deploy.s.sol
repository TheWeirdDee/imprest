// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ImprestPool} from "../src/ImprestPool.sol";
import {DeskFactory} from "../src/DeskFactory.sol";
import {IPerplExchange} from "../src/interfaces/IPerplExchange.sol";
import {Market, TierParams, CohortParams} from "../src/libraries/ImprestTypes.sol";

/// @notice Deploys ImprestPool + DeskFactory against the Perpl exchange and AUSD listed in
///         config/networks.json for IMPREST_ENV, registers the cohorts and sets the
///         bootstrap risk caps BEFORE wiring the factory (after wiring, cap increases are
///         timelocked).
///
///   IMPREST_ENV=testnet forge script script/Deploy.s.sol --rpc-url monad_testnet \
///     --private-key $DEPLOYER_PRIVATE_KEY --broadcast --slow
///
/// Then: pnpm --filter imprest-scripts sync-deployment (writes receipts and config)
contract Deploy is Script {
    struct Caps {
        uint256 grossPerPerp;
        uint256 deskNotional;
    }

    function run() external {
        string memory env = vm.envOr("IMPREST_ENV", string("testnet"));
        require(keccak256(bytes(env)) != keccak256("mainnet") || vm.envOr("ALLOW_MAINNET", false), "mainnet deploy needs ALLOW_MAINNET=true");
        string memory cfg = vm.readFile("../config/networks.json");
        string memory k = string.concat(".", env);
        IPerplExchange exchange = IPerplExchange(vm.parseJsonAddress(cfg, string.concat(k, ".perpl.exchange")));
        IERC20 ausd = IERC20(vm.parseJsonAddress(cfg, string.concat(k, ".perpl.collateralToken")));
        uint256 chainId = vm.parseJsonUint(cfg, string.concat(k, ".chainId"));
        require(block.chainid == chainId, "RPC chain id does not match config");

        address deployer = msg.sender;
        address operator = vm.envOr("IMPREST_OPERATOR", deployer);
        address treasury = vm.envOr("IMPREST_TREASURY", deployer);
        uint256 venueMin = exchange.getMinAccountOpenCNS();

        Market[] memory markets = new Market[](2);
        for (uint256 i; i < 2; i++) {
            string memory mk = string.concat(k, ".perpl.markets[", vm.toString(i), "]");
            markets[i] = Market(
                vm.parseJsonUint(cfg, string.concat(mk, ".perpId")),
                uint8(vm.parseJsonUint(cfg, string.concat(mk, ".priceDecimals"))),
                uint8(vm.parseJsonUint(cfg, string.concat(mk, ".lotDecimals")))
            );
        }

        // Caps calibrated from the paired-desk self-attack (proof/experiments/paired-desk):
        // a per-desk notional cap of 2x desk size kept pool net ~0 under a 15% gap.
        uint256 minStake = venueMin > 20e6 ? venueMin : 20e6;
        Caps memory caps = Caps({grossPerPerp: 10 * minStake * 5, deskNotional: 2 * minStake * 5});

        vm.startBroadcast();
        ImprestPool pool = new ImprestPool(ausd, deployer, treasury, 1 days);
        for (uint256 i; i < markets.length; i++) {
            pool.setGrossCap(markets[i].perpId, caps.grossPerPerp);
        }
        pool.setDeskNotionalCap(caps.deskNotional);
        DeskFactory factory = new DeskFactory(pool, exchange, deployer);
        pool.setFactory(address(factory));
        uint256 demo = factory.addCohort(_cohort("demo-v0", true, minStake, markets));
        uint256 standard = factory.addCohort(_cohort("standard-v0", false, minStake, markets));
        if (operator != deployer) {
            pool.transferOwnership(operator);
            factory.transferOwnership(operator);
        }
        vm.stopBroadcast();

        console2.log("ImprestPool", address(pool));
        console2.log("DeskFactory", address(factory));
        console2.log("cohort demo-v0", demo);
        console2.log("cohort standard-v0", standard);
        console2.log("minStake", minStake);
        console2.log("gross cap per perp", caps.grossPerPerp);
        console2.log("desk notional cap", caps.deskNotional);
    }

    /// PRD v3 policy. The demo cohort is labeled demo and graduates at +2% after two
    /// trades with no time minimum; the standard cohort uses the PRD tiers.
    function _cohort(bytes32 name, bool demo, uint256 minStake, Market[] memory markets)
        internal
        pure
        returns (CohortParams memory c)
    {
        c.name = name;
        c.demo = demo;
        c.minStake = minStake;
        c.maxDrawdownBps = 600;
        c.dailyLossBps = 300;
        c.maxLeverageHdths = 500;
        c.priceBandBps = 50;
        c.maxNegPnlBps = 50;
        c.execBlockWindow = 2;
        c.enforceSliceBandBps = 100;
        c.feeCapBps = 2_500;
        c.keeperBounty = 0.5e6;
        c.tiers[0] = TierParams(1, 0, 10_000, 0, 0, 0, 0, 0);
        if (demo) {
            c.tierCount = 2;
            c.tiers[1] = TierParams(5, 500, 8_000, 500, 200, 2, 0, 0);
        } else {
            c.tierCount = 3;
            c.tiers[1] = TierParams(5, 500, 8_000, 500, 800, 5, 1 days, 0);
            c.tiers[2] = TierParams(10, 300, 8_500, 375, 0, 0, 14 days, 1);
        }
        c.markets = markets;
    }
}
