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
            // 買い注文の場合
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
                    uint256 fill;
                    if (incoming.price == 0) {
                        // 成行買い注文
                        // remainingはquote token量なので、base token量に変換
                        uint256 maxBaseFill = remaining / bestSellPrice; // quote -> base
                        fill = maxBaseFill < sellOrder.amount
                            ? maxBaseFill
                            : sellOrder.amount;
                    } else {
                        fill = remaining < sellOrder.amount
                            ? remaining
                            : sellOrder.amount;
                    }

                    if (fill > 0) {
                        // 状態変更を先に行う
                        sellOrder.amount -= fill;
                        sellOrder.active = (sellOrder.amount > 0);
                        remaining -= (incoming.price == 0)
                            ? fill * bestSellPrice // quote token amount
                            : fill; // base token amount
                        if (sellOrder.amount == 0) {
                            sellList[i] = sellList[sellList.length - 1];
                            sellList.pop();
                        } else {
                            i++;
                        }

                        // ■ 想定するトークンフロー(do not remove this comment)
                        // • 入力注文（taker：Buy）の場合：
                        //    - taker は base トークンから手数料を差し引いた分を受け取る (fill - takerFee)
                        //    - taker は quote トークンを差し引き (fill × bestSellPrice) -> lock済みなのでここでは処理しない
                        // • 対する resting 注文（maker：Sell）の場合：
                        //    - maker は quote トークンから手数料を差し引いた分を受け取る (fill × bestSellPrice - makerFee)
                        //    - maker は base トークンを差し引き (fill) -> lock済みなのでここでは処理しない
                        // 
                        // --- 手数料計算 ---
                        // • 入力注文（taker：Buy）の場合：
                        //    - taker（買い注文の発行者）は base token を受け取るので、手数料は base token から差し引く
                        //    - maker（売り注文の発行者）は quote token を受け取るので、手数料は quote token から差し引く
                        uint256 takerFee = (fill * takerFeeRate) / 10000;
                        uint256 makerGross = fill * bestSellPrice;
                        uint256 makerFee = (makerGross * makerFeeRate) / 10000;
                        uint256 takerNet = fill > takerFee ? fill - takerFee : 0;
                        uint256 makerNet = makerGross > makerFee ? makerGross - makerFee : 0;

                        // Vaultへの反映：実際にユーザーが受け取る金額は手数料控除後
                        _tradingVault.creditBalance(
                            incoming.user,
                            incoming.base,
                            takerNet
                        );
                        _tradingVault.creditBalance(
                            sellOrder.user,
                            incoming.quote,
                            makerNet
                        );

                        // 手数料の蓄積
                        takerFeesCollected[incoming.base] += takerFee;
                        makerFeesCollected[incoming.quote] += makerFee;

                        // TradeExecuted イベントに手数料情報を付与
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
                }
                if (sellList.length == 0) {
                    ob.sellTree.remove(bestSellPrice);
                }
                bestSellPrice = ob.sellTree.getMin();
            }
        } else {
            // 売り注文の場合
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

                        // ■ 想定するトークンフロー(do not remove this comment)
                        // • 入力注文（taker：Sell）の場合：
                        //    - taker は quote トークンから手数料を差し引いた分を受け取る (fill × bestBuyPrice - takerFee)
                        //    - taker は base トークンを差し引き (fill)-> lock済みなのでここでは処理しない
                        // • 対する resting 注文（maker：Buy）の場合：
                        //    - maker は quote トークンを差し引き (fill × bestBuyPrice) -> lock済みなのでここでは処理しない
                        //    - maker は base トークンから手数料を差し引いた分を受け取る (fill - makerFee)
                        // 
                        // --- 手数料計算 ---
                        // • 入力注文（taker：Sell）の場合：
                        //    - taker（売り注文の発行者）は quote token を受け取るので、手数料は quote token から差し引く
                        //    - maker（買い注文の発行者）は base token を受け取るので、手数料は base token から差し引く
                        uint256 takerGross = fill * bestBuyPrice;
                        uint256 takerFee = (takerGross * takerFeeRate) / 10000;
                        uint256 makerFee = (fill * makerFeeRate) / 10000;
                        uint256 takerNet = takerGross > takerFee ? takerGross - takerFee : 0;
                        uint256 makerNet = fill > makerFee ? fill - makerFee : 0;

                        // Vaultへの反映：実際にユーザーが受け取る金額は手数料控除後    
                        _tradingVault.creditBalance(
                            incoming.user,
                            incoming.quote,
                            takerNet
                        );
                        _tradingVault.creditBalance(
                            buyOrder.user,
                            incoming.base,
                            makerNet
                        );

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
                }
                if (buyList.length == 0) {
                    ob.buyTree.remove(bestBuyPrice);
                }
                bestBuyPrice = ob.buyTree.getMax();
            }
        }

        // 状態変更を先に行う（注文の残量更新)
        incoming.amount = remaining;
        incoming.active = (remaining > 0);

        // 成行注文の処理のための状態も先に計算(成行注文の場合、未執行分の返金処理)
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

        require(
            refundAmount == 0 || refundToken != address(0),
            "Invalid refund token"
        );

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

    struct OrderPage {
        Order[] orders; // 現在のページのオーダー
        uint256 nextPrice; // 次のページの開始価格（0の場合は最後のページ）
        uint256 totalCount; // 全オーダー数
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
}
