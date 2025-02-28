import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import * as hre from "hardhat";
import { MockERC20 } from "../typechain-types";
import { string } from "hardhat/internal/core/params/argumentTypes";

const main = async () => {
  const [deployer] = await ethers.getSigners();
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log("Current block number:", blockNumber);
  console.log("Deploying contracts with the account:", deployer.address);
  const deployedAddresses = {
    network: hre.network.name,
    blockNumber: blockNumber,
    deployer: deployer.address,
    contracts: {
      tokens: {} as Record<string, string>,
      trading: {} as Record<string, string>,
      faucet: "",
    },
  };

  const faucetAmount = ethers.parseEther("1");
  const cooldown = 3600;

  // Get the MultiTokenFaucet contract factory
  const MultiTokenFaucet = await ethers.getContractFactory("MultiTokenFaucet");
  console.log("Deploying MultiTokenFaucet contract...");

  // Deploy the contract with the specified parameters (maxTokenAmount is now set per token via setMaxTokenAmount)
  const faucetContract = await MultiTokenFaucet.deploy(faucetAmount, cooldown);
  await faucetContract.waitForDeployment();
  deployedAddresses.contracts.faucet = await faucetContract.getAddress();
  console.log("MultiTokenFaucet deployed to:", await faucetContract.getAddress());


  // WBTC, WETH, POL, TRUMP, USDC(quote)
  const tokens = {
    WBTC: {
      name: "WBTC",
      symbol: "WBTC",
      amount: BigInt(21000000),
      decimals: 8,
      address: "",
    },
    WETH: {
      name: "WETH",
      symbol: "WETH",
      amount: BigInt(10000000),
      decimals: 18,
      address: "",
    },
    POL: {
      name: "POL",
      symbol: "POL",
      amount: BigInt(1000000000),
      decimals: 18,
      address: "",
    },
    TRUMP: {
      name: "TRUMP",
      symbol: "TRUMP",
      amount: BigInt(1000000000000),
      decimals: 18,
      address: "",
    },
    USDC: {
      name: "USDC",
      symbol: "USDC",
      amount: BigInt(1000000000000),
      decimals: 6,
      address: "",
    },
  };

  for (const token of Object.values(tokens)) {
    const BaseTokenFactory = await ethers.getContractFactory("MockERC20");
    const baseToken = await BaseTokenFactory.connect(deployer).deploy(
      token.name,
      token.symbol,
      token.amount * BigInt(10) ** BigInt(token.decimals),
      token.decimals
    );
    await baseToken.waitForDeployment();
    console.log(`${token.symbol} deployed to:`, await baseToken.getAddress());
    const tokenHalfAmount = ethers.parseUnits(token.amount.toString(), token.decimals) / BigInt(2);
    const txFaucet = await faucetContract.setMaxTokenAmount(baseToken.getAddress(), tokenHalfAmount);
    await txFaucet.wait();
    console.log(`Set faucet maxTokenAmount for ${token.symbol} to ${tokenHalfAmount} tokens`);

    const txFaucetApprove = await baseToken.approve(await faucetContract.getAddress(), tokenHalfAmount);
    await txFaucetApprove.wait();
    console.log(`approved ${tokenHalfAmount} ${token.symbol} to faucet ${await faucetContract.getAddress()}`);

    const txFaucetSend = await baseToken.transfer(await faucetContract.getAddress(), tokenHalfAmount);
    await txFaucetSend.wait();
    console.log(`sent ${tokenHalfAmount} ${token.symbol} to faucet ${await faucetContract.getAddress()}`);

    deployedAddresses.contracts.tokens[token.symbol] =
      await baseToken.getAddress();

    token.address = await baseToken.getAddress();
  }

  const MatchingEngineFactory = await ethers.getContractFactory(
    "MatchingEngine"
  );
  const matchingEngine = await MatchingEngineFactory.connect(deployer).deploy(
    0,
    0
  );
  await matchingEngine.waitForDeployment();
  deployedAddresses.contracts.trading.matchingEngine =
    await matchingEngine.getAddress();
  console.log("MatchingEngine deployed to:", await matchingEngine.getAddress());

  const TradingVaultFactory = await ethers.getContractFactory("TradingVault");
  const tradingVault = await TradingVaultFactory.connect(deployer).deploy(
    await matchingEngine.getAddress()
  );
  await tradingVault.waitForDeployment();
  deployedAddresses.contracts.trading.tradingVault =
    await tradingVault.getAddress();
  console.log("TradingVault deployed to:", await tradingVault.getAddress());

  const setVaultTx = await matchingEngine
    .connect(deployer)
    .setVaultAddress(await tradingVault.getAddress());
  await setVaultTx.wait();
  console.log(
    "MatchingEngine set TradingVault address to:",
    await tradingVault.getAddress()
  );
  // トークンペアを追加
  for (const token of Object.values(tokens)) {
    if (token.symbol === "USDC") continue;
    const addPairTx = await matchingEngine
      .connect(deployer)
      .addPair(token.address, tokens.USDC.address);
    await addPairTx.wait();
    console.log(
      `Pair 
    ${token.symbol} (${token.address}) / ${tokens.USDC.symbol} (${tokens.USDC.address}) 
    added to MatchingEngine`
    );
  }

  // デプロイ情報をJSONファイルに保存
  const deploymentPath = path.join(
    __dirname,
    "../../deployments",
    hre.network.name
  );
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }

  const filename = `deployment-${deployedAddresses.network}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentPath, filename),
    JSON.stringify(deployedAddresses, null, 2)
  );
  console.log(`Deployment addresses saved to: ${filename}`);

  // 追加：frontend/env.json に最新の契約アドレス情報を書き込み
  const envData = {
    NEXT_PUBLIC_ENABLE_TESTNETS: "true",
    NEXT_PUBLIC_MATCHING_ENGINE_ADDRESS: deployedAddresses.contracts.trading.matchingEngine,
    NEXT_PUBLIC_VAULT_ADDRESS: deployedAddresses.contracts.trading.tradingVault,
    NEXT_PUBLIC_FAUCET_ADDRESS: deployedAddresses.contracts.faucet,
    NEXT_PUBLIC_WBTC_ADDRESS: deployedAddresses.contracts.tokens.WBTC,
    NEXT_PUBLIC_WETH_ADDRESS: deployedAddresses.contracts.tokens.WETH,
    NEXT_PUBLIC_POL_ADDRESS: deployedAddresses.contracts.tokens.POL,
    NEXT_PUBLIC_TRUMP_ADDRESS: deployedAddresses.contracts.tokens.TRUMP,
    NEXT_PUBLIC_USDC_ADDRESS: deployedAddresses.contracts.tokens.USDC
  };

  const frontendEnvPath = path.join(__dirname, "../../frontend/env.json");
  let existingEnv = {};
  if (fs.existsSync(frontendEnvPath)) {
    existingEnv = JSON.parse(fs.readFileSync(frontendEnvPath, "utf8"));
  }
  const updatedEnv = {
    ...existingEnv,
    NEXT_PUBLIC_MATCHING_ENGINE_ADDRESS: deployedAddresses.contracts.trading.matchingEngine,
    NEXT_PUBLIC_VAULT_ADDRESS: deployedAddresses.contracts.trading.tradingVault,
    NEXT_PUBLIC_FAUCET_ADDRESS: deployedAddresses.contracts.faucet,
    NEXT_PUBLIC_WBTC_ADDRESS: deployedAddresses.contracts.tokens.WBTC,
    NEXT_PUBLIC_WETH_ADDRESS: deployedAddresses.contracts.tokens.WETH,
    NEXT_PUBLIC_POL_ADDRESS: deployedAddresses.contracts.tokens.POL,
    NEXT_PUBLIC_TRUMP_ADDRESS: deployedAddresses.contracts.tokens.TRUMP,
    NEXT_PUBLIC_USDC_ADDRESS: deployedAddresses.contracts.tokens.USDC
  };
  fs.writeFileSync(frontendEnvPath, JSON.stringify(updatedEnv, null, 2));
  console.log(`Frontend environment file saved to: ${frontendEnvPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
