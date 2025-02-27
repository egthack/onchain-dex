// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract Faucet is Ownable {
    // トークンアドレスごとの最後のドリップ時刻を記録
    mapping(address => mapping(address => uint256)) public lastDrip;
    uint256 public constant DRIP_AMOUNT = 100; // 基本量
    uint256 public constant DRIP_INTERVAL = 1 hours; // ドリップ間隔

    event TokenAdded(address token);
    event Dripped(address recipient, address token, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Faucetからトークンを受け取る
     * @param token 受け取りたいトークンのアドレス
     */
    function drip(address token) external {
        require(token != address(0), "Invalid token address");
        require(
            block.timestamp >= lastDrip[msg.sender][token] + DRIP_INTERVAL,
            "Too soon"
        );

        // トークンの桁数を取得
        uint8 decimals = IERC20Metadata(token).decimals();
        // 基本量 * 10^decimals を計算
        uint256 amount = DRIP_AMOUNT * 10 ** decimals;

        require(
            IERC20(token).balanceOf(address(this)) >= amount,
            "Insufficient balance"
        );

        lastDrip[msg.sender][token] = block.timestamp;
        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");

        emit Dripped(msg.sender, token, amount);
    }

    /**
     * @notice Faucetにトークンを追加（オーナーのみ）
     * @param token 追加するトークンのアドレス
     * @param amount 追加する量
     */
    function addToken(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(
            IERC20(token).allowance(msg.sender, address(this)) >= amount,
            "Insufficient allowance"
        );

        require(
            IERC20(token).balanceOf(msg.sender) >= amount,
            "Insufficient balance"
        );
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        emit TokenAdded(token);
    }

    /**
     * @notice 残高を確認
     * @param token トークンのアドレス
     */
    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice 次のドリップまでの待ち時間を確認
     * @param user ユーザーアドレス
     * @param token トークンアドレス
     */
    function timeUntilNextDrip(
        address user,
        address token
    ) external view returns (uint256) {
        uint256 lastDripTime = lastDrip[user][token];
        if (lastDripTime == 0) return 0;

        uint256 nextDripTime = lastDripTime + DRIP_INTERVAL;
        if (block.timestamp >= nextDripTime) return 0;

        return nextDripTime - block.timestamp;
    }
}
