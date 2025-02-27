// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../library/VaultLib.sol";
import "./IMatchingEngine.sol";

/// @notice Interface for the Vault.
interface ITradingVault {
    /// @notice Thrown when token decimals are insufficient
    error InsufficientDecimals(address token, uint8 decimals);

    /**
     * @notice Deposits tokens into the Vault.
     * @param token The token address to deposit
     * @param amount The amount to deposit (in token's original decimals)
     */
    function deposit(address token, uint256 amount) external;

    /**
     * @notice Withdraws tokens from the Vault.
     * @param token The token address to withdraw
     * @param amount The amount to withdraw (in token's original decimals)
     */
    function withdraw(address token, uint256 amount) external;

    /**
     * @notice Retrieves the balance for a given user and token.
     * @param user The user address
     * @param token The token address
     * @return The balance in token's original decimals
     */
    function getBalance(
        address user,
        address token
    ) external view returns (uint256);

    /**
     * @notice Executes a batch of trades via the MatchingEngine.
     * @param trades Array of trade requests to execute
     */
    function executeTradeBatch(
        VaultLib.TradeRequest[] calldata trades
    ) external;

    /**
     * @notice Deducts the balance for a given user and token.
     * @param user The user address
     * @param token The token address
     * @param amount The amount to deduct (in token's original decimals)
     */
    function deductBalance(
        address user,
        address token,
        uint256 amount
    ) external;

    /**
     * @notice Credits the balance for a given user and token.
     * @param user The user address
     * @param token The token address
     * @param amount The amount to credit (in token's original decimals)
     */
    function creditBalance(
        address user,
        address token,
        uint256 amount
    ) external;

    /**
     * @notice Cancels an active order in the MatchingEngine and refunds locked funds.
     * @param orderId The ID of the order to cancel.
     * @return true if cancellation succeeded.
     */
    function cancelOrder(uint256 orderId) external returns (bool);

    /**
     * @notice Returns the locked amount for a given order
     * @param orderId The order ID
     * @return The locked amount
     */
    function getLockedAmount(uint256 orderId) external view returns (uint256);

    /**
     * @notice Withdraws ETH from the Vault.
     */
    function withdrawETH() external;
}
