// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title SimpleDEX
 * @dev A basic on-chain order management and matching engine contract for a single trading pair (e.g. ETH/USDC).
 *      Orders are stored in arrays for buy and sell sides. Matching is done in a naive loop.
 */
contract DEX {
    // Order structure representing an individual order
    struct Order {
        uint256 id; // Unique order ID
        address owner; // Order creator
        uint256 price; // Price: tokenSell per tokenBuy (e.g. USDC per ETH)
        uint256 amount; // Remaining order amount
        bool isBuy; // true: buy order, false: sell order
        bool isActive; // Indicates if order is active
        uint256 timestamp; // Timestamp of order creation
    }

    // Global order ID counter
    uint256 public nextOrderId;

    // Arrays to store active orders for each side (for a single trading pair)
    Order[] public buyOrders; // Sorted in descending order by price (ideally)
    Order[] public sellOrders; // Sorted in ascending order by price (ideally)

    // Events for order creation, cancellation, and trade execution
    event OrderCreated(
        uint256 indexed id,
        address indexed owner,
        uint256 price,
        uint256 amount,
        bool isBuy
    );
    event OrderCancelled(uint256 indexed id);
    event TradeExecuted(
        uint256 indexed buyOrderId,
        uint256 indexed sellOrderId,
        uint256 price,
        uint256 amount
    );

    /**
     * @dev Create a new order.
     * @param price The price at which the order is placed.
     * @param amount The order amount.
     * @param isBuy True if it's a buy order; false if sell order.
     *
     * The function creates an order, stores it in the appropriate array, and then
     * attempts to match the order against existing orders.
     */
    function createOrder(uint256 price, uint256 amount, bool isBuy) external {
        require(amount > 0, "Order: amount must be > 0");
        require(price > 0, "Order: price must be > 0");

        // Create new order struct
        Order memory newOrder = Order({
            id: nextOrderId,
            owner: msg.sender,
            price: price,
            amount: amount,
            isBuy: isBuy,
            isActive: true,
            timestamp: block.timestamp
        });
        nextOrderId++;

        // Store the order in the corresponding array
        if (isBuy) {
            buyOrders.push(newOrder);
        } else {
            sellOrders.push(newOrder);
        }
        emit OrderCreated(newOrder.id, msg.sender, price, amount, isBuy);

        // Attempt matching immediately after order creation
        if (isBuy) {
            _matchBuyOrder(newOrder.id);
        } else {
            _matchSellOrder(newOrder.id);
        }
    }

    /**
     * @dev Cancel an active order.
     * @param orderId The ID of the order to cancel.
     * @param isBuy True if canceling a buy order; false if sell order.
     *
     * The function marks the order as inactive.
     */
    function cancelOrder(uint256 orderId, bool isBuy) external {
        if (isBuy) {
            for (uint256 i = 0; i < buyOrders.length; i++) {
                if (
                    buyOrders[i].id == orderId &&
                    buyOrders[i].owner == msg.sender &&
                    buyOrders[i].isActive
                ) {
                    buyOrders[i].isActive = false;
                    emit OrderCancelled(orderId);
                    return;
                }
            }
        } else {
            for (uint256 i = 0; i < sellOrders.length; i++) {
                if (
                    sellOrders[i].id == orderId &&
                    sellOrders[i].owner == msg.sender &&
                    sellOrders[i].isActive
                ) {
                    sellOrders[i].isActive = false;
                    emit OrderCancelled(orderId);
                    return;
                }
            }
        }
        revert("Order not found or not cancellable");
    }

    /**
     * @dev Internal function to match a buy order against existing sell orders.
     * @param buyOrderId The ID of the new buy order.
     */
    function _matchBuyOrder(uint256 buyOrderId) internal {
        uint256 buyIndex = 0;
        bool found = false;
        // Loop to find the index of the buy order in buyOrders array.
        for (uint256 i = 0; i < buyOrders.length; i++) {
            if (buyOrders[i].id == buyOrderId) {
                buyIndex = i;
                found = true;
                break;
            }
        }
        require(found, "Buy order not found");
        Order storage buyOrder = buyOrders[buyIndex]; // Now buyOrder is assigned properly.
        require(buyOrder.isActive, "Buy order is not active");

        // Loop through sell orders to find matches.
        for (uint256 i = 0; i < sellOrders.length; i++) {
            // Skip inactive orders.
            if (!sellOrders[i].isActive) continue;
            // Check if prices are compatible: buy price must be >= sell price.
            if (buyOrder.price >= sellOrders[i].price) {
                // Determine the trade amount (min of available amounts).
                uint256 tradeAmount = buyOrder.amount < sellOrders[i].amount
                    ? buyOrder.amount
                    : sellOrders[i].amount;

                // Update order amounts.
                buyOrder.amount -= tradeAmount;
                sellOrders[i].amount -= tradeAmount;

                emit TradeExecuted(
                    buyOrder.id,
                    sellOrders[i].id,
                    sellOrders[i].price,
                    tradeAmount
                );

                // If a sell order is fully filled, mark it as inactive.
                if (sellOrders[i].amount == 0) {
                    sellOrders[i].isActive = false;
                }
                // If the buy order is completely filled, mark it as inactive and exit matching loop.
                if (buyOrder.amount == 0) {
                    buyOrder.isActive = false;
                    break;
                }
            }
        }
    }

    /**
     * @dev Internal function to match a sell order against existing buy orders.
     * @param sellOrderId The ID of the new sell order.
     */
    function _matchSellOrder(uint256 sellOrderId) internal {
        uint256 sellIndex = 0;
        bool found = false;
        // Loop to find the index of the sell order in sellOrders array.
        for (uint256 i = 0; i < sellOrders.length; i++) {
            if (sellOrders[i].id == sellOrderId) {
                sellIndex = i;
                found = true;
                break;
            }
        }
        require(found, "Sell order not found");
        Order storage sellOrder = sellOrders[sellIndex]; // Properly assign the storage pointer.
        require(sellOrder.isActive, "Sell order is not active");

        // Loop through buy orders to find matches.
        for (uint256 i = 0; i < buyOrders.length; i++) {
            // Skip inactive orders.
            if (!buyOrders[i].isActive) continue;
            // Check if prices are compatible: sell price must be <= buy price.
            if (sellOrder.price <= buyOrders[i].price) {
                // Determine the trade amount (minimum of available amounts).
                uint256 tradeAmount = sellOrder.amount < buyOrders[i].amount
                    ? sellOrder.amount
                    : buyOrders[i].amount;

                // Update order amounts.
                sellOrder.amount -= tradeAmount;
                buyOrders[i].amount -= tradeAmount;

                emit TradeExecuted(
                    buyOrders[i].id,
                    sellOrder.id,
                    sellOrder.price,
                    tradeAmount
                );

                // If a buy order is fully filled, mark it as inactive.
                if (buyOrders[i].amount == 0) {
                    buyOrders[i].isActive = false;
                }
                // If the sell order is completely filled, mark it as inactive and exit matching loop.
                if (sellOrder.amount == 0) {
                    sellOrder.isActive = false;
                    break;
                }
            }
        }
    }
}
