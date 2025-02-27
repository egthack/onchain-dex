// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IMultiTokenFaucet.sol";

contract MultiTokenFaucet is Ownable, IMultiTokenFaucet {
    // Amount of tokens sent to the user per request (common for all tokens)
    uint256 public override faucetAmount;
    // Cooldown period in seconds
    uint256 public override cooldown;
    
    // Mapping: token address => (user address => last request timestamp)
    mapping(address => mapping(address => uint256)) public lastRequestTime;
    
    // Mapping for maxTokenAmount per token address
    mapping(address => uint256) private _maxTokenAmount;
    
    event TokensDeposited(address indexed token, address indexed depositor, uint256 amount, uint256 timestamp);
    event TokensRequested(address indexed token, address indexed requester, uint256 amount, uint256 timestamp);
    event TokensWithdrawn(address indexed token, address indexed owner, uint256 amount, uint256 timestamp);
    
    /**
     * @notice Constructor
     * @param _faucetAmount The amount of tokens a user receives per request
     * @param _cooldown Cooldown period (in seconds)
     */
    constructor(uint256 _faucetAmount, uint256 _cooldown) Ownable(msg.sender) {
        faucetAmount = _faucetAmount;
        cooldown = _cooldown;
    }
    
    /**
     * @notice Returns the maximum amount of tokens a user can request for a given token
     * @param tokenAddress The token address
     */
    function maxTokenAmount(address tokenAddress) public view override returns (uint256) {
        return _maxTokenAmount[tokenAddress];
    }
    
    /**
     * @notice Set the maximum amount of tokens that can be requested for a given token
     * @param tokenAddress The token address
     * @param amount The maximum amount (in standard units)
     */
    function setMaxTokenAmount(address tokenAddress, uint256 amount) external onlyOwner {
        _maxTokenAmount[tokenAddress] = amount;
    }
    
    /**
     * @notice Function for a user to deposit tokens into the Faucet
     * @dev Ensure to approve this contract for the target token before depositing
     * @param tokenAddress The address of the ERC20 token
     * @param amount The amount of tokens to deposit
     */
    function depositTokens(address tokenAddress, uint256 amount) external override {
        require(amount > 0, "Amount must be greater than 0");
        IERC20 token = IERC20(tokenAddress);
        bool success = token.transferFrom(msg.sender, address(this), amount);
        require(success, "Error occurred during deposit");
        emit TokensDeposited(tokenAddress, msg.sender, amount, block.timestamp);
    }
    
    /**
     * @notice Function for a user to request tokens from the Faucet
     * @param tokenAddress The address of the ERC20 token to request
     * @param amount The amount of tokens to request (in standard units, must be <= maxTokenAmount for that token)
     */
    function requestTokens(address tokenAddress, uint256 amount) external override {
        // Check if the amount is valid
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= _maxTokenAmount[tokenAddress], "Amount exceeds maximum allowed");
        
        // Check if the cooldown period has passed
        require(
            block.timestamp >= lastRequestTime[tokenAddress][msg.sender] + cooldown,
            "In cooldown period"
        );
        
        IERC20 token = IERC20(tokenAddress);
        
        // Get token decimals and calculate the actual amount with proper decimals
        uint8 decimals = IERC20Metadata(tokenAddress).decimals();
        uint256 actualAmount = amount * (10 ** decimals);
        
        // Check Faucet balance
        require(
            token.balanceOf(address(this)) >= actualAmount,
            "Insufficient token balance in faucet"
        );
        
        lastRequestTime[tokenAddress][msg.sender] = block.timestamp;
        bool success = token.transfer(msg.sender, actualAmount);
        require(success, "Token transfer failed");
        emit TokensRequested(tokenAddress, msg.sender, actualAmount, block.timestamp);
    }
    
    /**
     * @notice Function for the owner to withdraw tokens from the Faucet
     * @param tokenAddress The address of the token to withdraw
     * @param amount The amount to withdraw
     */
    function withdrawTokens(address tokenAddress, uint256 amount) external override onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        IERC20 token = IERC20(tokenAddress);
        require(token.balanceOf(address(this)) >= amount, "Insufficient faucet balance");
        bool success = token.transfer(msg.sender, amount);
        require(success, "Withdrawal failed");
        emit TokensWithdrawn(tokenAddress, msg.sender, amount, block.timestamp);
    }
}