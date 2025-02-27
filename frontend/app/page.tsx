"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import TradingVaultABI from "../abi/ITradingVault.json";
import * as ethers from "ethers";
import env from "../env.json";
import Script from "next/script";
import Link from "next/link";

interface Order {
  id: string;
  price: string;
  side: number;
  status: string;
  createdAt: string;
  amount: string;
  baseToken: { symbol: string };
  quoteToken: { symbol: string };
}

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

declare global {
  interface Window {
    TradingView?: {
      widget: {
        new(options: {
          autosize: boolean;
          symbol: string;
          interval: string;
          timezone: string;
          theme: string;
          style: string;
          locale: string;
          toolbar_bg: string;
          enable_publishing: boolean;
          hide_side_toolbar: boolean;
          allow_symbol_change: boolean;
          container_id: string;
        }): unknown;
      };
    };
  }
}

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

  const [marketPrice, setMarketPrice] = useState("");

  const [depositBalance, setDepositBalance] = useState<bigint>(BigInt(0));

  const [depositBalanceQuote, setDepositBalanceQuote] = useState<bigint>(BigInt(0));

  const [modalOpen, setModalOpen] = useState(false);

  const [marketPriceError, setMarketPriceError] = useState("");
  const [marketAmountError, setMarketAmountError] = useState("");
  const [limitPriceError, setLimitPriceError] = useState("");
  const [limitAmountError, setLimitAmountError] = useState("");

  const [balanceWarning, setBalanceWarning] = useState("");

  // Add new states for buy and sell order books
  const [buyOrderBook, setBuyOrderBook] = useState<Order[]>([]);
  const [sellOrderBook, setSellOrderBook] = useState<Order[]>([]);

  // latestPrice stateを追加
  const [latestPrice, setLatestPrice] = useState("");

  // Add new state variable for orders at the beginning of the component (after other state declarations)
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'open' | 'history'>('open');

  // Compute open orders and history orders
  const openOrders = myOrders.filter(order => order.status === 'OPEN');
  const historyOrders = myOrders.filter(order => order.status !== 'OPEN');

  // Add new state variables near other useState declarations
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelOrderIdForModal, setCancelOrderIdForModal] = useState("");

  // トークンシンボルからデシマル値を取得する関数
  const getTokenDecimals = useCallback((symbol: string): number => {
    return TOKEN_DECIMALS[symbol as keyof typeof TOKEN_DECIMALS] || 18; // デフォルトは18
  }, []);

  const formatTokenUnits = useCallback((amount: bigint, decimals: number): string => {
    const s = amount.toString().padStart(decimals + 1, '0');
    const integerPart = s.slice(0, s.length - decimals);
    let fractionPart = s.slice(s.length - decimals);
    // Trim trailing zeros
    fractionPart = fractionPart.replace(/0+$/, '');
    return fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
  }, []);

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

  // useEffect to check balance warning
  useEffect(() => {
    let warning = "";
    if (orderType === "market") {
      if (side === "buy" && marketAmount && marketPrice) {
        const estimatedTotal = Number.parseFloat(marketAmount) * Number.parseFloat(marketPrice);
        const availableUSDC = Number.parseFloat(formatTokenUnits(depositBalanceQuote, getTokenDecimals("USDC")));
        if (estimatedTotal > availableUSDC) {
          warning = "Order total exceeds available USDC balance";
        }
      } else if (side === "sell" && marketAmount) {
        const amountValue = Number.parseFloat(marketAmount);
        const availableToken = Number.parseFloat(formatTokenUnits(depositBalance, getTokenDecimals(selectedPair.base)));
        if (amountValue > availableToken) {
          warning = "Order amount exceeds available token balance";
        }
      }
    } else { // limit orders
      if (side === "buy" && limitAmount && limitPrice) {
        const estimatedTotal = Number.parseFloat(limitAmount) * Number.parseFloat(limitPrice);
        const availableUSDC = Number.parseFloat(formatTokenUnits(depositBalanceQuote, getTokenDecimals("USDC")));
        if (estimatedTotal > availableUSDC) {
          warning = "Order total exceeds available USDC balance";
        }
      } else if (side === "sell" && limitAmount) {
        const amountValue = Number.parseFloat(limitAmount);
        const availableToken = Number.parseFloat(formatTokenUnits(depositBalance, getTokenDecimals(selectedPair.base)));
        if (amountValue > availableToken) {
          warning = "Order amount exceeds available token balance";
        }
      }
    }
    setBalanceWarning(warning);
  }, [orderType, side, marketAmount, marketPrice, limitAmount, limitPrice, depositBalance, depositBalanceQuote, selectedPair, getTokenDecimals, formatTokenUnits]);

  // Updated Buy Orders fetching hook
  useEffect(() => {
    async function fetchBuyOrderBook() {
      try {
        const response = await fetch(env.NEXT_PUBLIC_SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query BuyOrders {
                orders(
                  where: { 
                    status: "OPEN", 
                    side: 0, 
                    baseToken_: { symbol: "${selectedPair.base}" }, 
                    quoteToken_: { symbol: "${selectedPair.quote}" }
                  }
                  orderBy: price
                  orderDirection: desc
                  first: 20
                ) {
                  id
                  price
                  side
                  status
                  createdAt
                  amount
                  baseToken { symbol }
                  quoteToken { symbol }
                }
              }
            `
          })
        });
        const result = await response.json();
        if (result.data?.orders) {
          setBuyOrderBook(result.data.orders.slice(0, 20));
      } else {
          console.error('Invalid data format for buy orders', result);
        }
      } catch (error) {
        console.error('Failed to fetch buy orders:', error);
      }
    }
    fetchBuyOrderBook();
    const interval = setInterval(fetchBuyOrderBook, 2000);
    return () => clearInterval(interval);
  }, [selectedPair]);

  // Updated Sell Orders fetching hook
  useEffect(() => {
    async function fetchSellOrderBook() {
      try {
        const response = await fetch(env.NEXT_PUBLIC_SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query SellOrders {
                orders(
                  where: { 
                    status: "OPEN", 
                    side: 1, 
                    baseToken_: { symbol: "${selectedPair.base}" }, 
                    quoteToken_: { symbol: "${selectedPair.quote}" }
                  }
                  orderBy: price
                  orderDirection: asc
                  first: 20
                ) {
                  id
                  price
                  side
                  status
                  createdAt
                  amount
                  baseToken { symbol }
                  quoteToken { symbol }
                }
              }
            `
          })
        });
        const result = await response.json();
        if (result.data?.orders) {
          setSellOrderBook(result.data.orders.slice(0, 20));
        } else {
          console.error('Invalid data format for sell orders', result);
        }
      } catch (error) {
        console.error('Failed to fetch sell orders:', error);
      }
    }
    fetchSellOrderBook();
    const interval = setInterval(fetchSellOrderBook, 2000);
    return () => clearInterval(interval);
  }, [selectedPair]);

  // 修正: useEffectフックをselectedPair依存にして、クエリに通貨ペアのフィルタを追加する
  useEffect(() => {
    async function fetchLastFilledOrder() {
      try {
        const response = await fetch(env.NEXT_PUBLIC_SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query MyQuery {
                orders(
                  orderBy: filledAt,
                  orderDirection: desc,
                  where: {
                    status: FILLED,
                    baseToken_: { symbol: "${selectedPair.base}" },
                    quoteToken_: { symbol: "${selectedPair.quote}" }
                  },
                  first: 1
                ) {
                  price
                  side
                  status
                  baseToken { symbol }
                  quoteToken { symbol }
                  filledAt
                }
              }
            `
          })
        });
        const result = await response.json();
        if (result.data?.orders?.length > 0) {
          const price = result.data.orders[0].price;
          console.log("Last filled order price:", price);
          setLatestPrice(price);
      } else {
          console.log("No filled orders found", result);
          setLatestPrice("");
        }
      } catch (error) {
        console.error("Failed to fetch last filled order:", error);
        setLatestPrice("");
      }
    }

    fetchLastFilledOrder();
    const interval = setInterval(fetchLastFilledOrder, 2000);
    return () => clearInterval(interval);
  }, [selectedPair]);

  const symbolMap: { [key: string]: string } = {
    WETH: "BINANCE:ETHUSDC",
    WBTC: "BINANCE:BTCUSDC",
    POL: "BINANCE:POLUSDC"
  };
  const widgetSymbol = symbolMap[selectedPair.base] || "BINANCE:ETHUSDC";

  useEffect(() => {
    if (window.TradingView) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      new window.TradingView.widget({
        autosize: true,
        symbol: widgetSymbol,
        interval: "D",
        timezone: "Asia/Tokyo",
        theme: "dark",
        style: "1",
        locale: "ja",
        toolbar_bg: "#f1f3f6",
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        container_id: "tradingview_chart"
      });
    }
  }, [widgetSymbol]);

  async function handlePlaceOrder() {
    setError("");
    setTxHash("");
    if (!walletClient || !publicClient) {
      setError("Wallet or public client is not connected");
      setIsLoading(false);
      return;
    }
    if (!address) {
      setError("Wallet not connected");
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
          setError("Please enter the amount");
          setIsLoading(false);
          return;
        }
        if (!marketPrice || marketPrice === "0") {
          setError("Please enter the price");
            setIsLoading(false);
            return;
        }
        amountBN = BigInt(Math.floor(Number.parseFloat(marketAmount) * 1000000));
        priceBN = BigInt(Math.floor(Number.parseFloat(marketPrice) * 100));
      } else {
        if (!limitAmount || limitAmount === "0") {
          setError("Please enter the amount");
          setIsLoading(false);
          return;
        }
        if (!limitPrice || limitPrice === "0") {
          setError("Please enter the price");
          setIsLoading(false);
          return;
        }
        amountBN = BigInt(Math.floor(Number.parseFloat(limitAmount) * 1000000));
        priceBN = BigInt(Math.floor(Number.parseFloat(limitPrice) * 100));
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

      // TradingVault経由で注文を実行
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "executeTradeBatch",
        args: [[tradeRequest]],
        gas: BigInt(5000000)
      });

      const receiptOrder = await publicClient.waitForTransactionReceipt({ hash });
      if (receiptOrder.status !== "success") {
        setError("Order execution failed");
        setModalOpen(true);
      } else {
        setError("");
        setTxHash(hash);
        if (side === "buy") {
          fetchDepositBalanceQuote();
        } else {
          fetchDepositBalance();
        }
        setModalOpen(true);
        console.log("Order placed successfully via TradingVault");
      }
    } catch (err: unknown) {
      console.error("Order failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Order execution failed");
      }
    } finally {
      setIsLoading(false);
    }
  }

  // Group and aggregate sell orders by price
  const aggregatedSellOrders = useMemo(() => {
    const groups: Record<string, { price: string, size: number }> = {};
    for (const order of sellOrderBook) {
      const price = order.price;
      const size = Number.parseFloat(order.amount);
      if (groups[price]) {
        groups[price].size += size;
      } else {
        groups[price] = { price, size };
      }
    }
    // Sort in ascending order of price so that cumulative totals are computed from the cheapest order upward
    const sorted = Object.values(groups).sort((a, b) => Number.parseFloat(a.price) - Number.parseFloat(b.price)).reverse().slice(0, 10);
    return sorted;
  }, [sellOrderBook]);

  // Compute cumulative total for sell orders (reversed cumulative sum)
  const aggregatedSellOrdersWithTotal = useMemo(() => {
    const result: Array<{ price: string; size: number; total: number }> = aggregatedSellOrders.map(order => ({ ...order, total: 0 }));
    let cum = 0;
    for (let i = result.length - 1; i >= 0; i--) {
      cum += result[i].size;
      result[i].total = cum;
    }
    return result;
  }, [aggregatedSellOrders]);

  // Group and aggregate buy orders by price
  const aggregatedBuyOrders = useMemo(() => {
    const groups: Record<string, { price: string, size: number }> = {};
    for (const order of buyOrderBook) {
      const price = order.price;
      const size = Number.parseFloat(order.amount);
      if (groups[price]) {
        groups[price].size += size;
      } else {
        groups[price] = { price, size };
      }
    }
    // For buy orders, sort in descending order of price
    const sorted = Object.values(groups).sort((a, b) => Number.parseFloat(b.price) - Number.parseFloat(a.price));
    return sorted.slice(0, 10);
  }, [buyOrderBook]);

  // Compute cumulative total for buy orders
  const aggregatedBuyOrdersWithTotal = useMemo(() => {
    let cum = 0;
    return aggregatedBuyOrders.map(item => {
      cum += item.size;
      return { ...item, total: cum };
    });
  }, [aggregatedBuyOrders]);

  // Wrap fetchMyOrders in useCallback:
  const fetchMyOrders = useCallback(async () => {
    if (!address) return;
    try {
      const query = `
        query MyQuery {
          orders(
            orderDirection: desc,
            where: {
              user_: { id: "${address?.toLowerCase()}" },
              baseToken_: { symbol: "${selectedPair.base}" },
              quoteToken_: { symbol: "${selectedPair.quote}" }
            }
          ) {
            id
            price
            side
            status
            amount
            baseToken { symbol }
            quoteToken { symbol }
            filledAt
            cancelledAt
            createdAt
            user { id }
          }
        }
      `;
      const response = await fetch(env.NEXT_PUBLIC_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const result = await response.json();
      if (result.data?.orders) {
        const sortedOrders = result.data.orders.sort((a: Order, b: Order) => Number(b.createdAt) - Number(a.createdAt));
        setMyOrders(sortedOrders);
      } else {
        console.error("No orders found", result);
      }
    } catch (err) {
      console.error("Error fetching orders", err);
    }
  }, [address, selectedPair]);

  // Update useEffect to depend on fetchMyOrders
  useEffect(() => {
    fetchMyOrders();
    const interval = setInterval(fetchMyOrders, 10000); // polling every 10 seconds
    return () => clearInterval(interval);
  }, [fetchMyOrders]);

  // Add new function to handle cancellation confirmation
  async function handleConfirmCancel() {
    setError("");
    if (!walletClient || !publicClient) {
      setError("Wallet or public client is not connected");
      return;
    }
    if (!cancelOrderIdForModal) {
      setError("No order selected for cancellation");
      return;
    }
    setIsLoading(true);
    try {
      const orderIdBN = ethers.parseUnits(cancelOrderIdForModal, 0);
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "cancelOrder",
        args: [orderIdBN],
        gas: BigInt(300000)
      });
      const receiptCancel = await publicClient.waitForTransactionReceipt({ hash });
      if (receiptCancel.status !== "success") {
        setError("Order cancellation failed");
        setModalOpen(true);
      } else {
        setError("");
        setTxHash(hash);
        setModalOpen(true);
        console.log("Order cancellation successful");
        fetchMyOrders();
      }
    } catch (err: unknown) {
      console.error("Cancel order failed", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Order cancellation failed");
      }
    } finally {
      setIsLoading(false);
      setIsCancelModalOpen(false);
      setCancelOrderIdForModal("");
    }
  }

  // Helper function to format date string as 'YY/MM/DD HH:mm'
  function formatDate(dateStr: string): string {
    const timestamp = Number(dateStr) * 1000;
    const date = new Date(timestamp);
    const yy = String(date.getFullYear()).slice(-2);
    const mm = (`0${date.getMonth() + 1}`).slice(-2);
    const dd = (`0${date.getDate()}`).slice(-2);
    const hh = (`0${date.getHours()}`).slice(-2);
    const min = (`0${date.getMinutes()}`).slice(-2);
    return `${yy}/${mm}/${dd} ${hh}:${min}`;
  }

  // New: Function to handle order book row click
  const handlePriceClick = (price: string) => {
    if (orderType === 'market') {
      setMarketPrice(price);
    } else {
      setLimitPrice(price);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <Script
        src="https://s3.tradingview.com/tv.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.TradingView) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            new window.TradingView.widget({
              autosize: true,
              symbol: widgetSymbol,
              interval: "D",
              timezone: "Asia/Tokyo",
              theme: "dark",
              style: "1",
              locale: "ja",
              toolbar_bg: "#f1f3f6",
              enable_publishing: false,
              hide_side_toolbar: false,
              allow_symbol_change: true,
              container_id: "tradingview_chart"
            });
          }
        }}
      />
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
          <div id="tradingview_chart" className="h-[400px] rounded bg-trading-light flex items-center justify-center">
          </div>
        </div>

        {/* Tabbed view for MY OPEN ORDERS and HISTORY */}
        <div>
          <div className="flex mb-4 border-b border-gray-500">
            <button
              type="button"
              className={`px-4 py-2 focus:outline-none ${activeTab === 'open' ? 'border-b-2 border-accent-green text-white' : 'text-gray-400'}`}
              onClick={() => setActiveTab('open')}
            >
              MY OPEN ORDERS
            </button>
            <button
              type="button"
              className={`ml-4 px-4 py-2 focus:outline-none ${activeTab === 'history' ? 'border-b-2 border-accent-green text-white' : 'text-gray-400'}`}
              onClick={() => setActiveTab('history')}
            >
              HISTORY
            </button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
            <table className="min-w-full divide-y divide-trading-light bg-trading-gray rounded-lg overflow-hidden shadow-md">
              <thead className="bg-trading-light">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-200 uppercase tracking-wider">Id</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-200 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-200 uppercase tracking-wider">Price</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-200 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-200 uppercase tracking-wider">Side</th>
                  {activeTab === 'open' && (
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-200 uppercase tracking-wider">Cancel</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-trading-light">
                {(activeTab === 'open' ? openOrders : historyOrders).map(order => (
                  <tr key={order.id} className="hover:bg-trading-black transition-colors">
                    <td className="px-4 py-2 text-sm">{order.id}</td>
                    <td className={`px-4 py-2 text-sm ${activeTab === 'open' ? (order.side === 0 ? 'text-green-300' : 'text-red-300') : 'text-white'}`}>{formatDate(order.createdAt)}</td>
                    <td className={`px-4 py-2 text-sm ${activeTab === 'open' ? (order.side === 0 ? 'text-green-300' : 'text-red-300') : 'text-white'}`}>
                      {(Number(order.price) / 100).toFixed(2)}
                    </td>
                    <td className={`px-4 py-2 text-sm ${activeTab === 'open' ? (order.side === 0 ? 'text-green-300' : 'text-red-300') : 'text-white'}`}>
                      {(Number(order.amount) / (10 ** 6)).toFixed(2)} {order.baseToken?.symbol || ''}
                    </td>
                    <td className={`px-4 py-2 text-sm ${activeTab === 'open' ? (order.side === 0 ? 'text-green-300' : 'text-red-300') : 'text-white'}`}>{order.side === 0 ? 'BUY' : 'SELL'}</td>
                    {activeTab === 'open' && (
                      <td className="px-4 py-2 text-sm text-center">
                        <button type="button" onClick={() => { console.log(order.id); setCancelOrderIdForModal(order.id); setIsCancelModalOpen(true); }} className="text-red-500 hover:text-red-700">
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {(activeTab === 'open' ? openOrders : historyOrders).length === 0 && (
              <div className="text-center text-gray-400 py-4">No {activeTab === 'open' ? 'open' : 'history'} orders.</div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Order Book / Open Orders */}
      <div className="col-span-12 lg:col-span-4 grid grid-cols-1 gap-3">
        {/* Combined Order Book Section (Vertical Layout) */}
        <div className="bg-trading-gray rounded-lg p-3 mt-3">
          {/* Sell Orders Section */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1 px-1">
              <span>Price</span>
              <span>Size ({selectedPair.base})</span>
              <span>Total ({selectedPair.base})</span>
            </div>
            <div className="grid grid-rows-5">
              {(() => {
                const rows = [];
                const emptyCount = 5 - aggregatedSellOrdersWithTotal.length;
                // For sell orders, align orders at the bottom by rendering empty rows first
                for (let i = 0; i < emptyCount; i++) {
                  rows.push(<div key={`empty-sell-${i}`} className="h-6" />);
                }
                const maxSellTotal = aggregatedSellOrdersWithTotal.length ? Math.max(...aggregatedSellOrdersWithTotal.map(o => o.total)) : 0;
                for (const order of aggregatedSellOrdersWithTotal) {
                  const ratio = maxSellTotal ? (order.total / maxSellTotal) * 100 : 0;
                  rows.push(
                    <button 
                      type="button"
                      key={order.price}
                      onClick={() => handlePriceClick((Number.parseFloat(order.price) / 100).toFixed(2))}
                      className="relative w-full flex justify-between p-1 rounded cursor-pointer bg-red-900 text-red-300 hover:bg-red-800 appearance-none focus:outline-none"
                    >
                      <div className="absolute top-0 left-0 h-full bg-red-500 opacity-30" style={{ width: `${ratio}%` }} />
                      <span>{(Number.parseFloat(order.price) / 100).toFixed(2)}</span>
                      <span>{(order.size / (10 ** 6)).toFixed(2)}</span>
                      <span>{(order.total / (10 ** 6)).toFixed(2)}</span>
                    </button>
                  );
                }
                return rows;
              })()}
            </div>
          </div>

          {/* 最新約定価格表示セクション */}
          <div className="my-2 text-center text-lg text-white bg-trading-light py-1 rounded">
            {latestPrice ? (Number(latestPrice) / 100).toFixed(2) : "--"} {selectedPair.quote}
          </div>

          {/* Buy Orders Section */}
          <div>
            <div className="grid grid-rows-5">
              {(() => {
                const rows = [];
                // For buy orders, align orders at the top by rendering orders first
                const maxBuyTotal = aggregatedBuyOrdersWithTotal.length ? Math.max(...aggregatedBuyOrdersWithTotal.map(o => o.total)) : 0;
                for (const order of aggregatedBuyOrdersWithTotal) {
                  const ratio = maxBuyTotal ? (order.total / maxBuyTotal) * 100 : 0;
                  rows.push(
                    <button 
                      type="button"
                      key={order.price}
                      onClick={() => handlePriceClick((Number.parseFloat(order.price) / 100).toFixed(2))}
                      className="relative w-full flex justify-between p-1 rounded cursor-pointer bg-green-900 text-green-300 hover:bg-green-800 appearance-none focus:outline-none"
                    >
                      <div className="absolute top-0 left-0 h-full bg-green-500 opacity-30" style={{ width: `${ratio}%` }} />
                      <span>{(Number.parseFloat(order.price) / 100).toFixed(2)}</span>
                      <span>{(order.size / (10 ** 6)).toFixed(2)}</span>
                      <span>{(order.total / (10 ** 6)).toFixed(2)}</span>
                    </button>
                  );
                }
                const emptyCount = 5 - aggregatedBuyOrdersWithTotal.length;
                for (let i = 0; i < emptyCount; i++) {
                  rows.push(<div key={`empty-buy-${i}`} className="h-6" />);
                }
                return rows;
              })()}
            </div>
          </div>
        </div>

        {/* New: Place Order Block added to Right Column */}
        <div className="bg-trading-gray rounded-lg p-3 mt-3">
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
                {/* Market Order inputs (replica of the ones removed from left column) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="market-price-input" className="block text-xs font-medium text-gray-400 mb-1">
                      Price ({selectedPair.quote})
                    </label>
                    <input
                      id="market-price-input"
                      type="number"
                      step="0.01"
                      className="trading-input"
                      placeholder="0.00"
                      value={marketPrice}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMarketPrice(value);
                        if (value && !/^\d*(\.\d{0,2})?$/.test(value)) {
                          setMarketPriceError("Price can have up to 2 decimal places only");
                        } else {
                          setMarketPriceError("");
                        }
                      }}
                    />
                    {marketPriceError && <p className="text-xs text-red-500">{marketPriceError}</p>}
                  </div>
                  <div>
                    <label htmlFor="market-amount-input" className="block text-xs font-medium text-gray-400 mb-1">
                      Amount ({selectedPair.base})
                    </label>
                    <input
                      id="market-amount-input"
                      type="number"
                      step="0.000001"
                      className="trading-input"
                      placeholder="0.00"
                      value={marketAmount}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMarketAmount(value);
                        if (value && !/^\d*(\.\d{0,6})?$/.test(value)) {
                          setMarketAmountError("Amount can have up to 6 decimal places only");
                        } else {
                          setMarketAmountError("");
                        }
                      }}
                    />
                    {marketAmountError && <p className="text-xs text-red-500">{marketAmountError}</p>}
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Estimated Total: <span className="text-white">
                    {marketAmount && marketPrice ? (Number.parseFloat(marketAmount) * Number.parseFloat(marketPrice)).toFixed(2) : "0.00"} {selectedPair.quote}
                  </span>
                </div>
                {balanceWarning && <p className="text-xs text-yellow-400">{balanceWarning}</p>}
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
                      step="0.01"
                      className="trading-input"
                      placeholder="0.00"
                      value={limitPrice}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLimitPrice(value);
                        if (value && !/^\d*(\.\d{0,2})?$/.test(value)) {
                          setLimitPriceError("Price can have up to 2 decimal places only");
                        } else {
                          setLimitPriceError("");
                        }
                      }}
                    />
                    {limitPriceError && <p className="text-xs text-red-500">{limitPriceError}</p>}
                  </div>
                  <div>
                    <label htmlFor="limit-amount-input" className="block text-xs font-medium text-gray-400 mb-1">
                      Amount ({selectedPair.base})
                    </label>
                    <input
                      id="limit-amount-input"
                      type="number"
                      step="0.000001"
                      className="trading-input"
                      placeholder="0.00"
                      value={limitAmount}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLimitAmount(value);
                        if (value && !/^\d*(\.\d{0,6})?$/.test(value)) {
                          setLimitAmountError("Amount can have up to 6 decimal places only");
                        } else {
                          setLimitAmountError("");
                        }
                      }}
                    />
                    {limitAmountError && <p className="text-xs text-red-500">{limitAmountError}</p>}
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Estimated Total: <span className="text-white">
                    {limitAmount && limitPrice ? (Number.parseFloat(limitAmount) * Number.parseFloat(limitPrice)).toFixed(2) : "0.00"} {selectedPair.quote}
                  </span>
                </div>
                {balanceWarning && <p className="text-xs text-yellow-400">{balanceWarning}</p>}
              </div>
            )}

            {isConnected ? (
              <>
                <div className={`text-sm pb-2 ${(side === 'buy' ? depositBalanceQuote : depositBalance) === BigInt(0) ? 'text-yellow-500' : 'text-white'}`}>
                  Available deposit balance: {side === 'buy' ? formatTokenUnits(depositBalanceQuote, getTokenDecimals("USDC")) : formatTokenUnits(depositBalance, getTokenDecimals(selectedPair.base))} {side === 'buy' ? "USDC" : selectedPair.base}
                </div>
                {(side === 'buy' ? depositBalanceQuote : depositBalance) === BigInt(0) ? (
                  <Link href="/deposit">
                    <button
                      type="button"
                      className="w-full py-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all"
                    >
                      Deposit
                    </button>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={handlePlaceOrder}
                    disabled={isLoading}
                    className="w-full py-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all"
                  >
                    {isLoading ? "Processing..." : "Place Order"}
                  </button>
                )}
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
      </div>

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
                onClick={() => {
                  setModalOpen(false);
                  setError("");
                }}
                className="mt-4 bg-accent-green text-black px-4 py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isCancelModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-trading-gray p-6 rounded-lg shadow-lg max-w-md mx-auto text-white">
            <h3 className="text-xl font-bold mb-3">Confirm Cancellation</h3>
            <p className="mb-4">Are you sure you want to cancel order ID: {cancelOrderIdForModal}?</p>
            <div className="flex justify-between">
              <button type="button" onClick={handleConfirmCancel} disabled={isLoading} className="bg-red-500 text-white px-4 py-2 rounded">
                {isLoading ? "Processing..." : "Cancel Order"}
              </button>
              <button type="button" onClick={() => setIsCancelModalOpen(false)} className="bg-accent-green text-black px-4 py-2 rounded">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
