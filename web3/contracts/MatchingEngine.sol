// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "./library/RedBlackTreeLib.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IMatchingEngine.sol";
import "./Events.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ITradingVault.sol";

/**
 * @title MatchingEngine
 * @dev A production-oriented on-chain matching engine supporting multiple ERC20 token pairs.
 *      It maintains order books using a Red-Black Tree, supports partial fills (FIFO),
 *      calculates maker/taker fees (collected per quote), and provides snapshot functions for front-end use.
 */
contract MatchingEngine is IMatchingEngine, Ownable, ReentrancyGuard {
    using RedBlackTreeLib for RedBlackTreeLib.Tree;

    // OrderBook structure for a specific trading pair.
    struct OrderBook {
        RedBlackTreeLib.Tree buyTree; // Buy orders (max price first).
        RedBlackTreeLib.Tree sellTree; // Sell orders (min price first).
        // Mapping: price level => array of order IDs (FIFO).
        mapping(uint256 => uint256[]) buyOrdersAtPrice;
        mapping(uint256 => uint256[]) sellOrdersAtPrice;
    }

    // Mapping: trading pair ID (keccak256(base, quote)) => OrderBook.
    mapping(bytes32 => OrderBook) internal orderBooks;
    // Mapping: order ID => Order.
    mapping(uint256 => Order) internal orders;
    // 新たに maker の残高更新量を記録する構造体
    struct MakerChange {
        address maker;
        address token;
        uint256 amount;
    }
    uint256 public nextOrderId;

    // 状態変更を保存する一時的な構造体
    struct CreditInfo {
        address user;
        address token;
        uint256 amount;
    }

    // Fee rates in basis points (e.g., 10 = 0.1%).
    uint256 public makerFeeRate;
    uint256 public takerFeeRate;
    // Collected fees per quote.
    mapping(address => uint256) public makerFeesCollected;
    mapping(address => uint256) public takerFeesCollected;

    // Array of pair IDs for front-end iteration.
    bytes32[] public pairKeys;
    // Mapping: pair ID => Pair (Base Tokenddresses and decimals).
    struct Pair {
        address[2] tokenz; // [base, quote].
        uint256[2] decimals; // [base decimals, quote decimals].
    }
    mapping(bytes32 => Pair) internal pairs;

    // Maximum iterations for matching to prevent out-of-gas.
    uint256 constant MAX_MATCH_ITERATIONS = 100;
    address public immutable admin;
    address public vaultAddress;
    ITradingVault public _tradingVault;

    constructor(
        uint256 _makerFeeRate,
        uint256 _takerFeeRate
    ) Ownable(msg.sender) {
        admin = _msgSender();
        makerFeeRate = _makerFeeRate;
        takerFeeRate = _takerFeeRate;
    }

    /** @notice Sets the vault address.
     * Only the owner can set it.
     * @param newVault The address of the TradingVault contract.
     */
    function setVaultAddress(address newVault) external onlyOwner {
        require(newVault != address(0), "Zero address not allowed");
        vaultAddress = newVault;
        _tradingVault = ITradingVault(newVault);
        emit VaultAddressUpdated(newVault);
    }

    /** @dev Restricts function call to the vault only */
    modifier onlyVault() {
        require(msg.sender == vaultAddress, "Only vault allowed");
        _;
    }

    // Utility: Compute a unique pair ID from base and quote.
    function getPairId(
        address base,
        address quote
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(base, quote));
    }

    function getBestSellPrice(bytes32 pairId) external view returns (uint256) {
        OrderBook storage ob = orderBooks[pairId];
        return ob.sellTree.getMin();
    }

    function getBestBuyPrice(bytes32 pairId) external view returns (uint256) {
        OrderBook storage ob = orderBooks[pairId];
        return ob.buyTree.getMax();
    }

    // ---------------- Pair Management ----------------

    /**
     * @notice Adds a new trading pair.
     * @param base token being sold (base).
     * @param quote token being bought (quote).
     * @param decimalsBase Decimals for base.
     * @param decimalsQuote Decimals for quote.
     */
    function addPair(
        address base,
        address quote,
        uint256 decimalsBase,
        uint256 decimalsQuote
    ) external onlyOwner {
        bytes32 pairId = getPairId(base, quote);
        require(pairs[pairId].tokenz[0] == address(0), "Pair exists");
        pairs[pairId] = Pair([base, quote], [decimalsBase, decimalsQuote]);
        pairKeys.push(pairId);
        emit PairAdded(
            pairId,
            base,
            quote,
            [decimalsBase, decimalsQuote],
            block.timestamp
        );
    }

    // ---------------- Order Placement & Matching ----------------

    /**
     * @notice Places a new order and attempts immediate matching.
     * @param base token being sold (base).
     * @param quote token being bought (quote).
     * @param side Order side (Buy or Sell).
     * @param price Order price (quote per base).
     * @param amount Order amount.
     *
     * Note: Funds must be locked in the Vault externally before placing the order.
     */
    function placeOrder(
        address user,
        address base,
        address quote,
        OrderSide side,
        uint256 amount,
        uint256 price
    ) external onlyVault nonReentrant returns (uint256) {
        require(amount > 0, "Amount must be > 0");

        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            id: orderId,
            user: user,
            base: base,
            quote: quote,
            price: price,
            amount: amount,
            side: side,
            timestamp: block.timestamp,
            active: true,
            next: 0
        });

        bytes32 pairId = getPairId(base, quote);
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
        emit OrderPlaced(orderId, user, side, base, quote, price, amount);
        return orderId;
    }

    function matchOrder(uint256 orderId) external onlyVault nonReentrant {
        bytes32 pairId = getPairId(orders[orderId].base, orders[orderId].quote);
        _matchOrder(pairId, orderId);
    }

    /**
     * @dev Internal function to match an order with orders on the opposite side.
     *      Matches orders in FIFO order within each price level.
     *      Calculates maker/taker fees (collected in quote) and emits TradeExecuted events.
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
        uint256 originalAmount = incoming.amount;

        // 既存のCreditInfo構造体を使用
        CreditInfo[] memory creditQueue = new CreditInfo[](10);
        uint256 creditCount = 0;

        if (incoming.side == OrderSide.Buy) {
            uint256 bestSellPrice = ob.sellTree.getMin();
            while (
                remaining > 0 &&
                bestSellPrice > 0 &&
                (incoming.price == 0 || bestSellPrice <= incoming.price) &&
                iterations < MAX_MATCH_ITERATIONS
            ) {
                iterations++;
                uint256[] storage sellList = ob.sellOrdersAtPrice[
                    bestSellPrice
                ];
                for (uint256 i = 0; i < sellList.length && remaining > 0; ) {
                    uint256 sellOrderId = sellList[i];
                    Order storage sellOrder = orders[sellOrderId];
                    if (!sellOrder.active) {
                        sellList[i] = sellList[sellList.length - 1];
                        sellList.pop();
                        continue;
                    }
                    uint256 fill = remaining < sellOrder.amount
                        ? remaining
                        : sellOrder.amount;

                    // 状態変更を先に行う
                    sellOrder.amount -= fill;
                    sellOrder.active = false;
                    remaining -= fill;
                    if (sellOrder.amount == 0) {
                        sellList[i] = sellList[sellList.length - 1];
                        sellList.pop();
                    } else {
                        i++;
                    }

                    // クレジット情報を保存
                    creditQueue[creditCount++] = CreditInfo({
                        user: incoming.user,
                        token: incoming.base,
                        amount: fill
                    });
                    creditQueue[creditCount++] = CreditInfo({
                        user: sellOrder.user,
                        token: incoming.quote,
                        amount: fill * bestSellPrice
                    });

                    emit TradeExecuted(
                        orderId,
                        sellOrderId,
                        incoming.base,
                        incoming.quote,
                        bestSellPrice,
                        fill,
                        0,
                        0
                    );
                }
                if (sellList.length == 0) {
                    ob.sellTree.remove(bestSellPrice);
                }
                bestSellPrice = ob.sellTree.getMin();
            }
        } else {
            uint256 bestBuyPrice = ob.buyTree.getMax();
            while (
                remaining > 0 &&
                bestBuyPrice > 0 &&
                (incoming.price == 0 || bestBuyPrice >= incoming.price) &&
                iterations < MAX_MATCH_ITERATIONS
            ) {
                iterations++;
                uint256[] storage buyList = ob.buyOrdersAtPrice[bestBuyPrice];
                for (uint256 i = 0; i < buyList.length && remaining > 0; ) {
                    uint256 buyOrderId = buyList[i];
                    Order storage buyOrder = orders[buyOrderId];
                    if (!buyOrder.active) {
                        buyList[i] = buyList[buyList.length - 1];
                        buyList.pop();
                        continue;
                    }
                    uint256 fill = remaining < buyOrder.amount
                        ? remaining
                        : buyOrder.amount;

                    buyOrder.amount -= fill;
                    buyOrder.active = false;
                    remaining -= fill;
                    if (buyOrder.amount == 0) {
                        buyList[i] = buyList[buyList.length - 1];
                        buyList.pop();
                    } else {
                        i++;
                    }

                    // クレジット情報を保存
                    creditQueue[creditCount++] = CreditInfo({
                        user: incoming.user,
                        token: incoming.quote,
                        amount: fill * bestBuyPrice
                    });
                    creditQueue[creditCount++] = CreditInfo({
                        user: buyOrder.user,
                        token: incoming.base,
                        amount: fill
                    });

                    emit TradeExecuted(
                        buyOrderId,
                        orderId,
                        incoming.base,
                        incoming.quote,
                        bestBuyPrice,
                        fill,
                        0,
                        0
                    );
                }
                if (buyList.length == 0) {
                    ob.buyTree.remove(bestBuyPrice);
                }
                bestBuyPrice = ob.buyTree.getMax();
            }
        }

        // 状態変更を先に行う
        incoming.amount = remaining;
        incoming.active = (remaining > 0);

        // 成行注文の処理のための状態も先に計算
        uint256 refundAmount = 0;
        address refundToken = address(0);
        if (incoming.price == 0 && remaining > 0) {
            if (incoming.side == OrderSide.Buy) {
                uint256 lockedAmount = _tradingVault.getLockedAmount(orderId);
                refundAmount = (lockedAmount * remaining) / originalAmount;
                refundToken = incoming.quote;
            } else {
                refundAmount = remaining;
                refundToken = incoming.base;
            }
        } else if (remaining == 0) {
            incoming.active = false;
        }

        // refundTokenが設定されていることを確認
        require(
            refundAmount == 0 || refundToken != address(0),
            "Invalid refund token"
        );

        // すべての状態変更が完了した後でクレジット処理を実行
        for (uint256 i = 0; i < creditCount; i++) {
            _tradingVault.creditBalance(
                creditQueue[i].user,
                creditQueue[i].token,
                creditQueue[i].amount
            );
        }

        // 成行注文の返金処理も最後に実行
        if (refundAmount > 0) {
            _tradingVault.creditBalance(
                incoming.user,
                refundToken,
                refundAmount
            );
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

    /**
     * @notice Cancels an active order.
     * @param orderId The ID of the order to cancel.
     * @return true if the cancellation succeeded.
     */
    function cancelOrder(
        uint256 orderId
    ) external onlyVault nonReentrant returns (bool) {
        Order storage order = orders[orderId];
        require(order.active, "Order is not active");

        bytes32 pairId = getPairId(order.base, order.quote);
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
    function getOrder(
        uint256 orderId
    ) external view returns (Order memory order) {
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
    function getPair(
        uint i
    ) external view returns (PairResult memory pairResult) {
        require(i < pairKeys.length, "Index out of range");
        bytes32 pairId = pairKeys[i];
        Pair memory p = pairs[pairId];
        BestOrderResult memory bestBuy = getBestOrder(
            pairId,
            IMatchingEngine.OrderSide.Buy
        );
        BestOrderResult memory bestSell = getBestOrder(
            pairId,
            IMatchingEngine.OrderSide.Sell
        );
        pairResult = PairResult({
            pairId: pairId,
            tokenz: [p.tokenz[0], p.tokenz[1]],
            decimals: p.decimals,
            bestBuyOrder: bestBuy,
            bestSellOrder: bestSell
        });
    }

    /**
     * @notice Returns a paginated array of pairs.
     * @param offset Starting index.
     * @param limit Maximum number of pairs to return.
     * @return pairResults Array of PairResult structures.
     */
    function getPairsWithPagination(
        uint256 offset,
        uint256 limit
    ) external view returns (PairResult[] memory pairResults) {
        uint256 end = offset + limit;
        if (end > pairKeys.length) end = pairKeys.length;
        pairResults = new PairResult[](end - offset);
        for (uint256 i = 0; i < end - offset; i++) {
            pairResults[i] = _getPair(pairKeys[i + offset]);
        }
    }

    function _getPair(bytes32 key) internal view returns (PairResult memory) {
        Pair memory p = pairs[key];
        BestOrderResult memory bestBuy = getBestOrder(
            key,
            IMatchingEngine.OrderSide.Buy
        );
        BestOrderResult memory bestSell = getBestOrder(
            key,
            IMatchingEngine.OrderSide.Sell
        );
        return
            PairResult({
                pairId: key,
                tokenz: [p.tokenz[0], p.tokenz[1]],
                decimals: p.decimals,
                bestBuyOrder: bestBuy,
                bestSellOrder: bestSell
            });
    }

    /**
     * @notice Returns token information for a list of tokens.
     * @param tokens Array of Base Tokenddresses.
     * @return results Array of basefoResult structures.
     */
    function getbasefo(
        address[] calldata tokens
    ) external view returns (BaseInfoResult[] memory results) {
        results = new BaseInfoResult[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 t = IERC20(tokens[i]);
            results[i] = BaseInfoResult({
                symbol: t.symbol(),
                name: t.name(),
                decimals: t.decimals(),
                totalSupply: t.totalSupply()
            });
        }
    }

    /**
     * @notice Returns Quote Tokenalance and allowance for a list of owners and tokens.
     * @param owners Array of owner addresses.
     * @param tokens Array of Base Tokenddresses (must be same length as owners).
     * @return results Array of quotebaseTokenlanceAndAllowanceResult structures.
     */
    function getquotebaseTokenlanceAndAllowance(
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
     * @param newMakerFeeRate New maker fee rate in basis points.
     * @param newTakerFeeRate New taker fee rate in basis points.
     */
    function setFeeRates(
        uint256 newMakerFeeRate,
        uint256 newTakerFeeRate
    ) external onlyOwner {
        makerFeeRate = newMakerFeeRate;
        takerFeeRate = newTakerFeeRate;
        emit FeeRatesUpdated(newMakerFeeRate, newTakerFeeRate);
    }

    /**
     * @notice Allows the admin to withdraw collected fees for a given token (quote).
     * @param token The Base Tokenddress.
     */
    function withdrawFees(address token) external onlyOwner {
        uint256 makerAmount = makerFeesCollected[token];
        uint256 takerAmount = takerFeesCollected[token];
        require(makerAmount + takerAmount > 0, "No fees to withdraw");

        makerFeesCollected[token] = 0;
        takerFeesCollected[token] = 0;

        bool success = IERC20(token).transfer(admin, makerAmount + takerAmount);
        require(success, "Fee transfer failed");

        emit FeesWithdrawn(token, makerAmount, takerAmount);
    }
}
