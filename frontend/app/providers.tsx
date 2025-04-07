"use client";

import type { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import type { Chain } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";
import envConfig from "../utils/envConfig";

// ローカル環境用のHardhatネットワーク設定
const localhost = {
  id: 31337,
  name: "Localhost",
  nativeCurrency: {
    decimals: 18,
    name: "Ethereum",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://localhost:8545"],
    },
    public: {
      http: ["http://localhost:8545"],
    },
  },
} as const satisfies Chain;

// Rise Sepoliaネットワーク設定
const riseSepolia = {
  id: Number(process.env.NEXT_PUBLIC_RISE_SEPOLIA_CHAIN_ID),
  name: "Rise Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "Sepolia Ether",
    symbol: "SEP",
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RISE_SEPOLIA_RPC_URL ?? "http://localhost:8545",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_RISE_SEPOLIA_RPC_URL ?? "http://localhost:8545",
      ],
    },
  },
  blockExplorers: process.env.NEXT_PUBLIC_RISE_SEPOLIA_BLOCK_EXPLORER
    ? {
        default: {
          name: "Explorer",
          url: process.env.NEXT_PUBLIC_RISE_SEPOLIA_BLOCK_EXPLORER,
        },
      }
    : undefined,
} as const satisfies Chain;

const activeChain = envConfig.NETWORK === 'localhost' ? localhost : riseSepolia;
console.log(`[PROVIDERS] Active network: ${envConfig.NETWORK}, Chain ID: ${activeChain.id}`);

const config = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: {
    [activeChain.id]: http(
      activeChain.rpcUrls.default.http[0]
    ),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
