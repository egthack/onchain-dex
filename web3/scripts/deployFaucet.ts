import { ethers } from "hardhat";
import type { BigNumberish, ContractTransaction } from "ethers";
import type { TransactionReceipt } from "@ethersproject/providers";
import fs from "node:fs";
import path from "node:path";
import * as hre from "hardhat";

// Define a new type that extends ContractTransaction with a wait method
type MyContractTransaction = ContractTransaction & { wait: () => Promise<TransactionReceipt> };

function getLatestDeployment(network: string): {
  tokens: Record<string, string>;
  trading: Record<string, string>;
} {
  const deploymentPath = path.join(__dirname, "../../deployments", network);
  const files = fs
    .readdirSync(deploymentPath)
    .filter((f) => f.startsWith(`deployment-${network}`))
    .sort((a, b) => {
      const timeA = Number.parseInt(a.split("-").pop()?.replace(".json", "") || "0");
      const timeB = Number.parseInt(b.split("-").pop()?.replace(".json", "") || "0");
      return timeB - timeA;
    });

  if (files.length === 0) {
    throw new Error(`No deployment found for network: ${network}`);
  }

  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentPath, files[0]), "utf8")
  );
  return deployment.contracts;
}

async function main() {
  // Define deployment parameters
  // faucetAmount: Amount of tokens to dispense per request (example: 1 token in wei)
  // cooldown: Cooldown period in seconds (example: 3600 seconds = 1 hour)
  const [deployer] = await ethers.getSigners();

  // デプロイされたコントラクトのアドレスを取得
  const network = hre.network.name;
  const deployment = {
    contracts: getLatestDeployment(network),
  };


  const faucetAmount = ethers.parseEther("1");
  const cooldown = 3600;

  // Get the MultiTokenFaucet contract factory
  const MultiTokenFaucet = await ethers.getContractFactory("MultiTokenFaucet");
  console.log("Deploying MultiTokenFaucet contract...");

  // Deploy the contract with the specified parameters (maxTokenAmount is now set per token via setMaxTokenAmount)
  const faucet = await MultiTokenFaucet.deploy(faucetAmount, cooldown);
  await faucet.waitForDeployment();

  console.log("MultiTokenFaucet deployed to:", await faucet.getAddress());

  // Define a local type that includes setMaxTokenAmount with proper types
  type MultiTokenFaucetContract = typeof faucet & {
    setMaxTokenAmount(tokenAddress: string, amount: BigNumberish): Promise<MyContractTransaction>;
  };

  const faucetContract = faucet as MultiTokenFaucetContract;

  // Optionally, set maxTokenAmount for specific token addresses after deployment
  // 例として、WETHとUSDCのmaxTokenAmountを設定します
  const wethAddress = deployment.contracts.tokens.WETH;  
  const usdcAddress = deployment.contracts.tokens.USDC;
  const wbtcAddress = deployment.contracts.tokens.WBTC;
  const polAddress = deployment.contracts.tokens.POL;
  // WETH: 例として最大10トークンを設定（WETHは18桁）
  const txWETH = await faucetContract.setMaxTokenAmount(wethAddress, ethers.parseUnits("100", 18));
  await txWETH.wait();
  console.log("Set maxTokenAmount for WETH to 100 tokens");

  // USDC: 例として最大10000トークンを設定（USDCは6桁）
  const txUSDC = await faucetContract.setMaxTokenAmount(usdcAddress, ethers.parseUnits("10000", 6));
  await txUSDC.wait();
  console.log("Set maxTokenAmount for USDC to 10000 tokens");

  const txWBTC = await faucetContract.setMaxTokenAmount(wbtcAddress, ethers.parseUnits("10", 8));
  await txWBTC.wait();
  console.log("Set maxTokenAmount for WBTC to 10 tokens");

  const txPOL = await faucetContract.setMaxTokenAmount(polAddress, ethers.parseUnits("1000", 18));
  await txPOL.wait();
  console.log("Set maxTokenAmount for POL to 1000 tokens");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
