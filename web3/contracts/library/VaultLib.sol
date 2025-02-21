// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../interfaces/IMatchingEngine.sol";

import "hardhat/console.sol";

library VaultLib {
    struct TradeRequest {
        address user; // The asset owner executing the trade.
        IMatchingEngine.OrderSide side; // Buy (0) or Sell (1).
        address base; // The Quote Tokeneing sold.
        address quote; // The Quote Tokeneing bought.
        uint256 amount; // Amount to sell
        uint256 price; // The price of the order. 0 for market order.
        bytes signature; // User's signature.
    }

    /**
     * @notice Check the validity of the TradeRequest
     * @param req The TradeRequest to check
     */
    function checkTradeRequest(TradeRequest memory req) internal view {
        require(msg.sender == req.user, "Invalid user");
        // TODO: check idempotency key is not duplicated (not implemented yet)
        // Additional signature verification: confirm that the user's signature is valid
        bytes32 hash = keccak256(
            abi.encodePacked(
                req.user,
                req.base,
                req.quote,
                req.amount,
                req.price,
                req.side
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
