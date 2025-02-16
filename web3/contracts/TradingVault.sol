// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IMatchingEngine.sol";
import "./library/VaultLib.sol";

/**
 * @title TradingVault
 * @dev Manages user balances and delegated trading approvals.
 *      It allows deposits, withdrawals, and executing batched trades via an external MatchingEngine.
 */
contract TradingVault is IVault {
    // Mapping: user => (token => balance)
    mapping(address => mapping(address => uint256)) public balances;

    // Mapping: user => (trader => TraderApproval)
    mapping(address => mapping(address => VaultLib.TraderApproval))
        public traderApprovals;

    // Matching engine contract instance
    IMatchingEngine public engine;

    constructor(address _engine) {
        engine = IMatchingEngine(_engine);
    }

    /**
     * @notice Deposits tokens into the Vault.
     */
    function deposit(address token, uint256 amount) external override {
        require(amount > 0, "Amount must be > 0");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
    }

    /**
     * @notice Withdraws tokens from the Vault.
     */
    function withdraw(address token, uint256 amount) external override {
        require(balances[msg.sender][token] >= amount, "Insufficient balance");
        balances[msg.sender][token] -= amount;
        IERC20(token).transfer(msg.sender, amount);
    }

    /**
     * @notice Sets approval for bots or delegated traders.
     */
    function setTraderApproval(
        address trader,
        bool approved,
        uint256 maxOrderSize,
        uint256 expiry
    ) external {
        traderApprovals[msg.sender][trader] = VaultLib.TraderApproval({
            approved: approved,
            maxOrderSize: maxOrderSize,
            expiry: expiry
        });
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
    ) external payable override {
        for (uint256 i = 0; i < trades.length; i++) {
            _executeSingleTrade(trades[i]);
        }
    }

    /**
     * @dev Executes a single trade by interacting with the MatchingEngine.
     *      Deducts tokenIn from the user's Vault balance, approves the MatchingEngine,
     *      and then calls placeOrder on the MatchingEngine.
     *      The MatchingEngine returns the output amount (tokenOut) after matching.
     */
    function _executeSingleTrade(VaultLib.TradeRequest calldata req) internal {
        // Check authorization using VaultLib.
        VaultLib.checkTradeRequest(req, traderApprovals);
        require(
            balances[req.user][req.tokenIn] >= req.amountIn,
            "Insufficient vault balance"
        );

        // Deduct funds from the Vault.
        balances[req.user][req.tokenIn] -= req.amountIn;

        // Approve MatchingEngine to spend tokenIn.
        IERC20(req.tokenIn).approve(address(engine), req.amountIn);

        // Call MatchingEngine to place the order.
        uint256 outAmount = engine.placeOrder(
            req.tokenIn,
            req.tokenOut,
            req.side,
            req.amountIn,
            req.minAmountOut
        );

        // Update user's Vault balance with tokenOut.
        balances[req.user][req.tokenOut] += outAmount;
    }
}
