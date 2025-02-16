// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IDex.sol";
import "./library/VaultLib.sol";

contract TradingVault is IVault {
    // Mapping from user address to (token address => balance)
    mapping(address => mapping(address => uint256)) public balances;

    // Mapping from user address to (trader address => TraderApproval)
    mapping(address => mapping(address => TraderApproval))
        public traderApprovals;

    IDex public dex;

    constructor(address _dex) {
        dex = IDex(_dex);
    }

    /**
     * @notice Deposits tokens into the Vault.
     */
    function deposit(address token, uint256 amount) external override {
        require(amount > 0, "Amount must be > 0");
        // Transfers tokens from the user's wallet to this contract.
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
     * @notice Sets the approval for bots or delegated traders.
     */
    function setTraderApproval(
        address trader,
        bool approved,
        uint256 maxOrderSize,
        uint256 expiry
    ) external {
        traderApprovals[msg.sender][trader] = TraderApproval({
            approved: approved,
            maxOrderSize: maxOrderSize,
            expiry: expiry
        });
    }

    /**
     * @notice Retrieves the token balance for a user.
     */
    function getBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return balances[user][token];
    }

    /**
     * @notice Executes multiple trades in a batch.
     * Designed for gas optimization and automated execution by bots.
     */
    function executeTradeBatch(
        TradeRequest[] calldata trades
    ) external override {
        for (uint256 i = 0; i < trades.length; i++) {
            _executeSingleTrade(trades[i]);
        }
    }

    /**
     * @dev Executes an individual trade within the batch.
     */
    function _executeSingleTrade(TradeRequest calldata req) internal {
        // Authorization check using the library.
        VaultLib.checkTradeRequest(req, traderApprovals);

        // Balance check.
        require(
            balances[req.user][req.tokenIn] >= req.amountIn,
            "Insufficient vault balance"
        );

        // Example: Deposit assets from Vault to DEX, perform a swap, and return assets to Vault.
        // (Some DEX implementations might support direct swaps via transferFrom)
        balances[req.user][req.tokenIn] -= req.amountIn;

        // Step 1: Vault -> DEX deposit
        IERC20(req.tokenIn).approve(address(dex), req.amountIn);
        dex.deposit(req.tokenIn, req.amountIn);

        // Step 2: Execute swap
        uint256 outAmount = dex.swap(
            req.tokenIn,
            req.tokenOut,
            req.amountIn,
            req.minAmountOut
        );

        // Step 3: DEX -> Vault withdrawal
        dex.withdraw(req.tokenOut, outAmount);

        // Step 4: Update the user's Vault balance
        balances[req.user][req.tokenOut] += outAmount;
    }
}
