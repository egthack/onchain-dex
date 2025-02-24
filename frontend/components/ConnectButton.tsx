"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useEffect } from "react";

export default function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  // RiseSepoliaのChain ID
  const RISE_SEPOLIA_CHAIN_ID = Number(
    process.env.NEXT_PUBLIC_RISE_SEPOLIA_CHAIN_ID
  );

  useEffect(() => {
    // 接続済みかつ異なるネットワークの場合、RiseSepoliaに切り替えを要求
    if (isConnected && chainId !== RISE_SEPOLIA_CHAIN_ID) {
      // MetaMaskにネットワーク切り替えを要求
      window.ethereum
        ?.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${RISE_SEPOLIA_CHAIN_ID.toString(16)}` }],
        })
        .catch((error: Error) => {
          console.error("Failed to switch network:", error.message);
        });
    }
  }, [isConnected, chainId, RISE_SEPOLIA_CHAIN_ID]);

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        className="px-6 py-2 bg-trading-light text-white font-medium rounded-lg hover:bg-opacity-80 text-base"
      >
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="px-6 py-2 bg-accent-green text-black font-medium rounded-lg hover:shadow-glow text-base"
    >
      Connect Wallet
    </button>
  );
}
