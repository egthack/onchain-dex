// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Import OpenZeppelin's IERC20 interface and SafeERC20 library for safe token transfers.
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Vault
 * @dev This contract allows users to deposit and withdraw ERC20 tokens.
 *      It also supports internal transfers between users, which is useful during
 *      order matching and trade settlement in a DEX.
 */
contract Vault {
    using SafeERC20 for IERC20;

    // Mapping from user address to token address to balance.
    mapping(address => mapping(address => uint256)) private _balances;

    // Events to log deposit, withdrawal, and internal transfers.
    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount);
    event InternalTransfer(
        address indexed from,
        address indexed to,
        address indexed token,
        uint256 amount
    );

    /**
     * @dev Allows a user to deposit a specified amount of an ERC20 token into the Vault.
     * @param token The address of the ERC20 token to deposit.
     * @param amount The amount of tokens to deposit.
     *
     * Note: The user must first approve this contract to transfer the tokens.
     */
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "Deposit: amount must be > 0");
        // Transfer tokens from the user's wallet to the Vault.
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        // Update the user's balance for the specified token.
        _balances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    /**
     * @dev Allows a user to withdraw a specified amount of an ERC20 token from the Vault.
     * @param token The address of the ERC20 token to withdraw.
     * @param amount The amount of tokens to withdraw.
     */
    function withdraw(address token, uint256 amount) external {
        require(amount > 0, "Withdraw: amount must be > 0");
        uint256 userBalance = _balances[msg.sender][token];
        require(userBalance >= amount, "Withdraw: insufficient balance");
        // Update the user's balance.
        _balances[msg.sender][token] = userBalance - amount;
        // Transfer tokens from the Vault to the user's wallet.
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, token, amount);
    }

    /**
     * @dev Performs an internal transfer of tokens from one user to another.
     *      This function is intended to be called by other contracts (e.g., DEX contracts)
     *      during order matching and trade execution.
     * @param from The address of the user sending tokens.
     * @param to The address of the user receiving tokens.
     * @param token The address of the ERC20 token being transferred.
     * @param amount The amount of tokens to transfer.
     *
     * Note: In production, proper access control (e.g., onlyAuthorized) should be implemented.
     */
    function internalTransfer(
        address from,
        address to,
        address token,
        uint256 amount
    ) external {
        require(amount > 0, "InternalTransfer: amount must be > 0");
        uint256 fromBalance = _balances[from][token];
        require(
            fromBalance >= amount,
            "InternalTransfer: insufficient balance"
        );
        _balances[from][token] = fromBalance - amount;
        _balances[to][token] += amount;
        emit InternalTransfer(from, to, token, amount);
    }

    /**
     * @dev Returns the balance of a specified ERC20 token for a given user.
     * @param user The address of the user.
     * @param token The address of the ERC20 token.
     * @return The balance of the user for the specified token.
     */
    function getBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return _balances[user][token];
    }
}
