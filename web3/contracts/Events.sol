// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IMatchingEngine.sol";

event Deposit(address indexed user, address indexed token, uint256 amount);
event Withdrawal(address indexed user, address indexed token, uint256 amount);
event TraderApprovalSet(address indexed user, address indexed trader, bool approved, uint256 maxOrderSize, uint256 expiry);
event TradeExecuted(
    uint256 indexed makerOrderId,
    uint256 indexed takerOrderId,
    address base,
    address quote,
    uint256 price,
    uint256 amount,
    uint256 makerFee,
    uint256 takerFee
);
event OrderPlaced(
    uint256 indexed orderId,
    address indexed user,
    IMatchingEngine.OrderSide side,
    address base,
    address quote,
    uint256 price,
    uint256 amount
);
event OrderCancelled(uint256 indexed orderId, address indexed user);
event PairAdded(bytes32 indexed pairId, address base, address quote, uint256[2] decimals, uint256 timestamp);
event FeeRatesUpdated(uint256 makerFeeRate, uint256 takerFeeRate);
event FeesWithdrawn(address indexed token, uint256 makerFeeAmount, uint256 takerFeeAmount);
event VaultAddressUpdated(address indexed vault);