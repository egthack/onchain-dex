"use client";

import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { useState } from "react";
import FaucetAbi from "../../abi/IMultiTokenFaucet.json";
import env from "../../env.json";

const SUPPORTED_TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    amount: "10000",
  },
  {
    symbol: "WETH",
    name: "Wrapped ETH",
    decimals: 18,
    amount: "100",
  },
  {
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    amount: "10",
  },
  {
    symbol: "POL",
    name: "Polaris Token",
    decimals: 18,
    amount: "1000",
  }
];

const FAUCET_ADDRESS = (env.NEXT_PUBLIC_FAUCET_ADDRESS || "0xYourTradingVaultAddress") as unknown as `0x${string}`;
const TOKEN_ADDRESSES = {
  USDC: "0xf96c5D210da8Ad33b2BAdEeDF59cCAEBBb4e2629",
  WETH: "0xb0FA0536A85DfbFA078f51D8a52A009A86F7cc72",
  WBTC: "0xd59874ceC35C7E9Ff121e27Ac72367Bbc28f3FE8",
  POL: "0xfB9519fD8730Bff3Cf8469C5634B6338E95a378e"
};

const faucetAbi = FaucetAbi.abi;

export default function FaucetClient() {
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [isLoading, setIsLoading] = useState(false);

  const handleMint = async () => {
    if (!isConnected || !walletClient || !publicClient) return;
    setIsLoading(true);
    try {
      const hash = await walletClient.writeContract({
        address: FAUCET_ADDRESS,
        abi: faucetAbi,
        functionName: "requestTokens",
        args: [TOKEN_ADDRESSES[selectedToken.symbol as keyof typeof TOKEN_ADDRESSES], selectedToken.amount],
        gas: BigInt(300000)
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Minted ${selectedToken.amount} ${selectedToken.symbol}`);
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
