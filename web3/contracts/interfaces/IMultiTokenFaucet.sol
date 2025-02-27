// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMultiTokenFaucet {
    // Returns the amount of tokens dispensed per request
    function faucetAmount() external view returns (uint256);

    // Returns the cooldown period in seconds
    function cooldown() external view returns (uint256);

    // Returns the maximum amount of tokens a user can request for a given token
    function maxTokenAmount(address tokenAddress) external view returns (uint256);

    // Set the maximum amount of tokens that can be requested for a given token
    function setMaxTokenAmount(address tokenAddress, uint256 amount) external;

    // Deposits tokens into the faucet
    function depositTokens(address tokenAddress, uint256 amount) external;

    // Allows a user to request tokens from the faucet
    function requestTokens(address tokenAddress, uint256 amount) external;

    // Allows the owner to withdraw tokens from the faucet
    function withdrawTokens(address tokenAddress, uint256 amount) external;
}
