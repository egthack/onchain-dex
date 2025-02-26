"use client";

import { useAccount } from "wagmi";
import { useState } from "react";

const SUPPORTED_TOKENS = [
  {
    symbol: "WETH",
    name: "Wrapped ETH",
    decimals: 18,
    amount: "0.1",
  },
  {
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    amount: "0.01",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    amount: "1000",
  },
  {
    symbol: "POL",
    name: "Polaris Token",
    decimals: 18,
    amount: "1000",
  },
  {
    symbol: "TRUMP",
    name: "Trump Token",
    decimals: 18,
    amount: "1000",
  },
];

export default function FaucetClient() {
  const { isConnected } = useAccount();
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [isLoading, setIsLoading] = useState(false);

  const handleMint = async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      // TODO: Implement minting logic
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate delay
      console.log(`Minting ${selectedToken.amount} ${selectedToken.symbol}`);
    } catch (error) {
      console.error("Failed to mint:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-trading-gray rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-6">Testnet Faucet</h1>

        <div className="space-y-6">
          {/* Token Selection */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Select Token
            </h2>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_TOKENS.map((token) => (
                <button
                  type="button"
                  key={token.symbol}
                  onClick={() => setSelectedToken(token)}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    selectedToken.symbol === token.symbol
                      ? "bg-accent-green text-black"
                      : "bg-trading-light text-white hover:bg-opacity-80"
                  }`}
                >
                  {token.symbol}
                </button>
              ))}
            </div>
          </div>

          {/* Amount Display */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Mint Amount
            </h2>
            <div className="bg-trading-light rounded-lg p-4">
              <div className="text-2xl font-bold">
                {selectedToken.amount} {selectedToken.symbol}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Available every 24 hours per address
              </div>
            </div>
          </div>

          {/* Mint Button */}
          {isConnected ? (
            <button
              type="button"
              onClick={handleMint}
              disabled={isLoading}
              className={`w-full py-3 bg-accent-green text-black font-semibold rounded-lg transition-all ${
                isLoading
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:shadow-glow"
              }`}
            >
              {isLoading ? "Minting..." : `Get ${selectedToken.symbol}`}
            </button>
          ) : (
            <div className="text-sm text-gray-400 text-center">
              Connect your wallet to use the faucet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
