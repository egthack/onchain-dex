import { createConfig } from "ponder";
import { http } from "viem";
import { MatchingEngineABI, TradingVaultABI } from "./abis/index";
import contractAddresses from "./deployed/contract_addresses.json";

export default createConfig({
  networks: {
    mainnet: {
      chainId: 1,
      transport: http(process.env.PONDER_RPC_URL_1),
    },

    riseSepolia: {
      chainId: 11155931,
      transport: http(process.env.RISE_SEPOLIA_URL),
    },
  },
  contracts: {
    MatchingEngine: {
      network: "riseSepolia",
      abi: MatchingEngineABI,
      address: contractAddresses.riseSepolia.MatchingEngine as `0x${string}`,
      startBlock: 13142655,
    },
    TradingVault: {
      network: "riseSepolia",
      abi: TradingVaultABI,
      address: contractAddresses.riseSepolia.TradingVault as `0x${string}`,
      startBlock: 13142655,
    },
  },
});
