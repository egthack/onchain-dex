import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import * as hre from "hardhat";
import { MockERC20 } from "../typechain-types";

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
    },
  };

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
    deployedAddresses.contracts.tokens[token.symbol] =
      await baseToken.getAddress();
    console.log(`${token.symbol} deployed to:`, await baseToken.getAddress());
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
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
