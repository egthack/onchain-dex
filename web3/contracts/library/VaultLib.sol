// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../interfaces/IDex.sol";

library VaultLib {
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
        // preApprovalIdのチェックや追加署名検証などは本番想定で組み込む
    }
}
