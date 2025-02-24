"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
const TRADING_PAIRS = [
  { base: "WETH", quote: "USDC" },
  { base: "WBTC", quote: "USDC" },
  { base: "POL", quote: "USDC" },
];

export default function TradingPage() {
  const { isConnected } = useAccount();
  const [selectedPair, setSelectedPair] = useState(TRADING_PAIRS[0]);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [side, setSide] = useState<"buy" | "sell">("buy");

  return (
    <div className="grid grid-cols-12 gap-3">
      {/* Left Column */}
      <div className="col-span-12 lg:col-span-8 grid grid-cols-1 gap-3">
        {/* Chart Placeholder */}
        <div className="bg-trading-gray rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2">
              <div className="flex gap-1 bg-trading-light rounded-lg p-0.5">
                {TRADING_PAIRS.map((pair) => (
                  <button
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
                <button className="px-3 py-1.5 rounded-lg bg-accent-green text-black text-sm font-medium">
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
              onClick={() => setSide("buy")}
              className={`flex-1 py-1.5 font-semibold rounded text-sm transition-colors ${
                side === "buy"
                  ? "bg-accent-green text-black"
                  : "bg-trading-light text-white"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setSide("sell")}
              className={`flex-1 py-1.5 font-semibold rounded text-sm transition-colors ${
                side === "sell"
                  ? "bg-accent-red text-black"
                  : "bg-trading-light text-white"
              }`}
            >
              Sell
            </button>
          </div>

          {/* Order Type Selector */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setOrderType("market")}
              className={`flex-1 py-1.5 font-medium rounded text-xs transition-colors ${
                orderType === "market"
                  ? "bg-accent-green text-black"
                  : "bg-trading-light text-white"
              }`}
            >
              Market
            </button>
            <button
              onClick={() => setOrderType("limit")}
              className={`flex-1 py-1.5 font-medium rounded text-xs transition-colors ${
                orderType === "limit"
                  ? "bg-accent-green text-black"
                  : "bg-trading-light text-white"
              }`}
            >
              Limit
            </button>
          </div>

          <div className="space-y-3">
            {orderType === "market" ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Amount ({selectedPair.base})
                  </label>
                  <input
                    type="number"
                    className="trading-input"
                    placeholder="0.00"
                  />
                </div>
                <div className="text-xs text-gray-400">
                  Estimated Price:{" "}
                  <span className="text-white">
                    1,842.32 {selectedPair.quote}
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  Estimated Total:{" "}
                  <span className="text-white">0.00 {selectedPair.quote}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Price ({selectedPair.quote})
                    </label>
                    <input
                      type="number"
                      className="trading-input"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Amount ({selectedPair.base})
                    </label>
                    <input
                      type="number"
                      className="trading-input"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Total:{" "}
                  <span className="text-white">0.00 {selectedPair.quote}</span>
                </div>
              </div>
            )}

            {isConnected ? (
              <button className="w-full py-2 bg-accent-green text-black font-semibold rounded text-sm hover:shadow-glow transition-all">
                Place Order
              </button>
            ) : (
              <button className="w-full py-2 bg-trading-light text-gray-400 font-semibold rounded text-sm cursor-not-allowed">
                Connect Wallet to Trade
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="col-span-12 lg:col-span-4 grid grid-cols-1 gap-3">
        {/* Order Book */}
        <div className="bg-trading-gray rounded-lg p-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Order Book
          </h2>
          {/* Headers */}
          <div className="flex justify-between text-xs text-gray-400 mb-1 px-1">
            <span>Price</span>
            <span>Size</span>
            <span>Total</span>
          </div>
          {/* Sells */}
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

          {/* Current Price */}
          <div className="text-center py-1.5 text-sm font-bold text-accent-green border-y border-trading-light">
            1,842.32 {selectedPair.quote}
          </div>

          {/* Buys */}
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
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Open Orders
          </h2>
          <div className="space-y-2">
            <div className="bg-trading-light rounded p-2 text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-accent-green font-medium">
                  Buy {selectedPair.base}
                </span>
                <span className="text-gray-400">2 min ago</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>1,840.23 {selectedPair.quote}</span>
                <span>0.5 {selectedPair.base}</span>
              </div>
            </div>
            <div className="bg-trading-light rounded p-2 text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-red-400 font-medium">
                  Sell {selectedPair.base}
                </span>
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
    </div>
  );
}
