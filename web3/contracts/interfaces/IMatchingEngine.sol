// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
     * @param base The Quote Tokeneing sold.
     * @param quote The Quote Tokeneing bought.
     * @param side The order side.
     * @param amount The amount of base to sell.
     * @param price The price of the order.
     */
    function placeOrder(
        address user,
        address base,
        address quote,
        OrderSide side,
        uint256 amount,
        uint256 price
    ) external returns (uint256 orderId);

    /**
     * @notice Matches an order on the matching engine.
     * @param orderId The ID of the order to match.
     */
    function matchOrder(uint256 orderId) external;

    function getPairId(
        address base,
        address quote
    ) external view returns (bytes32);

    function addPair(
        address base,
        address quote
    ) external;

    /**
     * @notice Returns the best (lowest) sell price for a given pair
     * @param pairId The trading pair identifier
     * @return The best sell price, or 0 if no sell orders exist
     */
    function getBestSellPrice(bytes32 pairId) external view returns (uint256);

    /**
     * @notice Returns the best (highest) buy price for a given pair
     * @param pairId The trading pair identifier
     * @return The best buy price, or 0 if no buy orders exist
     */
    function getBestBuyPrice(bytes32 pairId) external view returns (uint256);

    /**
     * @notice Returns the order information for the specified orderId
     * @param orderId The ID of the order to retrieve.
     * @return order The order information.
     */
    function getOrder(
        uint256 orderId
    ) external view returns (Order memory order);

    /**
     * @notice Cancels an order on the matching engine.
     * @param orderId The ID of the order to cancel.
     * @return success True if the order was successfully cancelled, false otherwise.
     */
    function cancelOrder(uint256 orderId) external returns (bool success);
}
