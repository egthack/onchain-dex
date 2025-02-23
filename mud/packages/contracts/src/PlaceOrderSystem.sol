// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { Order, OrderCounter } from "./codegen/index.sol";

contract PlaceOrderSystem is System {
  function placeOrder(address baseToken, address quoteToken, uint256 amount, uint256 price) public {
    address user = msg.sender;
    uint256 timestamp = block.timestamp;

    uint256 currentOrderCount = OrderCounter.get();
    bool isBuy;
    bool active;
    uint256 remainder = currentOrderCount % 4;
    if (remainder == 0) {
        isBuy = true;
        active = true;
    } else if (remainder == 1) {
        isBuy = true;
        active = false;
    } else if (remainder ==2) {
        isBuy = false;
        active = true;
    } else if (remainder ==3) {
        isBuy = false;
        active = false;
    }

    OrderCounter.set(currentOrderCount + 1);
    
    Order.set(currentOrderCount, user, baseToken, quoteToken, price, amount, isBuy, active, timestamp);
  }
}
