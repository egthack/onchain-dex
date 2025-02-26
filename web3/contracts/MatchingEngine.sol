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

    /// @notice 数量の精度調整用の係数（小数点以下6桁精度）
    uint256 private constant AMOUNT_PRECISION_FACTOR = 1000000;
    /// @notice 価格の精度調整用の係数（小数点以下2桁精度）
    uint256 private constant PRICE_PRECISION_FACTOR = 100;
    /// @notice 最小取引量（1 = 0.000001 * 10^6）
    uint256 private constant MINIMUM_AMOUNT = 1;

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
    struct Pair {
        address[2] tokenz; // [base, quote].
        uint256[2] decimals; // [base decimals, quote decimals].
        bool active; // ペアが有効かどうかのフラグ
    }
    // Mapping: pair ID => Pair
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

    function getPairId(
        address base,
        address quote
    ) external view returns (bytes32) {
        bytes32 pairId = _generatePairId(base, quote);
        require(
            pairs[pairId].tokenz[0] != address(0) && pairs[pairId].active,
            "Pair not active or not exist"
        );
        return pairId;
    }

    // Utility: Compute a unique pair ID from base and quote.
    function _generatePairId(
        address base,
        address quote
    ) internal pure returns (bytes32) {
        require(base != address(0) && quote != address(0), "Invalid address");
        require(base != quote, "Identical addresses");
        // 固定順序にし、お互いのアドレスが逆の組み合わせでも同じペアIDになるようにして重複を防ぐ
        return
            base < quote
                ? keccak256(abi.encodePacked(base, quote))
                : keccak256(abi.encodePacked(quote, base));
    }

    function getBestSellPrice(bytes32 pairId) external view returns (uint256) {
        require(
            pairs[pairId].tokenz[0] != address(0) && pairs[pairId].active,
            "Invalid pair"
        );
        OrderBook storage ob = orderBooks[pairId];
        return ob.sellTree.getMin();
    }

    function getBestBuyPrice(bytes32 pairId) external view returns (uint256) {
        require(
            pairs[pairId].tokenz[0] != address(0) && pairs[pairId].active,
            "Invalid pair"
        );
        OrderBook storage ob = orderBooks[pairId];
        return ob.buyTree.getMax();
    }

    // ---------------- Pair Management ----------------

    /**
     * @notice Adds a new trading pair.
     * @param base token being sold (base).
     * @param quote token being bought (quote).
     */
    function addPair(address base, address quote) external onlyOwner {
        bytes32 pairId = _generatePairId(base, quote);
        require(pairs[pairId].tokenz[0] == address(0), "Pair exists");
        uint256 decimalsBase = IERC20(base).decimals();
        uint256 decimalsQuote = IERC20(quote).decimals();
        pairs[pairId] = Pair({
            tokenz: [base, quote],
            decimals: [decimalsBase, decimalsQuote],
            active: true
        });
        pairKeys.push(pairId);
        emit PairAdded(
            pairId,
            base,
            quote,
            [decimalsBase, decimalsQuote],
            block.timestamp
        );
    }

    /**
     * @notice Removes a trading pair
     * @param pairId pair id
     */
    function removePair(bytes32 pairId) external onlyOwner {
        require(pairs[pairId].tokenz[0] != address(0), "Pair does not exist");
        require(pairs[pairId].active, "Pair already inactive");
        pairs[pairId].active = false;
        emit PairRemoved(
            pairId,
            pairs[pairId].tokenz[0],
            pairs[pairId].tokenz[1],
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
        bytes32 pairId = _generatePairId(base, quote);
        require(
            pairs[pairId].tokenz[0] != address(0) && pairs[pairId].active,
            "Invalid pair"
        );

        // 価格を小数点以下2桁の精度に切り捨て
        uint256 truncatedPrice = price > 0 ? _truncatePrice(price) : 0;

        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            id: orderId,
            user: user,
            base: base,
            quote: quote,
            price: truncatedPrice,
            amount: amount,
            side: side,
            timestamp: block.timestamp,
            active: true,
            next: 0
        });

        OrderBook storage ob = orderBooks[pairId];
        if (side == OrderSide.Buy) {
            ob.buyOrdersAtPrice[truncatedPrice].push(orderId);
            if (!ob.buyTree.exists(truncatedPrice)) {
                ob.buyTree.insert(truncatedPrice);
            }
        } else {
            ob.sellOrdersAtPrice[truncatedPrice].push(orderId);
            if (!ob.sellTree.exists(truncatedPrice)) {
                ob.sellTree.insert(truncatedPrice);
            }
        }
        emit OrderPlaced(
            orderId,
            user,
            side,
            base,
            quote,
            truncatedPrice,
            amount
        );
        return orderId;
    }

    function matchOrder(uint256 orderId) external onlyVault nonReentrant {
        bytes32 pairId = _generatePairId(
            orders[orderId].base,
            orders[orderId].quote
        );
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

        if (incoming.side == OrderSide.Buy) {
            _matchBuyOrder(orderId, ob, remaining, iterations, originalAmount);
        } else {
            _matchSellOrder(orderId, ob, remaining, iterations, originalAmount);
        }
    }

    function _matchBuyOrder(
        uint256 orderId,
        OrderBook storage ob,
        uint256 remaining,
        uint256 iterations,
        uint256 originalAmount
    ) internal {
        Order storage incoming = orders[orderId];
        uint256 bestSellPrice = ob.sellTree.getMin();

        while (
            remaining > 0 &&
            bestSellPrice > 0 &&
            (incoming.price == 0 || bestSellPrice <= incoming.price) &&
            iterations < MAX_MATCH_ITERATIONS
        ) {
            iterations++;
            uint256[] storage sellList = ob.sellOrdersAtPrice[bestSellPrice];

            for (uint256 i = 0; i < sellList.length && remaining > 0; ) {
                (remaining, i) = _processBuyMatch(
                    orderId,
                    remaining,
                    bestSellPrice,
                    sellList,
                    i
                );
            }

            if (sellList.length == 0) {
                ob.sellTree.remove(bestSellPrice);
            }
            bestSellPrice = ob.sellTree.getMin();
        }

        _finalizeOrder(incoming, remaining, originalAmount);
    }

    function _processBuyMatch(
        uint256 orderId,
        uint256 remaining,
        uint256 bestSellPrice,
        uint256[] storage sellList,
        uint256 i
    ) internal returns (uint256, uint256) {
        uint256 sellOrderId = sellList[i];
        Order storage sellOrder = orders[sellOrderId];
        Order storage incoming = orders[orderId];

        if (!sellOrder.active) {
            sellList[i] = sellList[sellList.length - 1];
            sellList.pop();
            return (remaining, i);
        }

        uint256 fill;
        if (incoming.price == 0) {
            uint256 maxBaseFill = remaining / bestSellPrice;
            fill = maxBaseFill < sellOrder.amount
                ? maxBaseFill
                : sellOrder.amount;
        } else {
            fill = remaining < sellOrder.amount ? remaining : sellOrder.amount;
        }

        if (fill > 0) {
            sellOrder.amount -= fill;
            sellOrder.active = (sellOrder.amount > 0);
            remaining -= (incoming.price == 0) ? fill * bestSellPrice : fill;

            if (sellOrder.amount == 0) {
                sellList[i] = sellList[sellList.length - 1];
                sellList.pop();
            } else {
                i++;
            }

            // 手数料計算（精度を保持したまま）
            uint256 takerFee = (fill * takerFeeRate) / 10000;
            uint256 makerGross = fill * bestSellPrice;
            uint256 makerFee = (makerGross * makerFeeRate) / 10000;

            // 正味金額の計算（精度を保持したまま）
            uint256 takerNet = fill > takerFee ? fill - takerFee : 0;
            uint256 makerNet = makerGross > makerFee
                ? makerGross - makerFee
                : 0;

            // 最終的な金額を6桁精度に切り捨て
            uint256 truncatedTakerNet = _truncateToMinimumDecimals(takerNet);
            uint256 truncatedMakerNet = _truncateToMinimumDecimals(makerNet);

            // 残高更新（切り捨て後の金額を使用）
            _tradingVault.creditBalance(
                incoming.user,
                incoming.base,
                truncatedTakerNet
            );
            _tradingVault.creditBalance(
                sellOrder.user,
                incoming.quote,
                truncatedMakerNet
            );

            // 手数料の収集（切り捨てなし）
            takerFeesCollected[incoming.base] += takerFee;
            makerFeesCollected[incoming.quote] += makerFee;

            emit TradeExecuted(
                orderId,
                sellOrderId,
                incoming.base,
                incoming.quote,
                bestSellPrice,
                fill,
                makerFee,
                takerFee
            );
        }

        return (remaining, i);
    }

    function _matchSellOrder(
        uint256 orderId,
        OrderBook storage ob,
        uint256 remaining,
        uint256 iterations,
        uint256 originalAmount
    ) internal {
        Order storage incoming = orders[orderId];
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
                (remaining, i) = _processSellMatch(
                    orderId,
                    remaining,
                    bestBuyPrice,
                    buyList,
                    i
                );
            }

            if (buyList.length == 0) {
                ob.buyTree.remove(bestBuyPrice);
            }
            bestBuyPrice = ob.buyTree.getMax();
        }

        _finalizeOrder(incoming, remaining, originalAmount);
    }

    function _processSellMatch(
        uint256 orderId,
        uint256 remaining,
        uint256 bestBuyPrice,
        uint256[] storage buyList,
        uint256 i
    ) internal returns (uint256, uint256) {
        uint256 buyOrderId = buyList[i];
        Order storage buyOrder = orders[buyOrderId];
        Order storage incoming = orders[orderId];

        if (!buyOrder.active) {
            buyList[i] = buyList[buyList.length - 1];
            buyList.pop();
            return (remaining, i);
        }

        uint256 fill = remaining < buyOrder.amount
            ? remaining
            : buyOrder.amount;

        if (fill > 0) {
            buyOrder.amount -= fill;
            buyOrder.active = (buyOrder.amount > 0);
            remaining -= fill;

            if (buyOrder.amount == 0) {
                buyList[i] = buyList[buyList.length - 1];
                buyList.pop();
            } else {
                i++;
            }

            // 手数料計算（精度を保持したまま）
            uint256 takerGross = fill * bestBuyPrice;
            uint256 takerFee = (takerGross * takerFeeRate) / 10000;
            uint256 makerFee = (fill * makerFeeRate) / 10000;

            // 正味金額の計算（精度を保持したまま）
            uint256 takerNet = takerGross > takerFee
                ? takerGross - takerFee
                : 0;
            uint256 makerNet = fill > makerFee ? fill - makerFee : 0;

            // 最終的な金額を6桁精度に切り捨て
            uint256 truncatedTakerNet = _truncateToMinimumDecimals(takerNet);
            uint256 truncatedMakerNet = _truncateToMinimumDecimals(makerNet);

            // 残高更新（切り捨て後の金額を使用）
            _tradingVault.creditBalance(
                incoming.user,
                incoming.quote,
                truncatedTakerNet
            );
            _tradingVault.creditBalance(
                buyOrder.user,
                incoming.base,
                truncatedMakerNet
            );

            // 手数料の収集（切り捨てなし）
            takerFeesCollected[incoming.quote] += takerFee;
            makerFeesCollected[incoming.base] += makerFee;

            emit TradeExecuted(
                buyOrderId,
                orderId,
                incoming.base,
                incoming.quote,
                bestBuyPrice,
                fill,
                makerFee,
                takerFee
            );
        }

        return (remaining, i);
    }

    function _finalizeOrder(
        Order storage order,
        uint256 remaining,
        uint256 originalAmount
    ) internal {
        order.amount = remaining;
        order.active = (remaining > 0);

        if (order.price == 0 && remaining > 0) {
            uint256 refundAmount = 0;
            address refundToken = address(0);

            if (order.side == OrderSide.Buy) {
                uint256 lockedAmount = _tradingVault.getLockedAmount(order.id);
                refundAmount = (lockedAmount * remaining) / originalAmount;
                refundToken = order.quote;
            } else {
                refundAmount = remaining;
                refundToken = order.base;
            }

            require(
                refundAmount == 0 || refundToken != address(0),
                "Invalid refund token"
            );

            if (refundAmount > 0) {
                // 返金額も6桁精度に切り捨て
                uint256 truncatedRefund = _truncateToMinimumDecimals(
                    refundAmount
                );
                _tradingVault.creditBalance(
                    order.user,
                    refundToken,
                    truncatedRefund
                );
            }
        }
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

        bytes32 pairId = _generatePairId(order.base, order.quote);
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
     * @notice Returns the best (first active) order for a given trading pair and side.
     * @param pairId The trading pair identifier.
     * @param side Order side (Buy or Sell).
     * @return orderResult The best order as a BestOrderResult struct.
     */
    function getBestOrder(
        bytes32 pairId,
        OrderSide side
    ) public view returns (BestOrderResult memory orderResult) {
        OrderBook storage ob = orderBooks[pairId];
        uint256 bestPrice;
        uint256[] storage ordersAtPrice;
        if (side == OrderSide.Buy) {
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
        BestOrderResult memory bestBuy = getBestOrder(pairId, OrderSide.Buy);
        BestOrderResult memory bestSell = getBestOrder(pairId, OrderSide.Sell);
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
        BestOrderResult memory bestBuy = getBestOrder(key, OrderSide.Buy);
        BestOrderResult memory bestSell = getBestOrder(key, OrderSide.Sell);
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
     * @return results Array of BaseInfoResult structures.
     */
    function getBaseInfo(
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
     * @notice Returns Quote Token balance and allowance for a list of owners and tokens.
     * @param owners Array of owner addresses.
     * @param tokens Array of Base Token addresses (must be same length as owners).
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

    function getOrdersWithPagination(
        bytes32 pairId,
        OrderSide side,
        uint256 startPrice, // 開始価格（0の場合は最高値/最安値から）
        uint256 limit
    ) external view returns (OrderPage memory) {
        OrderBook storage ob = orderBooks[pairId];
        RedBlackTreeLib.Tree storage tree = side == OrderSide.Buy
            ? ob.buyTree
            : ob.sellTree;

        // 開始価格の設定
        uint256 price = startPrice == 0
            ? (side == OrderSide.Buy ? tree.getMax() : tree.getMin())
            : startPrice;

        // 全オーダー数をカウント
        uint256 totalCount = 0;
        uint256 countPrice = side == OrderSide.Buy
            ? tree.getMax()
            : tree.getMin();
        while (countPrice > 0) {
            uint256[] storage orderIds = side == OrderSide.Buy
                ? ob.buyOrdersAtPrice[countPrice]
                : ob.sellOrdersAtPrice[countPrice];
            for (uint256 i = 0; i < orderIds.length; i++) {
                if (orders[orderIds[i]].active) {
                    totalCount++;
                }
            }
            countPrice = side == OrderSide.Buy
                ? tree.getPrevious(countPrice)
                : tree.getNext(countPrice);
        }

        // 現在のページのオーダーを取得
        Order[] memory pageOrders = new Order[](limit);
        uint256 count = 0;
        uint256 nextPrice = 0;

        while (price > 0 && count < limit) {
            uint256[] storage orderIds = side == OrderSide.Buy
                ? ob.buyOrdersAtPrice[price]
                : ob.sellOrdersAtPrice[price];

            for (uint256 i = 0; i < orderIds.length && count < limit; i++) {
                Order storage order = orders[orderIds[i]];
                if (order.active) {
                    pageOrders[count] = order;
                    count++;
                }
            }

            price = side == OrderSide.Buy
                ? tree.getPrevious(price)
                : tree.getNext(price);

            if (count >= limit && price > 0) {
                nextPrice = price; // 次のページの開始価格を設定
                break;
            }
        }

        // 結果配列のサイズを実際のカウントに調整
        Order[] memory result = new Order[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = pageOrders[i];
        }

        return
            OrderPage({
                orders: result,
                nextPrice: nextPrice,
                totalCount: totalCount
            });
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

    /// @notice 金額を小数点以下6桁の精度に切り捨て
    /// @dev 切り捨て前の値が0より大きく、切り捨て後が0になる場合は最小値を返す
    function _truncateToMinimumDecimals(
        uint256 amount
    ) internal pure returns (uint256) {
        // 小さな値（AMOUNT_PRECISION_FACTOR未満）の場合は、そのまま返す
        if (amount < AMOUNT_PRECISION_FACTOR) {
            return amount;
        }

        uint256 truncated = (amount / AMOUNT_PRECISION_FACTOR) *
            AMOUNT_PRECISION_FACTOR;
        // 切り捨てによってゼロになるが、元の値が0より大きい場合は最小値を設定
        if (truncated == 0 && amount > 0) {
            return MINIMUM_AMOUNT;
        }
        return truncated;
    }

    /// @notice 価格を小数点以下2桁の精度に切り捨て
    function _truncatePrice(uint256 price) internal pure returns (uint256) {
        return (price / PRICE_PRECISION_FACTOR) * PRICE_PRECISION_FACTOR;
    }
}
