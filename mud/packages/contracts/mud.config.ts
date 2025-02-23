import { defineWorld } from "@latticexyz/world";

export default defineWorld({
  tables: {
    Order: {
      schema: {
        orderId: "uint256",
        user: "address",
        baseToken: "address",
        quoteToken: "address",
        price: "uint256",
        amount: "uint256",
        isBuy: "bool",
        active: "bool",
        timestamp: "uint256",
      },
      key: ["orderId"],
    },
    OrderCounter: {
      schema: {
        value: "uint256",
      },
      key: [],
    },
  },
});
