import type { Abi } from 'viem'

export const MatchingEngineABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_makerFeeRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_takerFeeRate",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "makerFeeRate",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "takerFeeRate",
        "type": "uint256"
      }
    ],
    "name": "FeeRatesUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "makerFeeAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "takerFeeAmount",
        "type": "uint256"
      }
    ],
    "name": "FeesWithdrawn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "orderId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "enum IMatchingEngine.OrderSide",
        "name": "side",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "base",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "quote",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "OrderPlaced",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "pairId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "base",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "quote",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256[2]",
        "name": "decimals",
        "type": "uint256[2]"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "PairAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "makerOrderId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "takerOrderId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "base",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "quote",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "makerFee",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "takerFee",
        "type": "uint256"
      }
    ],
    "name": "TradeExecuted",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "_tradingVault",
    "outputs": [
      {
        "internalType": "contract ITradingVault",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "base",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "quote",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "decimalsBase",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "decimalsQuote",
        "type": "uint256"
      }
    ],
    "name": "addPair",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "orderId",
        "type": "uint256"
      }
    ],
    "name": "cancelOrder",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pairId",
        "type": "bytes32"
      }
    ],
    "name": "getBestBuyPrice",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pairId",
        "type": "bytes32"
      },
      {
        "internalType": "enum IMatchingEngine.OrderSide",
        "name": "side",
        "type": "uint8"
      }
    ],
    "name": "getBestOrder",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "price",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "orderId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "nextOrderId",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "maker",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "expiry",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "tokens",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "availableBase",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "availableQuote",
            "type": "uint256"
          }
        ],
        "internalType": "struct MatchingEngine.BestOrderResult",
        "name": "orderResult",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pairId",
        "type": "bytes32"
      }
    ],
    "name": "getBestSellPrice",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "orderId",
        "type": "uint256"
      }
    ],
    "name": "getOrder",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "user",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "base",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "quote",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "price",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "enum IMatchingEngine.OrderSide",
            "name": "side",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "active",
            "type": "bool"
          },
          {
            "internalType": "uint256",
            "name": "next",
            "type": "uint256"
          }
        ],
        "internalType": "struct IMatchingEngine.Order",
        "name": "order",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pairId",
        "type": "bytes32"
      },
      {
        "internalType": "enum IMatchingEngine.OrderSide",
        "name": "side",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "count",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "startPrice",
        "type": "uint256"
      }
    ],
    "name": "getOrders",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "price",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "orderId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "nextOrderId",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "maker",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "expiry",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "tokens",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "availableBase",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "availableQuote",
            "type": "uint256"
          }
        ],
        "internalType": "struct MatchingEngine.OrderResult[]",
        "name": "orderResults",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "i",
        "type": "uint256"
      }
    ],
    "name": "getPair",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "pairId",
            "type": "bytes32"
          },
          {
            "internalType": "address[2]",
            "name": "tokenz",
            "type": "address[2]"
          },
          {
            "internalType": "uint256[2]",
            "name": "decimals",
            "type": "uint256[2]"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "price",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "orderId",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "nextOrderId",
                "type": "uint256"
              },
              {
                "internalType": "address",
                "name": "maker",
                "type": "address"
              },
              {
                "internalType": "uint256",
                "name": "expiry",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "tokens",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "availableBase",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "availableQuote",
                "type": "uint256"
              }
            ],
            "internalType": "struct MatchingEngine.BestOrderResult",
            "name": "bestBuyOrder",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "price",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "orderId",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "nextOrderId",
                "type": "uint256"
              },
              {
                "internalType": "address",
                "name": "maker",
                "type": "address"
              },
              {
                "internalType": "uint256",
                "name": "expiry",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "tokens",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "availableBase",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "availableQuote",
                "type": "uint256"
              }
            ],
            "internalType": "struct MatchingEngine.BestOrderResult",
            "name": "bestSellOrder",
            "type": "tuple"
          }
        ],
        "internalType": "struct MatchingEngine.PairResult",
        "name": "pairResult",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "base",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "quote",
        "type": "address"
      }
    ],
    "name": "getPairId",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "count",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "offset",
        "type": "uint256"
      }
    ],
    "name": "getPairs",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "pairId",
            "type": "bytes32"
          },
          {
            "internalType": "address[2]",
            "name": "tokenz",
            "type": "address[2]"
          },
          {
            "internalType": "uint256[2]",
            "name": "decimals",
            "type": "uint256[2]"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "price",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "orderId",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "nextOrderId",
                "type": "uint256"
              },
              {
                "internalType": "address",
                "name": "maker",
                "type": "address"
              },
              {
                "internalType": "uint256",
                "name": "expiry",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "tokens",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "availableBase",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "availableQuote",
                "type": "uint256"
              }
            ],
            "internalType": "struct MatchingEngine.BestOrderResult",
            "name": "bestBuyOrder",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "price",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "orderId",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "nextOrderId",
                "type": "uint256"
              },
              {
                "internalType": "address",
                "name": "maker",
                "type": "address"
              },
              {
                "internalType": "uint256",
                "name": "expiry",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "tokens",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "availableBase",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "availableQuote",
                "type": "uint256"
              }
            ],
            "internalType": "struct MatchingEngine.BestOrderResult",
            "name": "bestSellOrder",
            "type": "tuple"
          }
        ],
        "internalType": "struct MatchingEngine.PairResult[]",
        "name": "pairResults",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "tokens",
        "type": "address[]"
      }
    ],
    "name": "getbasefo",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "symbol",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "uint8",
            "name": "decimals",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "totalSupply",
            "type": "uint256"
          }
        ],
        "internalType": "struct MatchingEngine.basefoResult[]",
        "name": "results",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "owners",
        "type": "address[]"
      },
      {
        "internalType": "address[]",
        "name": "tokens",
        "type": "address[]"
      }
    ],
    "name": "getquotebaseTokenlanceAndAllowance",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "balance",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "allowance",
            "type": "uint256"
          }
        ],
        "internalType": "struct MatchingEngine.quotebaseTokenlanceAndAllowanceResult[]",
        "name": "results",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "makerFeeRate",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "makerFeesCollected",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "orderId",
        "type": "uint256"
      }
    ],
    "name": "matchOrder",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextOrderId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "pairKeys",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "base",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "quote",
        "type": "address"
      },
      {
        "internalType": "enum IMatchingEngine.OrderSide",
        "name": "side",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      }
    ],
    "name": "placeOrder",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_makerFeeRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_takerFeeRate",
        "type": "uint256"
      }
    ],
    "name": "setFeeRates",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_vault",
        "type": "address"
      }
    ],
    "name": "setVaultAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "takerFeeRate",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "takerFeesCollected",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "vaultAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "withdrawFees",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const satisfies Abi;

export type IMatchingEngine = typeof MatchingEngineABI;
