"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import TradingVaultABI from "../abi/ITradingVault.json";
import ERC20ABI from "../abi/IERC20.json";
import * as ethers from "ethers";
import env from "../env.json";

const TRADING_PAIRS = [
  { base: "WETH", quote: "USDC" },
  { base: "WBTC", quote: "USDC" },
  { base: "POL", quote: "USDC" },
];

const TOKEN_ADDRESSES = {
  WETH: env.NEXT_PUBLIC_WETH_ADDRESS || "0xWETH",
  USDC: env.NEXT_PUBLIC_USDC_ADDRESS || "0xUSDC",
  WBTC: env.NEXT_PUBLIC_WBTC_ADDRESS || "0xWBTC",
  POL: env.NEXT_PUBLIC_POL_ADDRESS || "0xPOL"
};

// トークンごとのデシマル値を定義
const TOKEN_DECIMALS = {
  WETH: 18,
  USDC: 6,
  WBTC: 8,
  POL: 18
};

const VAULT_ADDRESS = (env.NEXT_PUBLIC_VAULT_ADDRESS || "0xYourTradingVaultAddress") as unknown as `0x${string}`;

const vaultAbi = TradingVaultABI.abi;
const erc20Abi = ERC20ABI.abi;

export default function TradingPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [selectedPair, setSelectedPair] = useState(TRADING_PAIRS[0]);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [side, setSide] = useState<"buy" | "sell">("buy");

  const [marketAmount, setMarketAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [limitAmount, setLimitAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [marketPrice, setMarketPrice] = useState("");

  const [depositBalance, setDepositBalance] = useState<bigint>(BigInt(0));

  const [depositAmountQuote, setDepositAmountQuote] = useState("");
  const [withdrawAmountQuote, setWithdrawAmountQuote] = useState("");
  const [depositBalanceQuote, setDepositBalanceQuote] = useState<bigint>(BigInt(0));

  const [cancelOrderId, setCancelOrderId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // トークンシンボルからデシマル値を取得する関数
  function getTokenDecimals(symbol: string): number {
    return TOKEN_DECIMALS[symbol as keyof typeof TOKEN_DECIMALS] || 18; // デフォルトは18
  }

  // 数値を適切なデシマル値に変換する関数
  function convertToTokenUnits(amount: string, decimals: number): bigint {
    if (!amount || amount === "0") return BigInt(0);
    // 小数点以下の桁数を考慮して変換
    const parts = amount.split('.');
    let result = parts[0];
    
    if (parts.length > 1) {
      let fraction = parts[1];
      // 小数点以下がデシマル値より長い場合は切り捨て
      if (fraction.length > decimals) {
        fraction = fraction.substring(0, decimals);
      } else {
        // 足りない場合は0で埋める
        fraction = fraction.padEnd(decimals, '0');
      }
      result += fraction;
    } else {
      // 小数点がない場合は0を追加
      result += '0'.repeat(decimals);
    }
    
    // 先頭の0を削除
    result = result.replace(/^0+/, '');
    if (result === '') result = '0';
    
    return BigInt(result);
  }

  function formatTokenUnits(amount: bigint, decimals: number): string {
    const s = amount.toString().padStart(decimals + 1, '0');
    const integerPart = s.slice(0, s.length - decimals);
    let fractionPart = s.slice(s.length - decimals);
    // Trim trailing zeros
    fractionPart = fractionPart.replace(/0+$/, '');
    return fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
  }

  const fetchDepositBalance = useCallback(async () => {
    if (!isConnected || !address || !publicClient) return;
    const tokenAddress = TOKEN_ADDRESSES[selectedPair.base as keyof typeof TOKEN_ADDRESSES] as unknown as `0x${string}`;
    try {
      const balance = await publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "getBalance",
        args: [address, tokenAddress]
      });
      console.log("Deposit balance:", balance);
      setDepositBalance(balance as bigint);
    } catch (error) {
      console.error("Failed to fetch deposit balance", error);
    }
  }, [isConnected, address, publicClient, selectedPair.base]);

  useEffect(() => {
    fetchDepositBalance();
  }, [fetchDepositBalance]);

  const fetchDepositBalanceQuote = useCallback(async () => {
    if (!isConnected || !address || !publicClient) return;
    const tokenAddress = TOKEN_ADDRESSES.USDC as unknown as `0x${string}`;
    try {
      const balance = await publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "getBalance",
        args: [address, tokenAddress]
      });
      console.log("USDC Deposit balance:", balance);
      setDepositBalanceQuote(balance as bigint);
    } catch (error) {
      console.error("Failed to fetch USDC deposit balance", error);
    }
  }, [isConnected, address, publicClient]);

  useEffect(() => {
    fetchDepositBalanceQuote();
  }, [fetchDepositBalanceQuote]);

  async function handleDeposit() {
    setError("");
    if (!walletClient) {
      setError("ウォレットが接続されていません");
      return;
    }
    if (!publicClient) {
      setError("パブリッククライアントが利用できません");
      return;
    }
    setIsLoading(true);
    try {
      const tokenAddress = TOKEN_ADDRESSES[selectedPair.base as keyof typeof TOKEN_ADDRESSES] as unknown as `0x${string}`;
      const decimals = getTokenDecimals(selectedPair.base);
      const amountBN = convertToTokenUnits(depositAmount, decimals);

      // Vaultへのデポジット処理を実行
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'deposit',
        args: [tokenAddress, amountBN],
        gas: BigInt(300000)
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setModalOpen(true);
      console.log("Deposit successful");
      fetchDepositBalance();
    } catch (err: unknown) {
      console.error("Deposit failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("デポジットに失敗しました");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleWithdraw() {
    setError("");
    if (!walletClient) {
      setError("ウォレットが接続されていません");
      return;
    }
    if (!publicClient) {
      setError("パブリッククライアントが利用できません");
      return;
    }
    setIsLoading(true);
    try {
      const tokenAddress = TOKEN_ADDRESSES[selectedPair.base as keyof typeof TOKEN_ADDRESSES] as unknown as `0x${string}`;
      const decimals = getTokenDecimals(selectedPair.base);
      const amountBN = convertToTokenUnits(withdrawAmount, decimals);

      // Vaultからの引き出し処理を実行
      const hashWithdraw = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'withdraw',
        args: [tokenAddress, amountBN],
        gas: BigInt(300000)
      });

      await publicClient.waitForTransactionReceipt({ hash: hashWithdraw });
      setTxHash(hashWithdraw);
      setModalOpen(true);
      console.log("Withdraw successful");
      fetchDepositBalance();
    } catch (err: unknown) {
      console.error("Withdraw failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("引き出しに失敗しました");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePlaceOrder() {
    setError("");
    setTxHash("");
    if (!walletClient || !publicClient) {
      setError("ウォレットまたはパブリッククライアントが接続されていません");
      setIsLoading(false);
      return;
    }
    if (!address) {
      setError("ウォレットが接続されていません");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const baseAddress = TOKEN_ADDRESSES[selectedPair.base as keyof typeof TOKEN_ADDRESSES] as unknown as `0x${string}`;
      const quoteAddress = TOKEN_ADDRESSES[selectedPair.quote as keyof typeof TOKEN_ADDRESSES] as unknown as `0x${string}`;

      let amountBN: bigint;
      let priceBN: bigint;
      // const baseDecimals = getTokenDecimals(selectedPair.base);
      // const quoteDecimals = getTokenDecimals(selectedPair.quote);
      
      if (orderType === "market") {
        if (!marketAmount || marketAmount === "0") {
          setError("数量を入力してください");
          setIsLoading(false);
          return;
        }
        if (!marketPrice || marketPrice === "0") {
          setError("価格を入力してください");
          setIsLoading(false);
          return;
        }
        amountBN = BigInt(marketAmount);
        priceBN = BigInt(marketPrice);
      } else {
        if (!limitAmount || limitAmount === "0") {
          setError("数量を入力してください");
          setIsLoading(false);
          return;
        }
        if (!limitPrice || limitPrice === "0") {
          setError("価格を入力してください");
          setIsLoading(false);
          return;
        }
        amountBN = BigInt(limitAmount);
        priceBN = BigInt(limitPrice);
      }

      // 署名処理の修正部分
      const messageHash = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "address", "address", "uint256", "uint256", "uint8"],
          [
            address,
            baseAddress,
            quoteAddress,
            amountBN,
            priceBN,
            side === "buy" ? 0 : 1
          ]
        )
      );
      
      // signMessageの引数をバイト列に変換
      const signature = await walletClient.signMessage({
        message: { raw: messageHash as `0x${string}` }
      });

      // tradeRequestの構築
      const tradeRequest = {
        user: address,
        base: baseAddress,
        quote: quoteAddress,
        amount: amountBN,
        price: priceBN,
        side: side === "buy" ? 0 : 1,
        signature: signature
      };

      console.log(tradeRequest);

      // TradingVault経由で注文を実行
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "executeTradeBatch",
        args: [[tradeRequest]],
        gas: BigInt(5000000)
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setModalOpen(true);
      console.log("Order placed successfully via TradingVault");
      fetchDepositBalance();
    } catch (err: unknown) {
      console.error("Order failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("注文に失敗しました");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove() {
    setError("");
    if (!walletClient) {
      setError("ウォレットが接続されていません");
      return;
    }
    if (!publicClient) {
      setError("パブリッククライアントが利用できません");
      return;
    }
    setIsLoading(true);
    try {
      const tokenAddress = TOKEN_ADDRESSES[selectedPair.base as keyof typeof TOKEN_ADDRESSES] as unknown as `0x${string}`;
      const decimals = getTokenDecimals(selectedPair.base);
      // depositAmountが設定されていない場合は十分な大きさの値（例: 1000000）を使用
      const approveAmount = (depositAmount && depositAmount !== "0") ? depositAmount : "1000000";
      const amountBN = convertToTokenUnits(approveAmount, decimals);
      const hashApprove = await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [VAULT_ADDRESS, amountBN],
        gas: BigInt(300000)
      });
      await publicClient.waitForTransactionReceipt({ hash: hashApprove });
      setTxHash(hashApprove);
      setModalOpen(true);
      console.log("Approve successful");
      fetchDepositBalance();
    } catch (err: unknown) {
      console.error("Approve failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Approveに失敗しました");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDepositQuote() {
    setError("");
    if (!walletClient) {
      setError("ウォレットが接続されていません");
      return;
    }
    if (!publicClient) {
      setError("パブリッククライアントが利用できません");
      return;
    }
    setIsLoading(true);
    try {
      const tokenAddress = TOKEN_ADDRESSES.USDC as unknown as `0x${string}`;
      const decimals = getTokenDecimals("USDC");
      const amountBN = convertToTokenUnits(depositAmountQuote, decimals);

      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'deposit',
        args: [tokenAddress, amountBN],
        gas: BigInt(300000)
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setModalOpen(true);
      console.log("USDC Deposit successful");
      fetchDepositBalanceQuote();
    } catch (err: unknown) {
      console.error("USDC Deposit failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("USDCのデポジットに失敗しました");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleWithdrawQuote() {
    setError("");
    if (!walletClient) {
      setError("ウォレットが接続されていません");
      return;
    }
    if (!publicClient) {
      setError("パブリッククライアントが利用できません");
      return;
    }
    setIsLoading(true);
    try {
      const tokenAddress = TOKEN_ADDRESSES.USDC as unknown as `0x${string}`;
      const decimals = getTokenDecimals("USDC");
      const amountBN = convertToTokenUnits(withdrawAmountQuote, decimals);

      const hashWithdraw = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'withdraw',
        args: [tokenAddress, amountBN],
        gas: BigInt(300000)
      });

      await publicClient.waitForTransactionReceipt({ hash: hashWithdraw });
      setTxHash(hashWithdraw);
      setModalOpen(true);
      console.log("USDC Withdraw successful");
      fetchDepositBalanceQuote();
    } catch (err: unknown) {
      console.error("USDC Withdraw failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("USDCの引き出しに失敗しました");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApproveQuote() {
    setError("");
    if (!walletClient) {
      setError("ウォレットが接続されていません");
      return;
    }
    if (!publicClient) {
      setError("パブリッククライアントが利用できません");
      return;
    }
    setIsLoading(true);
    try {
      const tokenAddress = TOKEN_ADDRESSES.USDC as unknown as `0x${string}`;
      const decimals = getTokenDecimals("USDC");
      const approveAmount = (depositAmountQuote && depositAmountQuote !== "0") ? depositAmountQuote : "1000000";
      const amountBN = convertToTokenUnits(approveAmount, decimals);
      const hashApprove = await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [VAULT_ADDRESS, amountBN],
        gas: BigInt(300000)
      });
      await publicClient.waitForTransactionReceipt({ hash: hashApprove });
      setTxHash(hashApprove);
      setModalOpen(true);
      console.log("USDC Approve successful");
      fetchDepositBalanceQuote();
    } catch (err: unknown) {
      console.error("USDC Approve failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("USDCのApproveに失敗しました");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancelOrder() {
    setError("");
    if (!walletClient || !publicClient) {
      setError("ウォレットまたはパブリッククライアントが接続されていません");
      return;
    }
    if (!cancelOrderId || cancelOrderId === "") {
      setError("キャンセルするOrder IDを入力してください");
      return;
    }
    setIsLoading(true);
    try {
      const orderIdBN = BigInt(cancelOrderId);
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "cancelOrder",
        args: [orderIdBN],
        gas: BigInt(300000)
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setModalOpen(true);
      console.log("Cancel order successful");
    } catch (err: unknown) {
      console.error("Cancel order failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("注文のキャンセルに失敗しました");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      {/* Left Column: Chart and Trading Form */}
      <div className="col-span-12 lg:col-span-8 grid grid-cols-1 gap-3">
        {/* Chart Placeholder */}
        <div className="bg-trading-gray rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2">
              <div className="flex gap-1 bg-trading-light rounded-lg p-0.5">
                {TRADING_PAIRS.map((pair) => (
                  <button
                    type="button"
                    key={pair.base}
                    onClick={() => setSelectedPair(pair)}
                    className={`px-3 py-1.5 rounded-lg transition-all duration-200 text-sm font-medium ${
                      selectedPair.base === pair.base
                        ? "bg-accent-green text-black"
                        : "bg-trading-light text-white hover:bg-opacity-80"
                    }`}
                  >
                    {pair.base}
                  </button>
                ))}
              </div>
              <div className="flex items-center px-2 text-gray-400">/</div>
              <div className="flex gap-1 bg-trading-light rounded-lg p-0.5">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-accent-green text-black text-sm font-medium"
                >
                  {selectedPair.quote}
                </button>
              </div>
            </div>
            <div className="text-sm font-semibold">
              {selectedPair.base}-{selectedPair.quote}
            </div>
          </div>
          <div className="h-[400px] rounded bg-trading-light flex items-center justify-center">
            <div className="text-gray-400">Chart Coming Soon</div>
          </div>
        </div>

        {/* Trading Form */}
        <div className="bg-trading-gray rounded-lg p-3">
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setSide("buy")}
              className={`flex-1 py-1.5 font-semibold rounded text-sm transition-colors ${
                side === "buy" ? "bg-accent-green text-black" : "bg-trading-light text-white"
              }`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setSide("sell")}
              className={`flex-1 py-1.5 font-semibold rounded text-sm transition-colors ${
                side === "sell" ? "bg-accent-green text-black" : "bg-trading-light text-white"
              }`}
            >
              Sell
            </button>
          </div>

          {/* Order Type Selector */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setOrderType("market")}
              className={`flex-1 py-1.5 font-medium rounded text-xs transition-colors ${
                orderType === "market" ? "bg-accent-green text-black" : "bg-trading-light text-white"
              }`}
            >
              Market
            </button>
            <button
              type="button"
              onClick={() => setOrderType("limit")}
              className={`flex-1 py-1.5 font-medium rounded text-xs transition-colors ${
                orderType === "limit" ? "bg-accent-green text-black" : "bg-trading-light text-white"
              }`}
            >
              Limit
            </button>
          </div>

          <div className="space-y-3">
            {orderType === "market" ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor="market-amount-input" className="block text-xs font-medium text-gray-400 mb-1">
                    Amount ({selectedPair.base})
                  </label>
                  <input
                    id="market-amount-input"
                    type="number"
                    className="trading-input"
                    placeholder="0.00"
                    value={marketAmount}
                    onChange={(e) => setMarketAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="market-price-input" className="block text-xs font-medium text-gray-400 mb-1">
                    Price ({selectedPair.quote})
                  </label>
                  <input
                    id="market-price-input"
                    type="number"
                    className="trading-input"
                    placeholder="0.00"
                    value={marketPrice}
                    onChange={(e) => setMarketPrice(e.target.value)}
                  />
                </div>
                <div className="text-xs text-gray-400">
                  Estimated Total: <span className="text-white">0.00 {selectedPair.quote}</span>
                </div>
                <div className="invisible">
                  <span className="block text-xs font-medium text-gray-400 mb-1">Hidden Spacer</span>
                  <div className="h-[38px]" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="limit-price-input" className="block text-xs font-medium text-gray-400 mb-1">
                      Price ({selectedPair.quote})
                    </label>
                    <input
                      id="limit-price-input"
                      type="number"
                      className="trading-input"
                      placeholder="0.00"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="limit-amount-input" className="block text-xs font-medium text-gray-400 mb-1">
                      Amount ({selectedPair.base})
                    </label>
                    <input
                      id="limit-amount-input"
                      type="number"
                      className="trading-input"
                      placeholder="0.00"
                      value={limitAmount}
                      onChange={(e) => setLimitAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Total: <span className="text-white">0.00 {selectedPair.quote}</span>
                </div>
              </div>
            )}

            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={isLoading}
                  className="w-full py-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all"
                >
                  {isLoading ? "処理中..." : "Place Order"}
                </button>
                {txHash && <p className="mt-2 text-xs text-white">トランザクションハッシュ: {txHash}</p>}
                {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
              </>
            ) : (
              <button
                type="button"
                className="w-full py-2 bg-trading-light text-gray-400 font-semibold rounded text-sm cursor-not-allowed"
              >
                Connect Wallet to Trade
              </button>
            )}
          </div>
        </div>

        {/* Deposit/Withdraw Form */}
        <div className="bg-trading-gray rounded-lg p-3 mt-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Deposit/Withdraw</h2>
          <div className="text-sm text-white mb-2">
            現在の預け入れ残高: {formatTokenUnits(depositBalance, getTokenDecimals(selectedPair.base))} {selectedPair.base}
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="deposit-amount-input" className="block text-xs font-medium text-gray-400 mb-1">
                Deposit Amount ({selectedPair.base})
              </label>
              <input
                id="deposit-amount-input"
                type="number"
                className="trading-input"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
              <button
                type="button"
                onClick={handleApprove}
                disabled={isLoading}
                className="w-full py-2 mt-2 bg-blue-500 text-white font-semibold rounded text-sm hover:shadow-glow transition-all"
              >
                {isLoading ? "処理中..." : "Approve"}
              </button>
              <button
                type="button"
                onClick={handleDeposit}
                disabled={isLoading}
                className="w-full py-2 mt-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all"
              >
                {isLoading ? "処理中..." : "Deposit"}
              </button>
            </div>
            <div>
              <label htmlFor="withdraw-amount-input" className="block text-xs font-medium text-gray-400 mb-1">
                Withdraw Amount ({selectedPair.base})
              </label>
              <input
                id="withdraw-amount-input"
                type="number"
                className="trading-input"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={isLoading}
                className="w-full py-2 mt-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all"
              >
                {isLoading ? "処理中..." : "Withdraw"}
              </button>
            </div>
          </div>
        </div>

        {/* USDC Deposit/Withdraw Form */}
        <div className="bg-trading-gray rounded-lg p-3 mt-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">USDC Deposit/Withdraw</h2>
          <div className="text-sm text-white mb-2">
            現在のUSDC預け入れ残高: {formatTokenUnits(depositBalanceQuote, getTokenDecimals("USDC"))} USDC
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="deposit-quote-amount-input" className="block text-xs font-medium text-gray-400 mb-1">
                Deposit Amount (USDC)
              </label>
              <input
                id="deposit-quote-amount-input"
                type="number"
                step="any"
                className="trading-input"
                placeholder="0.00"
                value={depositAmountQuote}
                onChange={(e) => setDepositAmountQuote(e.target.value)}
              />
              <button
                type="button"
                onClick={handleApproveQuote}
                disabled={isLoading}
                className="w-full py-2 mt-2 bg-blue-500 text-white font-semibold rounded text-sm hover:shadow-glow transition-all"
              >
                {isLoading ? "処理中..." : "Approve"}
              </button>
              <button
                type="button"
                onClick={handleDepositQuote}
                disabled={isLoading}
                className="w-full py-2 mt-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all"
              >
                {isLoading ? "処理中..." : "Deposit"}
              </button>
            </div>
            <div>
              <label htmlFor="withdraw-quote-amount-input" className="block text-xs font-medium text-gray-400 mb-1">
                Withdraw Amount (USDC)
              </label>
              <input
                id="withdraw-quote-amount-input"
                type="number"
                step="any"
                className="trading-input"
                placeholder="0.00"
                value={withdrawAmountQuote}
                onChange={(e) => setWithdrawAmountQuote(e.target.value)}
              />
              <button
                type="button"
                onClick={handleWithdrawQuote}
                disabled={isLoading}
                className="w-full py-2 mt-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all"
              >
                {isLoading ? "処理中..." : "Withdraw"}
              </button>
            </div>
          </div>
        </div>

        {/* Cancel Order Form */}
        <div className="bg-trading-gray rounded-lg p-3 mt-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Cancel Order</h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="cancel-order-input" className="block text-xs font-medium text-gray-400 mb-1">
                Order ID
              </label>
              <input
                id="cancel-order-input"
                type="number"
                className="trading-input"
                placeholder="0"
                value={cancelOrderId}
                onChange={(e) => setCancelOrderId(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={isLoading}
              className="w-full py-2 bg-red-500 text-white font-semibold rounded text-sm hover:shadow-glow transition-all"
            >
              {isLoading ? "処理中..." : "Cancel Order"}
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Order Book / Open Orders */}
      <div className="col-span-12 lg:col-span-4 grid grid-cols-1 gap-3">
        {/* Order Book */}
        <div className="bg-trading-gray rounded-lg p-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Order Book</h2>
          <div className="flex justify-between text-xs text-gray-400 mb-1 px-1">
            <span>Price</span>
            <span>Size</span>
            <span>Total</span>
          </div>
          <div className="space-y-0.5 mb-2 text-xs font-medium">
            <div className="flex justify-between text-red-400 hover:bg-trading-light/50 p-1 rounded cursor-pointer">
              <span>1,845.32</span>
              <span>0.5432</span>
              <span>1,002.43</span>
            </div>
            <div className="flex justify-between text-red-400 hover:bg-trading-light/50 p-1 rounded cursor-pointer">
              <span>1,844.21</span>
              <span>0.8923</span>
              <span>1,645.87</span>
            </div>
          </div>
          <div className="text-center py-1.5 text-sm font-bold text-accent-green border-y border-trading-light">
            1,842.32 {selectedPair.quote}
          </div>
          <div className="space-y-0.5 mt-2 text-xs font-medium">
            <div className="flex justify-between text-accent-green hover:bg-trading-light/50 p-1 rounded cursor-pointer">
              <span>1,841.23</span>
              <span>0.7654</span>
              <span>1,409.87</span>
            </div>
            <div className="flex justify-between text-accent-green hover:bg-trading-light/50 p-1 rounded cursor-pointer">
              <span>1,840.11</span>
              <span>1.1234</span>
              <span>2,067.54</span>
            </div>
          </div>
        </div>

        {/* Open Orders */}
        <div className="bg-trading-gray rounded-lg p-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Open Orders</h2>
          <div className="space-y-2">
            <div className="bg-trading-light rounded p-2 text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-accent-green font-medium">Buy {selectedPair.base}</span>
                <span className="text-gray-400">2 min ago</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>1,840.23 {selectedPair.quote}</span>
                <span>0.5 {selectedPair.base}</span>
              </div>
            </div>
            <div className="bg-trading-light rounded p-2 text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-red-400 font-medium">Sell {selectedPair.base}</span>
                <span className="text-gray-400">5 min ago</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>1,845.12 {selectedPair.quote}</span>
                <span>0.3 {selectedPair.base}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-trading-gray p-6 rounded-lg shadow-lg max-w-md mx-auto text-white">
            <h3 className="text-xl font-bold mb-3">Transaction Success</h3>
            <p className="break-all mb-3">
              Tx Hash: <a
                href={`${env.NEXT_PUBLIC_RISE_SEPOLIA_BLOCK_EXPLORER || 'https://testnet-explorer.riselabs.xyz'}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-green underline"
              >
                {txHash}
              </a>
            </p>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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
