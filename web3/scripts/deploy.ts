import { ethers } from "hardhat";
const main = async () => {
  const [deployer] = await ethers.getSigners();
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log("Current block number:", blockNumber);
  console.log("Deploying contracts with the account:", deployer.address);
  const BaseTokenFactory = await ethers.getContractFactory("MockERC20");
  const baseToken = await BaseTokenFactory.connect(deployer).deploy(
    "Base Token",
    "BASE",
    1000000
  );
  await baseToken.waitForDeployment();
  console.log("Base Token deployed to:", await baseToken.getAddress());

  const QuoteTokenFactory = await ethers.getContractFactory("MockERC20");
  const quoteToken = await QuoteTokenFactory.connect(deployer).deploy(
    "Quote Token",
    "QUOTE",
    1000000
  );
  await quoteToken.waitForDeployment();
  console.log("Quote Token deployed to:", await quoteToken.getAddress());

  const MatchingEngineFactory = await ethers.getContractFactory(
    "MatchingEngine"
  );
  const matchingEngine = await MatchingEngineFactory.connect(deployer).deploy(
    0,
    0
  );
  await matchingEngine.waitForDeployment();
  console.log("MatchingEngine deployed to:", await matchingEngine.getAddress());
  const TradingVaultFactory = await ethers.getContractFactory("TradingVault");
  const tradingVault = await TradingVaultFactory.connect(deployer).deploy(
    await matchingEngine.getAddress()
  );
  await tradingVault.waitForDeployment();
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
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
