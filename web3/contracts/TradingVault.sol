// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ITradingVault.sol";
import "./interfaces/IMatchingEngine.sol";
import "./library/VaultLib.sol";
import "./Events.sol"; 
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TradingVault
 * @dev Manages user balances, fund deposits/withdrawals.
 *      It allows executing batched trades via an external MatchingEngine.
 */
contract TradingVault is ITradingVault, Ownable {
    // Mapping: user => (token => available balance)
    mapping(address => mapping(address => uint256)) public balances;
    // Matching engine contract instance
    IMatchingEngine public engine;

    constructor(address _engine) Ownable(msg.sender) {
        engine = IMatchingEngine(_engine);
    }

    modifier onlyMatchingEngine() {
        require(msg.sender == address(engine), "Only MatchingEngine can call this function");
        _;
    }

    /**
     * @notice Deposits tokens into the Vault.
     */
    function deposit(address token, uint256 amount) external override {
        require(amount > 0, "Amount must be > 0");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    /**
     * @notice Withdraws tokens from the Vault.
     */
    function withdraw(address token, uint256 amount) external override {
        require(balances[msg.sender][token] >= amount, "Insufficient balance");
        balances[msg.sender][token] -= amount;
        IERC20(token).transfer(msg.sender, amount);
        emit Withdrawal(msg.sender, token, amount);
    }


    /**
     * @notice Retrieves the balance for a given user and token.
     */
    function getBalance(address user, address token) external view returns (uint256) {
        return balances[user][token];
    }

    /**
     * @notice Executes a batch of trades via the MatchingEngine.
     */
    function executeTradeBatch(VaultLib.TradeRequest[] calldata trades) external payable override {
        for (uint256 i = 0; i < trades.length; i++) {
            _executeSingleTrade(trades[i]);
        }
    }

    /**
     * @notice Deducts the balance for a given user and token.
     */
    function deductBalance(address user, address token, uint256 amount) external onlyMatchingEngine {
        balances[user][token] -= amount;
    }

    /**
     * @notice Credits the balance for a given user and token.
     */
    function creditBalance(address user, address token, uint256 amount) external onlyMatchingEngine {
        balances[user][token] += amount;
    }

    /**
     * @dev Executes a single trade by interacting with the MatchingEngine.
     *      Deducts base from the user's Vault balance, approves the MatchingEngine,
     *      and calls placeOrder on the MatchingEngine.
     *      The MatchingEngine returns the output amount (quote) after matching.
     */
    function _executeSingleTrade(VaultLib.TradeRequest calldata req) internal {
        // Check trade request authorization.
        VaultLib.checkTradeRequest(req);
        
        if (req.side == IMatchingEngine.OrderSide.Buy) { // Buy order: use quote tokens to pay
            // In a buy order, the user pays using Quote Tokens.
            uint256 requiredQuote = req.amount * req.price;
            require(balances[req.user][req.quote] >= requiredQuote, "Insufficient vault balance");
            balances[req.user][req.quote] -= requiredQuote;
            
            engine.placeOrder(
                req.user,
                req.base,
                req.quote,
                req.side,
                req.amount,
                req.price
            );
        } else { // Sell order: use base as collateral
            require(balances[req.user][req.base] >= req.amount, "Insufficient vault balance");
            balances[req.user][req.base] -= req.amount;
            
            engine.placeOrder(
                req.user,
                req.base,
                req.quote,
                req.side,
                req.amount,
                req.price
            );
        }
    }

    /**
     * @notice Cancels an active order in the MatchingEngine and refunds locked funds.
     * @param orderId The ID of the order to cancel.
     * @return true if cancellation succeeded.
     */
    function cancelOrder(uint256 orderId) external returns (bool) {
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
}