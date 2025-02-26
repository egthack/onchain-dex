import { ethers } from "hardhat";
import type { BigNumberish, ContractTransaction } from "ethers";
import type { TransactionReceipt } from "@ethersproject/providers";

// Define a new type that extends ContractTransaction with a wait method
type MyContractTransaction = ContractTransaction & { wait: () => Promise<TransactionReceipt> };

async function main() {
  // Define deployment parameters
  // faucetAmount: Amount of tokens to dispense per request (example: 1 token in wei)
  // cooldown: Cooldown period in seconds (example: 3600 seconds = 1 hour)
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
  const wethAddress = "0xb0FA0536A85DfbFA078f51D8a52A009A86F7cc72";  
  const usdcAddress = "0xf96c5D210da8Ad33b2BAdEeDF59cCAEBBb4e2629";
  const wbtcAddress = "0xd59874ceC35C7E9Ff121e27Ac72367Bbc28f3FE8";
  const polAddress = "0xfB9519fD8730Bff3Cf8469C5634B6338E95a378e";
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
