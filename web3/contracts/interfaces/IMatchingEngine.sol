// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @notice IMatchingEngine interface
 * @dev The matching engine places orders, performs matching and returns the output amount (tokenOut)
 *      after executing the trade. Order side: 0 for Buy, 1 for Sell.
 */
interface IMatchingEngine {
    /**
     * @notice Places an order on the matching engine.
     * @param tokenIn The token being sold.
     * @param tokenOut The token being bought.
     * @param side The order side (0: Buy, 1: Sell).
     * @param amountIn The amount of tokenIn to sell.
     * @param minAmountOut The minimum acceptable amount of tokenOut.
     * @return outAmount The actual amount of tokenOut received after matching.
     */
    function placeOrder(
        address tokenIn,
        address tokenOut,
        uint8 side,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 outAmount);
}
