// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../library/VaultLib.sol";
import "./IMatchingEngine.sol";

/// @notice Interface for the Vault.
interface ITradingVault {
    /**
     * @notice Deposits tokens into the Vault.
     */
    function deposit(address token, uint256 amount) external;

    /**
     * @notice Withdraws tokens from the Vault.
     */
    function withdraw(address token, uint256 amount) external;

    /**
     * @notice Retrieves the balance for a given user and token.
     */
    function getBalance(
        address user,
        address token
    ) external view returns (uint256);

    /**
     * @notice Executes a batch of trades via the MatchingEngine.
     */
    function executeTradeBatch(
        VaultLib.TradeRequest[] calldata trades
    ) external;

    /**
     * @notice Deducts the balance for a given user and token.
     */
    function deductBalance(
        address user,
        address token,
        uint256 amount
    ) external;

    /**
     * @notice Credits the balance for a given user and token.
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
