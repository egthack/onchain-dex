"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import TradingVaultABI from "../../abi/ITradingVault.json";
import ERC20ABI from "../../abi/IERC20.json";
import env from "../../env.json";

const TOKENS = ["USDC", "WETH", "WBTC", "POL"];

function getTokenDecimals(token: string): number {
  const tokenDecimals: { [key: string]: number } = {
    WETH: 18,
    USDC: 6,
    WBTC: 8,
    POL: 18
  };
  return tokenDecimals[token] || 18;
}

function formatTokenUnits(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, '0');
  const integerPart = s.slice(0, s.length - decimals);
  let fractionPart = s.slice(s.length - decimals);
  fractionPart = fractionPart.replace(/0+$/, '');
  return fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
}

function convertToTokenUnits(amount: string, decimals: number): bigint {
  if (!amount || amount === "0") return BigInt(0);
  const parts = amount.split('.');
  let result = parts[0];
  if (parts.length > 1) {
    let fraction = parts[1];
    if (fraction.length > decimals) {
      fraction = fraction.substring(0, decimals);
    } else {
      fraction = fraction.padEnd(decimals, '0');
    }
    result += fraction;
  } else {
    result += '0'.repeat(decimals);
  }
  result = result.replace(/^0+/, '');
  if (result === '') result = '0';
  return BigInt(result);
}

const TOKEN_ADDRESSES = {
  WETH: env.NEXT_PUBLIC_WETH_ADDRESS || "0xWETH",
  USDC: env.NEXT_PUBLIC_USDC_ADDRESS || "0xUSDC",
  WBTC: env.NEXT_PUBLIC_WBTC_ADDRESS || "0xWBTC",
  POL: env.NEXT_PUBLIC_POL_ADDRESS || "0xPOL"
};

const VAULT_ADDRESS = env.NEXT_PUBLIC_VAULT_ADDRESS || "0xYourTradingVaultAddress";

