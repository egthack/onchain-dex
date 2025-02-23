// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ITradingVault.sol";
import "./interfaces/IMatchingEngine.sol";
import "./library/VaultLib.sol";
import "./Events.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TradingVault
 * @dev Manages user balances, fund deposits/withdrawals.
 *      It allows executing batched trades via an external MatchingEngine.
 */
contract TradingVault is ITradingVault, Ownable, ReentrancyGuard {
    // Mapping: user => (token => available balance)
    mapping(address => mapping(address => uint256)) public balances;
    // Matching engine contract instance
    IMatchingEngine public immutable engine;
    // 注文IDごとにロックした金額を保存
    mapping(uint256 => uint256) private lockedAmounts;

    constructor(address _engine) Ownable(msg.sender) {
        engine = IMatchingEngine(_engine);
    }

    modifier onlyMatchingEngine() {
        require(
            msg.sender == address(engine),
            "Only MatchingEngine can call this function"
        );
        _;
    }

    /**
     * @notice Deposits tokens into the Vault.
     */
    function deposit(
        address token,
        uint256 amount
    ) external override nonReentrant {
        require(amount > 0, "Amount must be > 0");

        bool success = IERC20(token).transferFrom(
            msg.sender,
            address(this),
            amount
        );
        require(success, "Token transfer failed");

        balances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    /**
     * @notice Withdraws tokens from the Vault.
     */
    function withdraw(
        address token,
        uint256 amount
    ) external override nonReentrant {
        // ゼロ金額の引き出しを許可
        if (amount == 0) return;
        require(balances[msg.sender][token] >= amount, "Insufficient balance");

        balances[msg.sender][token] -= amount;

        bool success = IERC20(token).transfer(msg.sender, amount);
        require(success, "Token transfer failed");

        emit Withdrawal(msg.sender, token, amount);
    }

    /**
     * @notice Retrieves the balance for a given user and token.
     */
    function getBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return balances[user][token];
    }

    /**
     * @notice Executes a batch of trades via the MatchingEngine.
     */
    function executeTradeBatch(
        VaultLib.TradeRequest[] calldata trades
    ) external override nonReentrant {
        for (uint256 i = 0; i < trades.length; i++) {
            _executeSingleTrade(trades[i]);
        }
    }

    /**
     * @notice Deducts the balance for a given user and token.
     */
    function deductBalance(
        address user,
        address token,
        uint256 amount
    ) external onlyMatchingEngine {
        balances[user][token] -= amount;
    }

    /**
     * @notice Credits the balance for a given user and token.
     */
    function creditBalance(
        address user,
        address token,
        uint256 amount
    ) external onlyMatchingEngine {
        balances[user][token] += amount;
    }

    /**
     * @dev Executes a single trade by interacting with the MatchingEngine.
     *      Deducts base from the user's Vault balance, approves the MatchingEngine,
     *      and calls placeOrder on the MatchingEngine.
     *      The MatchingEngine returns the output amount (quote) after matching.
     */
    function _executeSingleTrade(VaultLib.TradeRequest calldata req) internal {
        VaultLib.checkTradeRequest(req);

        // 1. トークンのロックと注文の作成
        uint256 lockedAmount = _lockTokens(req);
        uint256 orderId = engine.placeOrder(
            req.user,
            req.base,
            req.quote,
            req.side,
            req.amount,
            req.price
        );
        lockedAmounts[orderId] = lockedAmount;

        // 2. 注文作成後すぐにマッチング処理を実行
        engine.matchOrder(orderId);

        emit OrderPlaced(
            orderId,
            req.user,
            req.side,
            req.base,
            req.quote,
            req.price,
            req.amount
        );
    }

    /**
     * @notice Cancels an active order in the MatchingEngine and refunds locked funds.
     * @param orderId The ID of the order to cancel.
     * @return true if cancellation succeeded.
     */
    function cancelOrder(uint256 orderId) external nonReentrant returns (bool) {
        // 1. Get the order information from the MatchingEngine
        IMatchingEngine.Order memory order = engine.getOrder(orderId);
        require(order.user == msg.sender, "Not order owner");

        // 2. Execute the cancellation process on the MatchingEngine
        bool success = engine.cancelOrder(orderId);
        require(success, "Engine cancellation failed");

        // 3. Refund the remaining order amount (order.amount) to the user's vault balance
        if (order.amount > 0) {
            balances[msg.sender][order.base] += order.amount;
        }

        emit OrderCancelled(orderId, msg.sender);
        return true;
    }

    function getLockedAmount(uint256 orderId) external view returns (uint256) {
        return lockedAmounts[orderId];
    }

    function _lockTokens(
        VaultLib.TradeRequest memory req
    ) internal returns (uint256) {
        uint256 quoteAmount = 0;
        uint256 baseAmount;

        if (req.side == IMatchingEngine.OrderSide.Buy) {
            if (req.price == 0) {
                // 対向の板があることだけを確認
                bytes32 pairId = engine.getPairId(req.base, req.quote);
                uint256 bestSellPrice = engine.getBestSellPrice(pairId);
                require(bestSellPrice > 0, "No sell orders available");
                // ロックは指定された数量で
                quoteAmount = req.amount;
            } else {
                quoteAmount = req.amount * req.price;
            }
            require(
                balances[req.user][req.quote] >= quoteAmount,
                "Insufficient quote balance"
            );
            balances[req.user][req.quote] -= quoteAmount;
        } else {
            if (req.price == 0) {
                // 対向の板があることだけを確認
                bytes32 pairId = engine.getPairId(req.base, req.quote);
                uint256 bestBuyPrice = engine.getBestBuyPrice(pairId);
                require(bestBuyPrice > 0, "No buy orders available");
            }
            // 売り注文は常にbase tokenの数量をロック
            baseAmount = req.amount;
            require(
                balances[req.user][req.base] >= baseAmount,
                "Insufficient base balance"
            );
            balances[req.user][req.base] -= baseAmount;
        }

        return quoteAmount; // ロックした金額を返す
    }

    /**
     * @notice Withdraws ETH from the Vault.
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "ETH transfer failed");
    }
}
