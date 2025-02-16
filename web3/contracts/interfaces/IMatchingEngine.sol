// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @notice IMatchingEngine interface
 * @dev The matching engine places orders, performs matching and returns the output amount (tokenOut)
 *      after executing the trade.
 */
interface IMatchingEngine {
    // Enum for order side.
    enum OrderSide {
        Buy,
        Sell
    }

    // Events as part of the external API.
    event OrderPlaced(
        uint256 indexed orderId,
        address indexed user,
        OrderSide side,
        address tokenIn,
        address tokenOut,
        uint256 price,
        uint256 amount
    );
    event FeeRatesUpdated(uint256 makerFeeRate, uint256 takerFeeRate);

    /**
     * @notice Places an order on the matching engine.
     * @param tokenIn The token being sold.
     * @param tokenOut The token being bought.
     * @param side The order side.
     * @param amountIn The amount of tokenIn to sell.
     * @param minAmountOut The minimum acceptable amount of tokenOut.
     * @return outAmount The actual amount of tokenOut received after matching.
     */
    function placeOrder(
        address tokenIn,
        address tokenOut,
        OrderSide side,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 outAmount);
}
