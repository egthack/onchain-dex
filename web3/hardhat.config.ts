import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_URL,
      accounts: [process.env.PRIVATE_KEY ?? ""],
    },
    riseSepolia: {
      url: process.env.RISE_SEPOLIA_URL,
      accounts: [process.env.PRIVATE_KEY ?? ""],
    },
  },
};

export default config;
