// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @notice オンチェーンDEXインターフェイス
 * deposit, withdraw, swap等を想定した簡略化例
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
 * @notice Vaultコントラクトとやりとりするインターフェイス
 * 高速取引やバッチ処理を外部から一貫して呼び出せるよう設計
 */
interface IVault {
    function deposit(address token, uint256 amount) external;

    function withdraw(address token, uint256 amount) external;

    function executeTradeBatch(TradeRequest[] calldata trades) external;
    // ...必要に応じて追加
}

/**
 * @notice 取引パラメータ定義
 * BotやユーザーがVaultに指示を出すときに利用
 */
struct TradeRequest {
    address user; // 取引を行うユーザー(資産所有者)
    address tokenIn; // 売却トークン
    address tokenOut; // 購入トークン
    uint256 amountIn; // 売却量
    uint256 minAmountOut; // スリッページ対策などのための最低受取量
    bytes32 preApprovalId; // 事前承認ID(署名検証済みなどを想定)
}

/**
 * @notice Botや外部トレーダーを承認するための構造体
 */
struct TraderApproval {
    bool approved; // 承認有無
    uint256 maxOrderSize; // Botが一回に扱える最大額
    uint256 expiry; // 承認期限 (timestamp)
}
