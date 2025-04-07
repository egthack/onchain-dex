"use client";

import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { useState } from "react";
import FaucetAbi from "../../abi/IMultiTokenFaucet.json";
import * as ethers from "ethers";
import envConfig from "../../utils/envConfig";

const SUPPORTED_TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    amount: "1000000",
  },
  {
    symbol: "WETH",
    name: "Wrapped ETH",
    decimals: 18,
    amount: "1000000",
  },
  {
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    amount: "1000000",
  },
  {
    symbol: "POL",
    name: "Polaris Token",
    decimals: 18,
    amount: "1000000",
  }
];

const FAUCET_ADDRESS = (envConfig.NEXT_PUBLIC_FAUCET_ADDRESS || "0xYourTradingVaultAddress") as unknown as `0x${string}`;
const TOKEN_ADDRESSES = {
  USDC: envConfig.NEXT_PUBLIC_USDC_ADDRESS || "0xUSDC",
  WETH: envConfig.NEXT_PUBLIC_WETH_ADDRESS || "0xWETH",
  WBTC: envConfig.NEXT_PUBLIC_WBTC_ADDRESS || "0xWBTC",
  POL: envConfig.NEXT_PUBLIC_POL_ADDRESS || "0xPOL"
};

const faucetAbi = FaucetAbi.abi;

export default function FaucetClient() {
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const handleMint = async () => {
    console.log("handleMint");
    console.log("isConnected", isConnected);
    console.log("walletClient", walletClient);
    console.log("publicClient", publicClient);
    if (!isConnected || !walletClient || !publicClient) return;
    console.log("FAUCET_ADDRESS", FAUCET_ADDRESS);
    try {
      const hash = await walletClient.writeContract({
        address: FAUCET_ADDRESS,
        abi: faucetAbi,
        functionName: "requestTokens",
        args: [TOKEN_ADDRESSES[selectedToken.symbol as keyof typeof TOKEN_ADDRESSES], selectedToken.amount],
        gas: BigInt(300000)
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setError("Request faucet transaction failed");
        setModalOpen(true);
      } else {
        setTxHash(hash);
        setModalOpen(true);
        console.log(`Request ${selectedToken.amount} ${selectedToken.symbol} to faucet`);
      }
    } catch (err: unknown) {
      const errorMessage = (err instanceof Error) ? err.message : "Request faucet transaction failed";
      console.error("Failed to request faucet:", err);
      setError(errorMessage);
      setModalOpen(true);
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
                Available every 1 hours per address
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

      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-trading-gray p-6 rounded-lg shadow-lg max-w-md mx-auto text-white">
            {error ? (
              <>
                <h3 className="text-xl font-bold mb-3">Transaction Failed</h3>
                <p className="break-all mb-3">{error}</p>
                <p className="text-sm text-gray-400">
                  You may have already used the faucet within the last 24 hours.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold mb-3">Transaction Success</h3>
                <p className="break-all mb-3">
                  Tx Hash: <a
                    href={`${process.env.NEXT_PUBLIC_RISE_SEPOLIA_BLOCK_EXPLORER || 'https://testnet.com'}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-green underline"
                  >
                    {txHash}
                  </a>
                </p>
              </>
            )}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => { setModalOpen(false); setError(""); }}
                className="mt-4 bg-accent-green text-black px-4 py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
