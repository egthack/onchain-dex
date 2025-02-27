"use client";

import type { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import type { Chain } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";

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

const config = createConfig({
  chains: [riseSepolia],
  connectors: [injected()],
  transports: {
    [riseSepolia.id]: http(
      process.env.NEXT_PUBLIC_RISE_SEPOLIA_RPC_URL ?? "http://localhost:8545"
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
