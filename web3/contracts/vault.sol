// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Vault
 * @dev This contract manages user funds for both Spot and Perp trading.
 *      It supports deposits, withdrawals, and internal transfers between
 *      the Spot and Perp vaults.
 */
contract Vault {
    using SafeERC20 for IERC20;

    // Enum to distinguish between Spot and Perp vault types.
    enum VaultType {
        Spot,
        Perp
    }

    // Mapping to track Spot vault balances: user address => token address => amount
    mapping(address => mapping(address => uint256)) private spotBalances;

    // Mapping to track Perp vault balances: user address => token address => amount
    mapping(address => mapping(address => uint256)) private perpBalances;

    // Events to log deposits, withdrawals, and internal transfers between vaults.
    event Deposit(
        address indexed user,
        address indexed token,
        uint256 amount,
        VaultType vaultType
    );
    event Withdraw(
        address indexed user,
        address indexed token,
        uint256 amount,
        VaultType vaultType
    );
    event InternalTransfer(
        address indexed user,
        address indexed token,
        uint256 amount,
        VaultType fromVault,
        VaultType toVault
    );

    /**
     * @dev Deposit tokens into the specified vault (Spot or Perp).
     * @param token The address of the ERC20 token to deposit.
     * @param amount The amount of tokens to deposit.
     * @param vaultType The target vault type (Spot or Perp).
     *
     * Note: The user must approve this contract to transfer tokens on their behalf.
     */
    function deposit(
        address token,
        uint256 amount,
        VaultType vaultType
    ) external {
        require(amount > 0, "Deposit: amount must be > 0");
        // Transfer tokens from the user to this contract.
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Update the corresponding vault balance.
        if (vaultType == VaultType.Spot) {
            spotBalances[msg.sender][token] += amount;
        } else {
            perpBalances[msg.sender][token] += amount;
        }
        emit Deposit(msg.sender, token, amount, vaultType);
    }

    /**
     * @dev Withdraw tokens from the specified vault (Spot or Perp).
     * @param token The address of the ERC20 token to withdraw.
     * @param amount The amount of tokens to withdraw.
     * @param vaultType The vault type to withdraw from (Spot or Perp).
     */
    function withdraw(
        address token,
        uint256 amount,
        VaultType vaultType
    ) external {
        require(amount > 0, "Withdraw: amount must be > 0");
        if (vaultType == VaultType.Spot) {
            require(
                spotBalances[msg.sender][token] >= amount,
                "Withdraw: insufficient spot balance"
            );
            spotBalances[msg.sender][token] -= amount;
        } else {
            require(
                perpBalances[msg.sender][token] >= amount,
                "Withdraw: insufficient perp balance"
            );
            perpBalances[msg.sender][token] -= amount;
        }
        // Transfer tokens from the contract back to the user.
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, token, amount, vaultType);
    }

    /**
     * @dev Transfer tokens between the Spot and Perp vaults for the caller.
     * @param token The address of the ERC20 token to transfer.
     * @param amount The amount of tokens to transfer.
     * @param fromVault The vault type to transfer from (Spot or Perp).
     * @param toVault The vault type to transfer to (Spot or Perp).
     *
     * Requirements:
     * - fromVault and toVault must be different.
     */
    function transferBetweenVaults(
        address token,
        uint256 amount,
        VaultType fromVault,
        VaultType toVault
    ) external {
        require(amount > 0, "Transfer: amount must be > 0");
        require(fromVault != toVault, "Transfer: vault types must differ");

        if (fromVault == VaultType.Spot && toVault == VaultType.Perp) {
            require(
                spotBalances[msg.sender][token] >= amount,
                "Transfer: insufficient spot balance"
            );
            spotBalances[msg.sender][token] -= amount;
            perpBalances[msg.sender][token] += amount;
        } else if (fromVault == VaultType.Perp && toVault == VaultType.Spot) {
            require(
                perpBalances[msg.sender][token] >= amount,
                "Transfer: insufficient perp balance"
            );
            perpBalances[msg.sender][token] -= amount;
            spotBalances[msg.sender][token] += amount;
        }
        emit InternalTransfer(msg.sender, token, amount, fromVault, toVault);
    }

    /**
     * @dev Get the balance of a specific token in the Spot vault for a user.
     * @param user The address of the user.
     * @param token The address of the ERC20 token.
     * @return The user's balance in the Spot vault.
     */
    function getSpotBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return spotBalances[user][token];
    }

    /**
     * @dev Get the balance of a specific token in the Perp vault for a user.
     * @param user The address of the user.
     * @param token The address of the ERC20 token.
     * @return The user's balance in the Perp vault.
     */
    function getPerpBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return perpBalances[user][token];
    }
}
