import { ethers } from "hardhat";

const main = async () => {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const VaultFactory = await ethers.deployContract("Vault");
  await VaultFactory.waitForDeployment();
  console.log("Vault deployed to:", await VaultFactory.getAddress());

  const TokenFactory = await ethers.deployContract("MockERC20", [
    "Mock Token",
    "MTK",
    1000000,
  ]);

  await TokenFactory.waitForDeployment();
  console.log("Token deployed to:", await TokenFactory.getAddress());

  const DEXFactory = await ethers.deployContract("DEX");
  await DEXFactory.waitForDeployment();
  console.log("DEX deployed to:", await DEXFactory.getAddress());
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
