// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
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
    /// @notice 必要最小限の小数点以下桁数
    uint8 private constant MINIMUM_DECIMALS = 6;
    /// @notice 最小取引量（1 = 0.000001 * 10^6）
    uint256 private constant MINIMUM_AMOUNT = 1;
    /// @notice 精度調整用の係数（小数点以下6桁精度）
    uint256 private constant PRECISION_FACTOR = 1000000;

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

    /// @notice トークンの小数点以下桁数を検証
    function _validateTokenDecimals(address token) internal view {
        uint8 decimals = IERC20Metadata(token).decimals();
        if (decimals < MINIMUM_DECIMALS) {
            revert InsufficientDecimals(token, decimals);
        }
    }

    /// @notice 金額を小数点以下6桁の精度に切り捨て
    /// @dev 切り捨て前の値が0より大きく、切り捨て後が0になる場合は最小値を返す
    function _truncateToMinimumDecimals(
        uint256 amount
    ) internal pure returns (uint256) {
        // 小さな値（PRECISION_FACTOR未満）の場合は、そのまま返す
        if (amount < PRECISION_FACTOR) {
            return amount;
        }

        uint256 truncated = (amount / PRECISION_FACTOR) * PRECISION_FACTOR;
        // 切り捨てによってゼロになるが、元の値が0より大きい場合は最小値を設定
        if (truncated == 0 && amount > 0) {
            return MINIMUM_AMOUNT;
        }
        return truncated;
    }

    /**
     * @notice Deposits tokens into the Vault.
     */
    function deposit(
        address token,
        uint256 amount
    ) external override nonReentrant {
        require(amount > 0, "Amount must be > 0");

        // トークンの小数点以下桁数を検証
        _validateTokenDecimals(token);

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

        // トークンの小数点以下桁数を検証
        _validateTokenDecimals(req.base);
        _validateTokenDecimals(req.quote);

        // 最小取引量のチェック
        require(req.amount >= MINIMUM_AMOUNT, "Amount below minimum threshold");

        // 1. トークンのロックと注文の作成
        uint256 lockedAmount = _lockTokens(req);

        // 注文量を小数点以下6桁の精度に切り捨て
        uint256 truncatedAmount = _truncateToMinimumDecimals(req.amount);

        uint256 orderId = engine.placeOrder(
            req.user,
            req.base,
            req.quote,
            req.side,
            truncatedAmount,
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
            truncatedAmount
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
            // トークンのdecimalsを取得
            uint8 baseDecimals = IERC20Metadata(order.base).decimals();
            // order.amountは6桁精度なので、トークンのdecimals精度に変換
            uint256 refundAmount = order.amount *
                (10 ** (baseDecimals - MINIMUM_DECIMALS));
            balances[msg.sender][order.base] += refundAmount;
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
        uint256 exactQuoteAmount = 0;
        uint256 exactBaseAmount = 0;
        uint256 truncatedQuoteAmount = 0;
        uint256 truncatedBaseAmount = 0;

        // トークンのdecimalsを取得
        uint8 baseDecimals = IERC20Metadata(req.base).decimals();
        uint8 quoteDecimals = IERC20Metadata(req.quote).decimals();

        if (req.side == IMatchingEngine.OrderSide.Buy) {
            if (req.price == 0) {
                // 対向の板があることだけを確認
                bytes32 pairId = engine.getPairId(req.base, req.quote);
                uint256 bestSellPrice = engine.getBestSellPrice(pairId);
                require(bestSellPrice > 0, "No sell orders available");
                // ロックは指定された数量で
                exactQuoteAmount = req.amount;
            } else {
                // amount(6桁) * price(2桁) / 100 = 6桁
                // 先にamountとpriceを掛け算してから100で割る
                exactQuoteAmount = req.amount * req.price;
                require(
                    exactQuoteAmount >= MINIMUM_AMOUNT * 100,
                    "Quote amount below minimum threshold"
                );
                exactQuoteAmount = exactQuoteAmount / 100;
            }
            // 新たに6桁精度に切り捨てる
            truncatedQuoteAmount = _truncateToMinimumDecimals(exactQuoteAmount);

            // 残高チェックは完全な精度で行う
            require(
                balances[req.user][req.quote] >= exactQuoteAmount,
                "Insufficient quote balance"
            );

            uint256 scaledQuoteAmount = truncatedQuoteAmount * (10 ** (quoteDecimals - MINIMUM_DECIMALS));
            balances[req.user][req.quote] -= scaledQuoteAmount;

            return scaledQuoteAmount;
        } else {
            if (req.price == 0) {
                // 対向の板があることだけを確認
                bytes32 pairId = engine.getPairId(req.base, req.quote);
                uint256 bestBuyPrice = engine.getBestBuyPrice(pairId);
                require(bestBuyPrice > 0, "No buy orders available");
            }
            // 売り注文は常にbase tokenの数量をロック
            exactBaseAmount = req.amount;

            // 小数点以下6桁の精度に切り捨て
            truncatedBaseAmount = _truncateToMinimumDecimals(exactBaseAmount);

            // 残高チェックは完全な精度で行う
            require(
                balances[req.user][req.base] >= exactBaseAmount,
                "Insufficient base balance"
            );

            // 残高から引く金額は切り捨てた値を使用（6桁→baseトークンのdecimals）
            uint256 scaledBaseAmount = truncatedBaseAmount * (10 ** (baseDecimals - MINIMUM_DECIMALS));
            balances[req.user][req.base] -= scaledBaseAmount;

            // 返り値（ロックした金額）はbaseトークンのdecimals精度の値
            return scaledBaseAmount;
        }
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
