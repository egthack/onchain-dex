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

    // ---------------- Snapshot Functions for Front-End ----------------

    struct OrderResult {
        uint256 price;
        uint256 orderId;
        uint256 nextOrderId;
        address maker;
        uint256 expiry;
        uint256 tokens;
        uint256 availableBase;
        uint256 availableQuote;
    }

    struct BestOrderResult {
        uint256 price;
        uint256 orderId;
        uint256 nextOrderId;
        address maker;
        uint256 expiry;
        uint256 tokens;
        uint256 availableBase;
        uint256 availableQuote;
    }

    struct PairResult {
        bytes32 pairId;
        address[2] tokenz;
        uint256[2] decimals;
        BestOrderResult bestBuyOrder;
        BestOrderResult bestSellOrder;
    }

    struct BaseInfoResult {
        string symbol;
        string name;
        uint8 decimals;
        uint totalSupply;
    }

    struct TokenBalanceAndAllowanceResult {
        uint balance;
        uint allowance;
    }

    struct OrderPage {
        Order[] orders; // 現在のページのオーダー
        uint256 nextPrice; // 次のページの開始価格（0の場合は最後のページ）
        uint256 totalCount; // 全オーダー数
    }

    /**
     * @notice Places an order on the matching engine.
     * @param base The Base Token being sold.
     * @param quote The Quote Token　being bought.
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

    /**
     * @notice Returns the best (first active) order for a given trading pair and side.
     * @param pairId The trading pair identifier.
     * @param side Order side (Buy or Sell).
     * @return orderResult The best order as a BestOrderResult struct.
     */
    function getBestOrder(
        bytes32 pairId,
        OrderSide side
    ) external view returns (BestOrderResult memory orderResult);

    /**
     * @notice Returns pair information along with best buy and sell orders.
     * @param i Index of the pair.
     * @return pairResult The pair result structure.
     */
    function getPair(uint i) external view returns (PairResult memory pairResult);

    /**
     * @notice Returns a paginated array of pairs.
     * @param offset Starting index.
     * @param limit Maximum number of pairs to return.
     * @return pairResults Array of PairResult structures.
     */
    function getPairsWithPagination(
        uint256 offset,
        uint256 limit
    ) external view returns (PairResult[] memory pairResults);

    /**
     * @notice Returns token information for a list of tokens.
     * @param tokens Array of Base Token addresses.
     * @return results Array of BaseInfoResult structures.
     */
    function getBaseInfo(
        address[] calldata tokens
    ) external view returns (BaseInfoResult[] memory results);

    /**
     * @notice Returns Quote Token balance and allowance for a list of owners and tokens.
     * @param owners Array of owner addresses.
     * @param tokens Array of Base Token addresses (must be same length as owners).
     * @return results Array of TokenBalanceAndAllowanceResult structures.
     */
    function getTokenBalanceAndAllowance(
        address[] calldata owners,
        address[] calldata tokens
    ) external view returns (TokenBalanceAndAllowanceResult[] memory results);

    /**
     * @notice Returns a paginated array of orders for a given trading pair and side.
     * @param pairId The trading pair identifier.
     * @param side The order side (Buy or Sell).
     * @param startPrice The starting price (0 for highest/lowest).
     * @param limit The maximum number of orders to return.
     * @return The paginated orders.
     */
    function getOrdersWithPagination(
        bytes32 pairId,
        OrderSide side,
        uint256 startPrice,
        uint256 limit
    ) external view returns (OrderPage memory);

    /**
     * @notice Allows the admin to update fee rates.
     * @param newMakerFeeRate New maker fee rate in basis points.
     * @param newTakerFeeRate New taker fee rate in basis points.
     */
    function setFeeRates(
        uint256 newMakerFeeRate,
        uint256 newTakerFeeRate
    ) external;

    /**
     * @notice Allows the admin to withdraw collected fees for a given token (quote).
     * @param token The token address.
     */
    function withdrawFees(address token) external;

    /**
     * @notice Sets the vault address.
     * Only the owner can set it.
     * @param newVault The address of the TradingVault contract.
     */
    function setVaultAddress(address newVault) external;

    /**
     * @notice Removes a trading pair
     * @param pairId pair id
     */
    function removePair(bytes32 pairId) external;
}
