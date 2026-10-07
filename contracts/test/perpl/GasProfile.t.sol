// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ImprestFixture} from "../ImprestFixture.sol";
import {Desk} from "../../src/Desk.sol";

/// @notice Measures gas of guarded desk operations against Perpl's own bytecode.
///         Foundry charges Ethereum (Cancun) gas, NOT Monad's schedule (Monad prices
///         cold state access higher and charges the gas LIMIT, not gas used). Output is
///         LOCAL_REPRODUCTION input for keeper economics, never a Monad cost claim.
contract GasProfileTest is ImprestFixture {
    function test_gas_profile() public {
        Desk d = _openDesk(traderA, demoCohort, STAKE);
        uint256 g;

        g = gasleft();
        _trade(d, _buy(BTC, 400, 500));
        uint256 tradeOpen = g - gasleft();

        _moveBtc(btcMark * 101 / 100);
        g = gasleft();
        _trade(d, _closeLong(BTC, 400));
        uint256 tradeClose = g - gasleft();

        _profitableRoundTrip(d, 400, 100);
        g = gasleft();
        d.graduate();
        uint256 graduate = g - gasleft();

        _trade(d, _buy(BTC, 2_400, 500));
        _moveBtc(btcMark * 97 / 100);
        vm.prank(keeper);
        g = gasleft();
        d.enforce();
        uint256 enforceSettle = g - gasleft();

        string memory k = "gas";
        vm.serializeString(k, "status", "LOCAL_REPRODUCTION");
        vm.serializeString(k, "gas_schedule", "Foundry 1.5.1 EVM (cancun), Ethereum pricing - not Monad pricing");
        vm.serializeString(k, "note", "includes test-harness prank/call overhead of a few thousand gas");
        vm.serializeUint(k, "guarded_trade_open", tradeOpen);
        vm.serializeUint(k, "guarded_trade_close", tradeClose);
        vm.serializeUint(k, "graduate_with_funding", graduate);
        string memory json = vm.serializeUint(k, "enforce_full_close_and_settle", enforceSettle);
        vm.writeJson(json, "../proof/local/gas-profile.json");
        emit log_named_uint("guarded trade (open)", tradeOpen);
        emit log_named_uint("guarded trade (close)", tradeClose);
        emit log_named_uint("graduate (funds desk)", graduate);
        emit log_named_uint("enforce (close + settle)", enforceSettle);
    }
}
