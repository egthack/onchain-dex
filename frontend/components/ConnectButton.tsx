"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useEffect } from "react";
import envConfig from "../utils/envConfig";

export default function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  // 環境設定からChain IDを取得
  const targetChainId = envConfig.NEXT_PUBLIC_CHAIN_ID;

  useEffect(() => {
    // 接続済みかつ異なるネットワークの場合、適切なネットワークに切り替えを要求
    if (isConnected && chainId !== targetChainId && window.ethereum) {
      const hexChainId = `0x${targetChainId.toString(16)}`;
      
      // MetaMaskにネットワーク切り替えを要求
      window.ethereum
        .request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexChainId }],
        })
        .catch((switchError: any) => {
          // ネットワークが存在しない場合（エラーコード 4902）、追加を試みる
          if (switchError.code === 4902 || switchError.message.includes("Unrecognized chain ID")) {
            // ローカルネットワークの場合、追加する
            if (targetChainId === 31337) {
              window.ethereum
                .request({
                  method: "wallet_addEthereumChain",
                  params: [
                    {
                      chainId: hexChainId,
                      chainName: "Localhost 8545",
                      nativeCurrency: {
                        name: "Ethereum",
                        symbol: "ETH",
                        decimals: 18,
                      },
                      rpcUrls: ["http://localhost:8545"],
                      blockExplorerUrls: [],
                    },
                  ],
                })
                .catch((addError: Error) => {
                  console.error("Failed to add network:", addError.message);
                });
            } else {
              console.error("Failed to switch network:", switchError.message);
            }
          } else {
            console.error("Failed to switch network:", switchError.message);
          }
        });
    }
  }, [isConnected, chainId, targetChainId]);

  if (isConnected) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className="px-6 py-2 bg-trading-light text-white font-medium rounded-lg hover:bg-opacity-80 text-base"
      >
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => connect({ connector: injected() })}
      className="px-6 py-2 bg-accent-green text-black font-medium rounded-lg hover:shadow-glow text-base"
    >
      Connect Wallet
    </button>
  );
}
