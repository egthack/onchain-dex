// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @notice Interface for the MatchingEngine.
interface IMatchingEngine {
    // Enum for order side.
    enum OrderSide {
        Buy,
        Sell
    }

    struct Order {
        uint256 id;
        address user;
        address base;
        address quote;
        uint256 price;
        uint256 amount;
        OrderSide side;
        uint256 timestamp;
        bool active;
        uint256 next;
    }
    
    /**
     * @notice Places an order on the matching engine.
     * @param base The token being sold.
     * @param quote The token being bought.
     * @param side The order side.
     * @param amount The amount of base to sell.
     * @param price The price of the order.
     * @return outAmount The actual amount of quote received after matching.
     */
    function placeOrder(
        address user,
        address base,
        address quote,
        OrderSide side,
        uint256 amount,
        uint256 price
    ) external returns (uint256 outAmount);

    /**
     * @notice Returns the order information for the specified orderId
     * @param orderId The ID of the order to retrieve.
     * @return order The order information.
     */
    function getOrder(uint256 orderId) external view returns (Order memory order);

    /**
     * @notice Cancels an order on the matching engine.
     * @param orderId The ID of the order to cancel.
     * @return success True if the order was successfully cancelled, false otherwise.
     */
    function cancelOrder(uint256 orderId) external returns (bool success);
}
