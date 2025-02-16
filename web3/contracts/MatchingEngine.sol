// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IERC20.sol";
import "./library/RedBlackTreeLib.sol";
import "./interfaces/IMatchingEngine.sol";

/**
 * @title MatchingEngine
 * @dev A production-oriented on-chain matching engine supporting multiple ERC20 token pairs.
 *      It maintains order books using a Red-Black Tree, supports partial fills (FIFO),
 *      calculates maker/taker fees (collected per tokenOut), and provides snapshot functions for front-end use.
 */
contract MatchingEngine {
    using RedBlackTreeLib for RedBlackTreeLib.Tree;

    // Using OrderSide enum from IMatchingEngine interface.

    // Order structure with token pair info.
    struct Order {
        uint256 id;
        address user;
        address tokenIn; // Token being sold
        address tokenOut; // Token being bought
        uint256 price; // Price: tokenOut per tokenIn (multiplier)
        uint256 amount; // Remaining order amount
        IMatchingEngine.OrderSide side;
        uint256 timestamp;
        bool active;
        uint256 next; // Linked list pointer for FIFO within same price level.
    }

    // OrderBook structure for a specific trading pair.
    struct OrderBook {
        RedBlackTreeLib.Tree buyTree; // Buy orders (max price first)
        RedBlackTreeLib.Tree sellTree; // Sell orders (min price first)
        // Mapping: price level => array of order IDs (FIFO)
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

    address public admin;

    // Array of pair IDs for front-end iteration.
    bytes32[] public pairKeys;
    // Mapping: pair ID => Pair (token addresses and decimals).
    struct Pair {
        address[2] tokenz; // [base, quote]
        uint256[2] decimals; // [base decimals, quote decimals]
    }
    mapping(bytes32 => Pair) internal pairs;

    // Events.
    event OrderPlaced(
        uint256 indexed orderId,
        address indexed user,
        IMatchingEngine.OrderSide side,
        address tokenIn,
        address tokenOut,
        uint256 price,
        uint256 amount
    );
    event OrderCancelled(uint256 indexed orderId, address indexed user);
    event TradeExecuted(
        uint256 indexed buyOrderId,
        uint256 indexed sellOrderId,
        address tokenIn,
        address tokenOut,
        uint256 price,
        uint256 amount,
        uint256 makerFee,
        uint256 takerFee
    );
    event FeesWithdrawn(
        address indexed token,
        uint256 makerFeeAmount,
        uint256 takerFeeAmount
    );
    event PairAdded(
        bytes32 indexed pairId,
        address tokenIn,
        address tokenOut,
        uint256[2] decimals,
        uint256 timestamp
    );
    // New event for fee rate updates
    event FeeRatesUpdated(uint256 makerFeeRate, uint256 takerFeeRate);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(uint256 _makerFeeRate, uint256 _takerFeeRate) {
        admin = msg.sender;
        makerFeeRate = _makerFeeRate;
        takerFeeRate = _takerFeeRate;
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
    ) external onlyAdmin {
        bytes32 pairId = getPairId(tokenIn, tokenOut);
        require(pairs[pairId].tokenz[0] == address(0), "Pair exists");
        pairs[pairId] = Pair(
            [tokenIn, tokenOut],
            [decimalsBase, decimalsQuote]
        );
        pairKeys.push(pairId);
        emit PairAdded(
            pairId,
            tokenIn,
            tokenOut,
            [decimalsBase, decimalsQuote],
            block.timestamp
        );
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
        IMatchingEngine.OrderSide side,
        uint256 price,
        uint256 amount
    ) external returns (uint256 orderId) {
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
        if (side == IMatchingEngine.OrderSide.Buy) {
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
        emit OrderPlaced(
            orderId,
            msg.sender,
            side,
            tokenIn,
            tokenOut,
            price,
            amount
        );

        _matchOrder(pairId, orderId);
        return orderId;
    }

    /**
     * @dev Internal function to match an order with orders on the opposite side.
     *      Matches orders in FIFO order within each price level.
     *      Calculates maker and taker fees (collected in tokenOut) and emits TradeExecuted events.
     * @param pairId Trading pair identifier.
     * @param orderId Incoming order ID.
     */
    function _matchOrder(bytes32 pairId, uint256 orderId) internal {
        Order storage incoming = orders[orderId];
        if (!incoming.active) return;

        OrderBook storage ob = orderBooks[pairId];
        uint256 remaining = incoming.amount;

        if (incoming.side == IMatchingEngine.OrderSide.Buy) {
            // Match buy order against sell orders with price <= incoming.price.
            uint256 bestSellPrice = ob.sellTree.getMin();
            while (
                remaining > 0 &&
                bestSellPrice > 0 &&
                bestSellPrice <= incoming.price
            ) {
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
                    uint256 tradeVolume = fill * bestSellPrice; // In tokenOut units.
                    uint256 makerFee = (tradeVolume * makerFeeRate) / 10000;
                    uint256 takerFee = (tradeVolume * takerFeeRate) / 10000;

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
                        orderId, // Buy order ID (taker)
                        sellOrderId, // Sell order ID (maker)
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
                bestBuyPrice >= incoming.price
            ) {
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
                    uint256 tradeVolume = fill * bestBuyPrice;
                    uint256 makerFee = (tradeVolume * makerFeeRate) / 10000;
                    uint256 takerFee = (tradeVolume * takerFeeRate) / 10000;

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
                        buyOrderId, // Buy order ID (maker)
                        orderId, // Sell order ID (taker)
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
            // For simplicity, available amounts are assumed to be the remaining order amount.
            orderResults[index] = OrderResult({
                price: ord.price,
                orderId: ord.id,
                nextOrderId: ord.next,
                maker: ord.user,
                expiry: ord.timestamp, // Using timestamp as a placeholder for expiry.
                tokens: ord.amount,
                availableBase: ord.amount,
                availableQuote: ord.amount * ord.price
            });
            index++;
        }
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
     * @notice Returns an array of pairs starting from a given offset.
     * @param count Number of pairs to return.
     * @param offset Starting index.
     * @return pairResults Array of PairResult structures.
     */
    function getPairs(
        uint count,
        uint offset
    ) external view returns (PairResult[] memory pairResults) {
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
    function getTokenInfo(
        address[] calldata tokens
    ) external view returns (TokenInfoResult[] memory results) {
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
    function setFeeRates(
        uint256 _makerFeeRate,
        uint256 _takerFeeRate
    ) external onlyAdmin {
        makerFeeRate = _makerFeeRate;
        takerFeeRate = _takerFeeRate;
        emit FeeRatesUpdated(_makerFeeRate, _takerFeeRate);
    }

    /**
     * @notice Allows the admin to withdraw collected fees for a given token (tokenOut).
     * @param token The token address.
     */
    function withdrawFees(address token) external onlyAdmin {
        uint256 makerAmount = makerFeesCollected[token];
        uint256 takerAmount = takerFeesCollected[token];
        require(makerAmount + takerAmount > 0, "No fees to withdraw");
        makerFeesCollected[token] = 0;
        takerFeesCollected[token] = 0;
        IERC20(token).transfer(admin, makerAmount + takerAmount);
        emit FeesWithdrawn(token, makerAmount, takerAmount);
    }

    /**
     * @notice Returns the best order for a given trading pair and order side.
     * @param pairId The trading pair identifier.
     * @param side The side of the order (Buy or Sell).
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
            orderId: bestOrderId,
            nextOrderId: ordersAtPrice.length > 1 ? ordersAtPrice[1] : 0,
            maker: o.user,
            expiry: o.timestamp, // ※ 本来は有効期限などを利用する場合は適切に変更してください
            tokens: o.amount,
            availableBase: o.amount, // 仮実装。必要に応じて発注者の実際の残高等から算出してください
            availableQuote: 0 // 仮実装。算出ロジックに合わせて修正してください
        });
    }
}

// ---------------- Structs for Front-End Snapshot Results ----------------

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
