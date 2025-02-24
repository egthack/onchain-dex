"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

const SUPPORTED_TOKENS = [
  {
    symbol: "WETH",
    address: "0x...", // Contract address will be added later
    decimals: 18,
  },
  {
    symbol: "USDC",
    address: "0x...", // Contract address will be added later
    decimals: 6,
  },
];

export default function FaucetPage() {
  const { isConnected } = useAccount();
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [timeUntilNext, setTimeUntilNext] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeUntilNext((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-trading-gray rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-6">Testnet Faucet</h1>

        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Select Token
            </h2>
            <div className="flex gap-2">
              {SUPPORTED_TOKENS.map((token) => (
                <button
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

          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Drip Amount
            </h2>
            <div className="bg-trading-light rounded-lg p-4">
              <div className="text-2xl font-bold">
                100 {selectedToken.symbol}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Available every 1 hour
              </div>
            </div>
          </div>

          {isConnected ? (
            <>
              {timeUntilNext > 0 ? (
                <div className="text-sm text-gray-400">
                  Next drip available in: {Math.ceil(timeUntilNext / 60)}{" "}
                  minutes
                </div>
              ) : (
                <button className="w-full py-3 bg-accent-green text-black font-semibold rounded-lg hover:shadow-glow transition-all">
                  Get {selectedToken.symbol}
                </button>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-400">
              Connect your wallet to use the faucet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
