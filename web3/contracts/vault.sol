import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IDex.sol";
import "./library/VaultLib.sol";

contract TradingVault is IVault {
    // ユーザー -> (トークン -> 残高)
    mapping(address => mapping(address => uint256)) public balances;

    // user -> (trader -> TraderApproval)
    mapping(address => mapping(address => TraderApproval))
        public traderApprovals;

    // 任意のOn-chain DEXアドレスを保持 (例: Uniswap, Sushiswap,等)
    // 必要に応じて複数のDEXを管理する仕組みもあり得る
    IDex public dex;

    constructor(address _dex) {
        dex = IDex(_dex);
    }

    /**
     * @notice ユーザーがVaultにトークンをデポジット
     */
    function deposit(address token, uint256 amount) external override {
        require(amount > 0, "Amount must be > 0");
        // ユーザーのウォレットからこのコントラクトへトークン転送
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
    }

    /**
     * @notice ユーザーがVaultからトークンを引き出し
     */
    function withdraw(address token, uint256 amount) external override {
        require(balances[msg.sender][token] >= amount, "Insufficient balance");
        balances[msg.sender][token] -= amount;
        IERC20(token).transfer(msg.sender, amount);
    }

    /**
     * @notice Botやユーザーなど「代理執行者」の承認設定
     */
    function setTraderApproval(
        address trader,
        bool approved,
        uint256 maxOrderSize,
        uint256 expiry
    ) external {
        traderApprovals[msg.sender][trader] = TraderApproval({
            approved: approved,
            maxOrderSize: maxOrderSize,
            expiry: expiry
        });
    }

    /**
     * @notice ユーザーのトークン残高を取得
     */
    function getBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return balances[user][token];
    }

    /**
     * @notice バッチで複数取引を実行
     * gas最適化 & Botによる自動執行を想定
     */
    function executeTradeBatch(
        TradeRequest[] calldata trades
    ) external override {
        for (uint256 i = 0; i < trades.length; i++) {
            _executeSingleTrade(trades[i]);
        }
    }

    /**
     * @dev バッチ内部で呼ばれる個別取引実行関数
     */
    function _executeSingleTrade(TradeRequest calldata req) internal {
        // ライブラリで承認チェック
        VaultLib.checkTradeRequest(req, traderApprovals);

        // 残高チェック
        require(
            balances[req.user][req.tokenIn] >= req.amountIn,
            "Insufficient vault balance"
        );

        // Vault内資産をDEXにデポジット → swap → Vaultに戻す例
        // (DEXによってはtransferFromで直接swapできる場合もある)
        balances[req.user][req.tokenIn] -= req.amountIn;

        // 1) Vault -> Dex deposit
        IERC20(req.tokenIn).approve(address(dex), req.amountIn);
        dex.deposit(req.tokenIn, req.amountIn);

        // 2) swap
        uint256 outAmount = dex.swap(
            req.tokenIn,
            req.tokenOut,
            req.amountIn,
            req.minAmountOut
        );

        // 3) Dex -> Vault withdraw
        dex.withdraw(req.tokenOut, outAmount);

        // 4) UserのVault残高に反映
        balances[req.user][req.tokenOut] += outAmount;
    }
}