export default function DepositClient() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // State variables
  const [selectedToken, setSelectedToken] = useState<string>(TOKENS[0]);
  const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState("");
  const [depositBalance, setDepositBalance] = useState<bigint>(BigInt(0));
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<bigint>(BigInt(0));

  // Fetch deposit balance for the selected token
  const fetchDepositBalance = useCallback(async () => {
    if (!isConnected || !address || !publicClient) return;
    const tokenAddress = TOKEN_ADDRESSES[selectedToken as keyof typeof TOKEN_ADDRESSES] as `0x${string}`;
    try {
      const balance = await publicClient.readContract({
        address: VAULT_ADDRESS as `0x${string}`,
        abi: TradingVaultABI.abi,
        functionName: "getBalance",
        args: [address, tokenAddress]
      });
      setDepositBalance(balance as bigint);
    } catch (err) {
      console.error("Failed to fetch deposit balance", err);
    }
  }, [isConnected, address, publicClient, selectedToken]);

  // Add a new useEffect to fetch wallet token balance
  useEffect(() => {
    const fetchWalletBalance = async () => {
      if (!isConnected || !address || !publicClient) return;
      try {
        const tokenAddress = TOKEN_ADDRESSES[selectedToken as keyof typeof TOKEN_ADDRESSES] as `0x${string}`;
        const balance = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20ABI.abi,
          functionName: "balanceOf",
          args: [address]
        });
        setWalletBalance(balance as bigint);
      } catch (err) {
        console.error("Failed to fetch wallet balance", err);
      }
    };
    fetchWalletBalance();
  }, [isConnected, address, publicClient, selectedToken]);

  useEffect(() => {
    fetchDepositBalance();
  }, [fetchDepositBalance]);

  // Deposit approval function
  async function handleApprove() {
    setError("");
    if (!walletClient) {
      setError("Wallet is not connected");
      return;
    }
    if (!publicClient) {
      setError("Public client not available");
      return;
    }
    setIsLoading(true);
    try {
      const tokenAddress = TOKEN_ADDRESSES[selectedToken as keyof typeof TOKEN_ADDRESSES] as `0x${string}`;
      const decimals = getTokenDecimals(selectedToken);
      const approveAmount = (amount && amount !== "0") ? amount : "1000000";
      const amountBN = convertToTokenUnits(approveAmount, decimals);
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: ERC20ABI.abi,
        functionName: "approve",
        args: [VAULT_ADDRESS, amountBN],
        gas: BigInt(300000)
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setError("Approve transaction failed");
      } else {
        setTxHash(hash);
        setIsApproved(true);
        setModalOpen(true);
        console.log("Approve successful");
      }
    } catch (err: unknown) {
      console.error("Approve failed", err);
      setError((err as Error)?.message || "Approve transaction failed");
    } finally {
      setIsLoading(false);
    }
  }

  // Deposit function
  async function handleDeposit() {
    setError("");
    if (!walletClient) {
      setError("Wallet is not connected");
      return;
    }
    if (!publicClient) {
      setError("Public client not available");
      return;
    }
    setIsLoading(true);
    try {
      const tokenAddress = TOKEN_ADDRESSES[selectedToken as keyof typeof TOKEN_ADDRESSES] as `0x${string}`;
      const decimals = getTokenDecimals(selectedToken);
      const amountBN = convertToTokenUnits(amount, decimals);
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS as `0x${string}`,
        abi: TradingVaultABI.abi,
        functionName: "deposit",
        args: [tokenAddress, amountBN],
        gas: BigInt(300000)
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setError("Deposit transaction failed");
      } else {
        setTxHash(hash);
        console.log("Deposit successful");
        fetchDepositBalance();
        setIsApproved(false);
        setModalOpen(true);
      }
    } catch (err: unknown) {
      console.error("Deposit failed", err);
      setError((err as Error)?.message || "Deposit transaction failed");
    } finally {
      setIsLoading(false);
    }
  }

  // Withdraw function
  async function handleWithdraw() {
    setError("");
    if (!walletClient) {
      setError("Wallet is not connected");
      return;
    }
    if (!publicClient) {
      setError("Public client not available");
      return;
    }
    setIsLoading(true);
    try {
      const tokenAddress = TOKEN_ADDRESSES[selectedToken as keyof typeof TOKEN_ADDRESSES] as `0x${string}`;
      const decimals = getTokenDecimals(selectedToken);
      const amountBN = convertToTokenUnits(amount, decimals);
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS as `0x${string}`,
        abi: TradingVaultABI.abi,
        functionName: "withdraw",
        args: [tokenAddress, amountBN],
        gas: BigInt(300000)
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setError("Withdrawal transaction failed");
      } else {
        setTxHash(hash);
        console.log("Withdraw successful");
        fetchDepositBalance();
        setModalOpen(true);
      }
    } catch (err: unknown) {
      console.error("Withdraw failed", err);
      setError((err as Error)?.message || "Withdrawal transaction failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Deposit/Withdraw Page</h1>

      {/* Token Selection */}
      <div className="mb-4">
        {TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => setSelectedToken(token)}
            className={`px-4 py-2 mr-2 rounded ${selectedToken === token ? "bg-accent-green text-black" : "bg-trading-light text-white"}`}
          >
            {token}
          </button>
        ))}
      </div>

      {/* Display wallet balance */}
      <div className="mb-4 text-white">
        Wallet balance: {formatTokenUnits(walletBalance, getTokenDecimals(selectedToken))} {selectedToken}
      </div>

      {/* Display current balance */}
      <div className="mb-4 text-white">
        Current deposit balance: {formatTokenUnits(depositBalance, getTokenDecimals(selectedToken))} {selectedToken}
      </div>

      {error && <p className="mb-4 text-red-500">{error}</p>}

      {/* Action Selector */}
      <div className="flex gap-4 mb-4">
        <button
          type="button"
          onClick={() => setAction('deposit')}
          className={`px-4 py-2 rounded ${action === 'deposit' ? 'bg-accent-green text-black' : 'bg-trading-light text-white'}`}
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={() => setAction('withdraw')}
          className={`px-4 py-2 rounded ${action === 'withdraw' ? 'bg-accent-green text-black' : 'bg-trading-light text-white'}`}
        >
          Withdraw
        </button>
      </div>

      {action === 'deposit' ? (
        /* Deposit Form */
        <div className="bg-trading-gray rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Deposit {selectedToken}</h2>
          <div className="mb-3">
            <label htmlFor="deposit-amount-input" className="block text-xs font-medium text-gray-400 mb-1">Deposit Amount ({selectedToken})</label>
            <input
              id="deposit-amount-input"
              type="number"
              className="trading-input"
              placeholder="0.00"
              value={amount}
              disabled={isApproved}
              onChange={(e) => {
                setAmount(e.target.value);
                setIsApproved(false); // reset approval if amount changes
              }}
            />
            {!isApproved ? (
              <button
                type="button"
                onClick={handleApprove}
                disabled={isLoading || !amount || amount === "0"}
                className="w-full py-2 mt-2 bg-blue-500 text-white font-semibold rounded text-sm hover:shadow-glow transition-all"
              >
                {isLoading ? "Processing..." : "Approve"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDeposit}
                disabled={isLoading || !amount || amount === "0"}
                className="w-full py-2 mt-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all"
              >
                {isLoading ? "Processing..." : "Deposit"}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Withdraw Form */
        <div className="bg-trading-gray rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Withdraw {selectedToken}</h2>
          <div className="mb-3">
            <label htmlFor="withdraw-amount-input" className="block text-xs font-medium text-gray-400 mb-1">Withdraw Amount ({selectedToken})</label>
            <input
              id="withdraw-amount-input"
              type="number"
              className="trading-input"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={isLoading || !amount || amount === "0"}
              className="w-full py-2 mt-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all"
            >
              {isLoading ? "Processing..." : "Withdraw"}
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-trading-gray p-6 rounded-lg shadow-lg max-w-md mx-auto text-white">
            {error ? (
              <>
                <h3 className="text-xl font-bold mb-3">Transaction Failed</h3>
                <p className="break-all mb-3">{error}</p>
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