// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../library/VaultLib.sol";

/// @notice Interface for the Vault.
interface ITradingVault {
    function deposit(address token, uint256 amount) external;

    function withdraw(address token, uint256 amount) external;

    function withdrawETH() external;

    function executeTradeBatch(
        VaultLib.TradeRequest[] calldata trades
    ) external;

    function deductBalance(
        address user,
        address token,
        uint256 amount
    ) external;

    function creditBalance(
        address user,
        address token,
        uint256 amount
    ) external;

    /**
     * @notice Returns the locked amount for a given order
     * @param orderId The order ID
     * @return The locked amount
     */
    function getLockedAmount(uint256 orderId) external view returns (uint256);
}
