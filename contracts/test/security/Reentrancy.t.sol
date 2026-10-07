// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ImprestFixture} from "../ImprestFixture.sol";
import {Desk} from "../../src/Desk.sol";
import {IPerplExchange} from "../../src/interfaces/IPerplExchange.sol";
import {Order} from "../../src/libraries/ImprestTypes.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Installed with vm.mockFunction, so it runs in the exchange's storage context;
///      its configuration lives at dedicated slots that cannot collide with Perpl's.
contract ReenteringVenue {
    bytes32 internal constant TARGET_SLOT = keccak256("imprest.test.reenter.target");
    bytes32 internal constant MODE_SLOT = keccak256("imprest.test.reenter.mode");

    function execOrder(IPerplExchange.OrderDesc calldata d) external returns (IPerplExchange.OrderSignature memory) {
        uint256 m;
        address target;
        bytes32 ts = TARGET_SLOT;
        bytes32 ms = MODE_SLOT;
        assembly {
            m := sload(ms)
            target := sload(ts)
        }
        if (m != 0) {
            assembly {
                sstore(ms, 0)
            }
            bytes memory call;
            if (m == 1) call = abi.encodeCall(Desk.claim, ());
            else if (m == 2) call = abi.encodeCall(Desk.enforce, ());
            else if (m == 3) call = abi.encodeCall(Desk.trade, (Order(d.perpId, 0, d.pricePNS, 1, 100, false, false)));
            else if (m == 4) call = abi.encodeCall(Desk.close, ());
            else call = abi.encodeCall(Desk.graduate, ());
            (bool ok, bytes memory ret) = target.call(call);
            require(!ok, "reentry succeeded");
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        return IPerplExchange.OrderSignature(0, 0);
    }
}

/// @notice Every desk entry point is nonReentrant: a venue (or token) callback that
///         re-enters claim/enforce/trade/close/graduate mid-order reverts the whole
///         transaction. Uses vm.etch to put a re-entering wrapper at the exchange
///         address the desk calls, which is the strongest available model of a
///         malicious external call.
contract ReentrancyTest is ImprestFixture {
    Desk desk;

    function setUp() public override {
        super.setUp();
        desk = _openDesk(traderA, demoCohort, STAKE);
    }

    function _armAndTrade(uint8 mode) internal {
        // Install a re-entering venue in front of the desk by mocking execOrder to
        // forward to a contract that calls back into the desk.
        ReenteringVenue v = new ReenteringVenue();
        vm.store(address(ex), keccak256("imprest.test.reenter.target"), bytes32(uint256(uint160(address(desk)))));
        vm.store(address(ex), keccak256("imprest.test.reenter.mode"), bytes32(uint256(mode)));
        Order memory o = _buy(BTC, 10, 500);
        vm.mockFunction(address(ex), address(v), abi.encodeWithSelector(IPerplExchange.execOrder.selector));
        vm.prank(traderA);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        desk.trade(o);
    }

    function test_reentry_claimDuringTrade() public {
        _armAndTrade(1);
    }

    function test_reentry_enforceDuringTrade() public {
        _armAndTrade(2);
    }

    function test_reentry_tradeDuringTrade() public {
        _armAndTrade(3);
    }

    function test_reentry_closeDuringTrade() public {
        _armAndTrade(4);
    }

    function test_reentry_graduateDuringTrade() public {
        _armAndTrade(5);
    }
}
