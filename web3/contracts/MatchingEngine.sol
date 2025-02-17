// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "hardhat/console.sol";
import "./library/RedBlackTreeLib.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IMatchingEngine.sol";
import "./Events.sol"; 
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MatchingEngine
 * @dev A production-oriented on-chain matching engine supporting multiple ERC20 token pairs.
 *      It maintains order books using a Red-Black Tree, supports partial fills (FIFO),
 *      calculates maker/taker fees (collected per tokenOut), and provides snapshot functions for front-end use.
 */
contract MatchingEngine is IMatchingEngine, Ownable {
    using RedBlackTreeLib for RedBlackTreeLib.Tree;

    // OrderBook structure for a specific trading pair.
    struct OrderBook {
        RedBlackTreeLib.Tree buyTree;   // Buy orders (max price first).
        RedBlackTreeLib.Tree sellTree;  // Sell orders (min price first).
        // Mapping: price level => array of order IDs (FIFO).
        mapping(uint256 => uint256[]) buyOrdersAtPrice;
        mapping(uint256 => uint256[]) sellOrdersAtPrice;
    }

    // Mapping: trading pair ID (keccak256(tokenIn, tokenOut)) => OrderBook.
    mapping(bytes32 => OrderBook) internal orderBooks;
    // Mapping: order ID => Order.
    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId;

    // Fee rates in basis points (e.g., 10 = 0.1%).
    uint256 public makerFeeRate;
    uint256 public takerFeeRate;
    // Collected fees per tokenOut.
    mapping(address => uint256) public makerFeesCollected;
    mapping(address => uint256) public takerFeesCollected;

    // Array of pair IDs for front-end iteration.
    bytes32[] public pairKeys;
    // Mapping: pair ID => Pair (token addresses and decimals).
    struct Pair {
        address[2] tokenz;       // [base, quote].
        uint256[2] decimals;     // [base decimals, quote decimals].
    }
    mapping(bytes32 => Pair) internal pairs;

    // Maximum iterations for matching to prevent out-of-gas.
    uint256 constant MAX_MATCH_ITERATIONS = 2;
    address public admin;
    address public vaultAddress;

    constructor(uint256 _makerFeeRate, uint256 _takerFeeRate) Ownable(msg.sender) {
        admin = msg.sender;
        makerFeeRate = _makerFeeRate;
        takerFeeRate = _takerFeeRate;
    }

    /** @notice Sets the vault address.
      * Only the owner can set it.
      * @param _vault The address of the TradingVault contract.
      */
    function setVaultAddress(address _vault) external onlyOwner {
        vaultAddress = _vault;
    }

    /** @dev Restricts function call to the vault only */
    modifier onlyVault() {
        require(msg.sender == vaultAddress, "Only vault allowed");
        _;
    }

    // Utility: Compute a unique pair ID from tokenIn and tokenOut.
    function getPairId(
        address tokenIn,
        address tokenOut
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(tokenIn, tokenOut));
    }

    // ---------------- Pair Management ----------------

    /**
     * @notice Adds a new trading pair.
     * @param tokenIn Token being sold (base).
     * @param tokenOut Token being bought (quote).
     * @param decimalsBase Decimals for tokenIn.
     * @param decimalsQuote Decimals for tokenOut.
     */
    function addPair(
        address tokenIn,
        address tokenOut,
        uint256 decimalsBase,
        uint256 decimalsQuote
    ) external onlyOwner {
        bytes32 pairId = getPairId(tokenIn, tokenOut);
        require(pairs[pairId].tokenz[0] == address(0), "Pair exists");
        pairs[pairId] = Pair([tokenIn, tokenOut], [decimalsBase, decimalsQuote]);
        pairKeys.push(pairId);
        emit PairAdded(pairId, tokenIn, tokenOut, [decimalsBase, decimalsQuote], block.timestamp);
    }

    // ---------------- Order Placement & Matching ----------------

    /**
     * @notice Places a new order and attempts immediate matching.
     * @param tokenIn Token being sold.
     * @param tokenOut Token being bought.
     * @param side Order side (Buy or Sell).
     * @param price Order price (tokenOut per tokenIn).
     * @param amount Order amount.
     * @return orderId The ID of the placed order.
     *
     * Note: Funds must be locked in the Vault externally before placing the order.
     */
    function placeOrder(
        address tokenIn,
        address tokenOut,
        OrderSide side,
        uint256 price,
        uint256 amount
    ) external override onlyVault returns (uint256 orderId) {
        require(amount > 0, "Amount must be > 0");
        require(price > 0, "Price must be > 0");

        orderId = nextOrderId++;
        orders[orderId] = Order({
            id: orderId,
            user: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            price: price,
            amount: amount,
            side: side,
            timestamp: block.timestamp,
            active: true,
            next: 0
        });

        bytes32 pairId = getPairId(tokenIn, tokenOut);
        OrderBook storage ob = orderBooks[pairId];
        if (side == OrderSide.Buy) {
            ob.buyOrdersAtPrice[price].push(orderId);
            if (!ob.buyTree.exists(price)) {
                ob.buyTree.insert(price);
            }
        } else {
            ob.sellOrdersAtPrice[price].push(orderId);
            if (!ob.sellTree.exists(price)) {
                ob.sellTree.insert(price);
            }
        }
        emit OrderPlaced(orderId, msg.sender, side, tokenIn, tokenOut, price, amount);
        _matchOrder(pairId, orderId);
        return orderId;
    }

    /**
     * @dev Internal function to match an order with orders on the opposite side.
     *      Matches orders in FIFO order within each price level.
     *      Calculates maker/taker fees (collected in tokenOut) and emits TradeExecuted events.
     *      Limits total iterations to MAX_MATCH_ITERATIONS to avoid out-of-gas.
     * @param pairId Trading pair identifier.
     * @param orderId Incoming order ID.
     */
    function _matchOrder(bytes32 pairId, uint256 orderId) internal {
        Order storage incoming = orders[orderId];
        if (!incoming.active) return;

        OrderBook storage ob = orderBooks[pairId];
        uint256 remaining = incoming.amount;
        uint256 iterations = 0;
        if (incoming.side == OrderSide.Buy) {
            // Match buy order against sell orders with price <= incoming.price.
            uint256 bestSellPrice = ob.sellTree.getMin();
            while (
                remaining > 0 &&
                bestSellPrice > 0 &&
                bestSellPrice <= incoming.price &&
                iterations < MAX_MATCH_ITERATIONS
            ) {
                uint256[] storage sellList = ob.sellOrdersAtPrice[bestSellPrice];
                for (uint256 i = 0; i < sellList.length && remaining > 0; ) {
                    iterations++;
                    uint256 sellOrderId = sellList[i];
                    Order storage sellOrder = orders[sellOrderId];
                    if (!sellOrder.active) {
                        sellList[i] = sellList[sellList.length - 1];
                        sellList.pop();
                        continue;
                    }
                    uint256 fill = remaining < sellOrder.amount ? remaining : sellOrder.amount;

                    // tradeVolume = fill * bestSellPrice; // In tokenOut units.
                    uint256 makerFee = (fill * bestSellPrice * makerFeeRate) / 10000;
                    uint256 takerFee = (fill * bestSellPrice * takerFeeRate) / 10000;

                    sellOrder.amount -= fill;
                    remaining -= fill;
                    if (sellOrder.amount == 0) {
                        sellOrder.active = false;
                        sellList[i] = sellList[sellList.length - 1];
                        sellList.pop();
                    } else {
                        i++;
                    }
                    makerFeesCollected[incoming.tokenOut] += makerFee;
                    takerFeesCollected[incoming.tokenOut] += takerFee;

                    emit TradeExecuted(
                        orderId,         // Buy order ID (taker)
                        sellOrderId,     // Sell order ID (maker)
                        incoming.tokenIn,
                        incoming.tokenOut,
                        bestSellPrice,
                        fill,
                        makerFee,
                        takerFee
                    );
                }
                if (sellList.length == 0) {
                    ob.sellTree.remove(bestSellPrice);
                }
                bestSellPrice = ob.sellTree.getMin();
            }
        } else {
            // For sell orders, match against buy orders with price >= incoming.price.
            uint256 bestBuyPrice = ob.buyTree.getMax();
            while (
                remaining > 0 &&
                bestBuyPrice > 0 &&
                bestBuyPrice >= incoming.price &&
                iterations < MAX_MATCH_ITERATIONS
            ) {
                uint256[] storage buyList = ob.buyOrdersAtPrice[bestBuyPrice];
                for (uint256 i = 0; i < buyList.length && remaining > 0; ) {
                    iterations++;
                    uint256 buyOrderId = buyList[i];
                    Order storage buyOrder = orders[buyOrderId];
                    if (!buyOrder.active) {
                        buyList[i] = buyList[buyList.length - 1];
                        buyList.pop();
                        continue;
                    }
                    uint256 fill = remaining < buyOrder.amount ? remaining : buyOrder.amount;
                    uint256 makerFee = (fill * bestBuyPrice * makerFeeRate) / 10000;
                    uint256 takerFee = (fill * bestBuyPrice * takerFeeRate) / 10000;

                    buyOrder.amount -= fill;
                    remaining -= fill;
                    if (buyOrder.amount == 0) {
                        buyOrder.active = false;
                        buyList[i] = buyList[buyList.length - 1];
                        buyList.pop();
                    } else {
                        i++;
                    }
                    makerFeesCollected[incoming.tokenOut] += makerFee;
                    takerFeesCollected[incoming.tokenOut] += takerFee;

                    emit TradeExecuted(
                        buyOrderId,      // Buy order ID (maker)
                        orderId,         // Sell order ID (taker)
                        incoming.tokenIn,
                        incoming.tokenOut,
                        bestBuyPrice,
                        fill,
                        makerFee,
                        takerFee
                    );
                }
                if (buyList.length == 0) {
                    ob.buyTree.remove(bestBuyPrice);
                }
                bestBuyPrice = ob.buyTree.getMax();
            }
        }
        incoming.amount = remaining;
        if (remaining == 0) {
            incoming.active = false;
        }
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

    struct TokenInfoResult {
        string symbol;
        string name;
        uint8 decimals;
        uint totalSupply;
    }

    struct TokenBalanceAndAllowanceResult {
        uint balance;
        uint allowance;
    }

    /**
     * @notice Cancels an active order.
     * @param orderId The ID of the order to cancel.
     * @return true if the cancellation succeeded.
     */
    function cancelOrder(uint256 orderId) external onlyVault returns (bool) {
        Order storage order = orders[orderId];
        require(order.active, "Order is not active");

        bytes32 pairId = getPairId(order.tokenIn, order.tokenOut);
        OrderBook storage ob = orderBooks[pairId];
        if (order.side == OrderSide.Buy) {
            ob.buyTree.remove(order.price);
        } else {
            ob.sellTree.remove(order.price);
        }

        order.active = false;
        return true;
    }

    /**
     * @notice Returns the order information for the specified orderId
     * @param orderId The ID of the order to retrieve.
     * @return order The order information.
     */
    function getOrder(uint256 orderId) external view returns (Order memory order) {
        return orders[orderId];
    }

    /**
     * @notice Returns an array of orders for a given trading pair and side at a specified price level.
     * @param pairId The trading pair identifier.
     * @param side Order side (Buy or Sell).
     * @param count Number of orders to retrieve.
     * @param startPrice Price level to start (if zero, uses best price).
     * @return orderResults Array of orders with aggregated amounts.
     */
    function getOrders(
        bytes32 pairId,
        IMatchingEngine.OrderSide side,
        uint256 count,
        uint256 startPrice
    ) external view returns (OrderResult[] memory orderResults) {
        OrderBook storage ob = orderBooks[pairId];
        uint256[] storage orderIds = (side == IMatchingEngine.OrderSide.Buy)
            ? ob.buyOrdersAtPrice[startPrice]
            : ob.sellOrdersAtPrice[startPrice];
        orderResults = new OrderResult[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < orderIds.length && index < count; i++) {
            Order storage ord = orders[orderIds[i]];
            if (!ord.active) continue;
            orderResults[index] = OrderResult({
                price: ord.price,
                orderId: ord.id,
                nextOrderId: ord.next,
                maker: ord.user,
                expiry: ord.timestamp, // Placeholder for expiry.
                tokens: ord.amount,
                availableBase: ord.amount, // Simplified; adjust if necessary.
                availableQuote: ord.amount * ord.price
            });
            index++;
        }
    }

    /**
     * @notice Returns the best (first active) order for a given trading pair and side.
     * @param pairId The trading pair identifier.
     * @param side Order side (Buy or Sell).
     * @return orderResult The best order as a BestOrderResult struct.
     */
    function getBestOrder(
        bytes32 pairId,
        IMatchingEngine.OrderSide side
    ) public view returns (BestOrderResult memory orderResult) {
        OrderBook storage ob = orderBooks[pairId];
        uint256 bestPrice;
        uint256[] storage ordersAtPrice;
        if (side == IMatchingEngine.OrderSide.Buy) {
            bestPrice = ob.buyTree.getMax();
            ordersAtPrice = ob.buyOrdersAtPrice[bestPrice];
        } else {
            bestPrice = ob.sellTree.getMin();
            ordersAtPrice = ob.sellOrdersAtPrice[bestPrice];
        }
        if (bestPrice == 0 || ordersAtPrice.length == 0) {
            return orderResult;
        }
        uint256 bestOrderId = ordersAtPrice[0];
        Order storage o = orders[bestOrderId];
        orderResult = BestOrderResult({
            price: bestPrice,
            orderId: o.id,
            nextOrderId: ordersAtPrice.length > 1 ? ordersAtPrice[1] : 0,
            maker: o.user,
            expiry: o.timestamp,
            tokens: o.amount,
            availableBase: o.amount,
            availableQuote: o.amount * o.price
        });
    }

    /**
     * @notice Returns pair information along with best buy and sell orders.
     * @param i Index of the pair.
     * @return pairResult The pair result structure.
     */
    function getPair(uint i) external view returns (PairResult memory pairResult) {
        require(i < pairKeys.length, "Index out of range");
        bytes32 pairId = pairKeys[i];
        Pair memory p = pairs[pairId];
        BestOrderResult memory bestBuy = getBestOrder(pairId, IMatchingEngine.OrderSide.Buy);
        BestOrderResult memory bestSell = getBestOrder(pairId, IMatchingEngine.OrderSide.Sell);
        pairResult = PairResult({
            pairId: pairId,
            tokenz: [p.tokenz[0], p.tokenz[1]],
            decimals: p.decimals,
            bestBuyOrder: bestBuy,
            bestSellOrder: bestSell
        });
    }

    /**
     * @notice Returns an array of pairs starting from a given offset.
     * @param count Number of pairs to return.
     * @param offset Starting index.
     * @return pairResults Array of PairResult structures.
     */
    function getPairs(uint count, uint offset) external view returns (PairResult[] memory pairResults) {
        require(offset < pairKeys.length, "Offset out of range");
        uint256 len = (offset + count > pairKeys.length)
            ? pairKeys.length - offset
            : count;
        pairResults = new PairResult[](len);
        for (uint256 i = 0; i < len; i++) {
            pairResults[i] = this.getPair(i + offset);
        }
    }

    /**
     * @notice Returns token information for a list of tokens.
     * @param tokens Array of token addresses.
     * @return results Array of TokenInfoResult structures.
     */
    function getTokenInfo(address[] calldata tokens) external view returns (TokenInfoResult[] memory results) {
        results = new TokenInfoResult[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 t = IERC20(tokens[i]);
            results[i] = TokenInfoResult({
                symbol: t.symbol(),
                name: t.name(),
                decimals: t.decimals(),
                totalSupply: t.totalSupply()
            });
        }
    }

    /**
     * @notice Returns token balance and allowance for a list of owners and tokens.
     * @param owners Array of owner addresses.
     * @param tokens Array of token addresses (must be same length as owners).
     * @return results Array of TokenBalanceAndAllowanceResult structures.
     */
    function getTokenBalanceAndAllowance(
        address[] calldata owners,
        address[] calldata tokens
    ) external view returns (TokenBalanceAndAllowanceResult[] memory results) {
        require(owners.length == tokens.length, "Length mismatch");
        results = new TokenBalanceAndAllowanceResult[](owners.length);
        for (uint256 i = 0; i < owners.length; i++) {
            IERC20 t = IERC20(tokens[i]);
            results[i] = TokenBalanceAndAllowanceResult({
                balance: t.balanceOf(owners[i]),
                allowance: t.allowance(owners[i], address(this))
            });
        }
    }

    // ---------------- Admin Functions ----------------

    /**
     * @notice Allows the admin to update fee rates.
     * @param _makerFeeRate New maker fee rate in basis points.
     * @param _takerFeeRate New taker fee rate in basis points.
     */
    function setFeeRates(uint256 _makerFeeRate, uint256 _takerFeeRate) external onlyOwner {
        makerFeeRate = _makerFeeRate;
        takerFeeRate = _takerFeeRate;
        emit FeeRatesUpdated(_makerFeeRate, _takerFeeRate);
    }

    /**
     * @notice Allows the admin to withdraw collected fees for a given token (tokenOut).
     * @param token The token address.
     */
    function withdrawFees(address token) external onlyOwner {
        uint256 makerAmount = makerFeesCollected[token];
        uint256 takerAmount = takerFeesCollected[token];
        require(makerAmount + takerAmount > 0, "No fees to withdraw");
        makerFeesCollected[token] = 0;
        takerFeesCollected[token] = 0;
        IERC20(token).transfer(admin, makerAmount + takerAmount);
        emit FeesWithdrawn(token, makerAmount, takerAmount);
    }
}