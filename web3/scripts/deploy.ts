import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import * as hre from "hardhat";

const main = async () => {
  const [deployer] = await ethers.getSigners();
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log("Current block number:", blockNumber);
  console.log("Deploying contracts with the account:", deployer.address);

  const deployedAddresses = {
    network: hre.network.name,
    blockNumber: blockNumber,
    deployer: deployer.address,
    contracts: {} as Record<string, string>,
  };

  const BaseTokenFactory = await ethers.getContractFactory("MockERC20");
  const baseToken = await BaseTokenFactory.connect(deployer).deploy(
    "Base Token",
    "BASE",
    1000000
  );
  await baseToken.waitForDeployment();
  deployedAddresses.contracts.baseToken = await baseToken.getAddress();
  console.log("Base Token deployed to:", await baseToken.getAddress());

  const QuoteTokenFactory = await ethers.getContractFactory("MockERC20");
  const quoteToken = await QuoteTokenFactory.connect(deployer).deploy(
    "Quote Token",
    "QUOTE",
    1000000
  );
  await quoteToken.waitForDeployment();
  deployedAddresses.contracts.quoteToken = await quoteToken.getAddress();
  console.log("Quote Token deployed to:", await quoteToken.getAddress());

  const MatchingEngineFactory = await ethers.getContractFactory(
    "MatchingEngine"
  );
  const matchingEngine = await MatchingEngineFactory.connect(deployer).deploy(
    0,
    0
  );
  await matchingEngine.waitForDeployment();
  deployedAddresses.contracts.matchingEngine =
    await matchingEngine.getAddress();
  console.log("MatchingEngine deployed to:", await matchingEngine.getAddress());

  const TradingVaultFactory = await ethers.getContractFactory("TradingVault");
  const tradingVault = await TradingVaultFactory.connect(deployer).deploy(
    await matchingEngine.getAddress()
  );
  await tradingVault.waitForDeployment();
  deployedAddresses.contracts.tradingVault = await tradingVault.getAddress();
  console.log("TradingVault deployed to:", await tradingVault.getAddress());

  await matchingEngine
    .connect(deployer)
    .setVaultAddress(await tradingVault.getAddress());
  console.log(
    "MatchingEngine set TradingVault address to:",
    await tradingVault.getAddress()
  );
  await matchingEngine
    .connect(deployer)
    .addPair(
      await baseToken.getAddress(),
      await quoteToken.getAddress(),
      18,
      18
    );
  console.log(
    `Pair 
    ${await baseToken.symbol()} (${await baseToken.getAddress()}) / ${await quoteToken.symbol()} (${await quoteToken.getAddress()}) 
    added to MatchingEngine`
  );

  // デプロイ情報をJSONファイルに保存
  const deploymentPath = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath);
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
