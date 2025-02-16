// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

library VaultLib {
    struct TradeRequest {
        address user; // The user executing the trade (asset owner)
        uint8 side; // 0: Buy, 1: Sell
        address tokenIn; // The token being sold
        address tokenOut; // The token being bought
        uint256 amountIn; // Amount to sell
        uint256 minAmountOut; // Minimum amount to receive (slippage protection)
        bytes32 preApprovalId; // Pre-approval ID (for signature verification, etc.)
        bytes signature; // User's signature
    }

    struct TraderApproval {
        bool approved; // Whether the trader is approved
        uint256 maxOrderSize; // Maximum order size that the trader can execute at once
        uint256 expiry; // Approval expiry timestamp
    }

    /**
     * @notice TradeRequestの妥当性チェック
     */
    function checkTradeRequest(
        TradeRequest memory req,
        mapping(address => mapping(address => TraderApproval)) storage approvals
    ) internal view {
        TraderApproval memory ta = approvals[req.user][msg.sender];

        require(ta.approved, "Trader not approved");
        require(block.timestamp < ta.expiry, "Trader approval expired");
        require(req.amountIn <= ta.maxOrderSize, "Order size exceeds limit");
        require(
            req.preApprovalId != bytes32(0),
            "Pre-approval ID should not be 0"
        );

        // 追加署名検証: ユーザーの署名が有効であることを確認
        // ※ TradeRequest 構造体に 'bytes signature' フィールドを追加してください
        bytes32 hash = keccak256(
            abi.encodePacked(
                req.user,
                req.tokenIn,
                req.tokenOut,
                req.amountIn,
                req.minAmountOut,
                req.preApprovalId
            )
        );

        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
        );
        address recoveredSigner = ECDSA.recover(
            ethSignedMessageHash,
            req.signature
        );
        require(recoveredSigner == req.user, "Invalid signature");
    }
}
