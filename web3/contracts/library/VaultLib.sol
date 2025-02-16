// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../interfaces/IDex.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

library VaultLib {
    using ECDSA for bytes32;

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
