// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @notice On-chain DEX interface
 * A simplified example assuming deposit, withdraw, and swap functionalities.
 */
interface IDex {
    function deposit(address token, uint256 amount) external;

    function withdraw(address token, uint256 amount) external;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 actualAmountOut);
}

/**
 * @notice Interface for interacting with the Vault contract
 * Designed to enable consistent external calls for high-speed trading and batch processing.
 */
interface IVault {
    function deposit(address token, uint256 amount) external;

    function withdraw(address token, uint256 amount) external;

    function executeTradeBatch(TradeRequest[] calldata trades) external;
    // ...necessary to add
}

/**
 * @notice Trade parameter definition
 * Used when bots or users issue instructions to the Vault.
 */
struct TradeRequest {
    address user; // The user executing the trade (asset owner)
    address tokenIn; // Token to sell
    address tokenOut; // Token to purchase
    uint256 amountIn; // Sell amount
    uint256 minAmountOut; // Minimum amount to receive (to mitigate slippage)
    bytes32 preApprovalId; // Pre-approval ID (assumed to be verified by signature)
    bytes signature; // User's signature
}

/**
 * @notice Structure for approving bots or external traders
 */
struct TraderApproval {
    bool approved; // Approval status
    uint256 maxOrderSize; // Maximum order size that a bot can handle at one time
    uint256 expiry; // Approval expiry (timestamp)
}
