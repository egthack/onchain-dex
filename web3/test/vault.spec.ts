import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20 } from "../typechain-types";
import { Vault } from "../typechain-types";
import { Signer } from "ethers";

describe("Vault", function () {
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let tokenContract: MockERC20;
  let vaultContract: Vault;

  const deployFixture = async () => {
    const [deployer, user1, user2] = await ethers.getSigners();
    owner = deployer;
    addr1 = user1;
    addr2 = user2;

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    tokenContract = await TokenFactory.connect(owner).deploy(
      "Mock Token",
      "MTK",
      1000000
    );
    await tokenContract.waitForDeployment();
    await tokenContract.connect(owner).transfer(await addr1.getAddress(), 1000);

    const VaultFactory = await ethers.getContractFactory("Vault");
    vaultContract = await VaultFactory.connect(owner).deploy();
    await vaultContract.waitForDeployment();

    return { owner, addr1, addr2, tokenContract, vaultContract };
  };

  describe("Deposit", function () {
    it("should deposit tokens and update balance", async function () {
      ({ tokenContract, vaultContract, addr1 } = await deployFixture());
      // Allow the vault contract to transfer tokens on behalf of addr1
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 100);
      // Deposit 100 tokens to the Spot vault (VaultType.Spot is represented by 0)
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100, 0);

      const balance = await vaultContract.getSpotBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(balance).to.equal(100);
    });

    it("should revert if deposit amount is 0", async function () {
      ({ tokenContract, vaultContract, addr1 } = await deployFixture());
      await expect(
        vaultContract.connect(addr1).deposit(tokenContract.getAddress(), 0, 0)
      ).to.be.revertedWith("Deposit: amount must be > 0");
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      ({ tokenContract, vaultContract, addr1 } = await deployFixture());
      // Allow the vault contract to transfer tokens on behalf of addr1 and deposit tokens into Spot vault
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 100);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100, 0);
    });

    it("should withdraw tokens and update balance", async function () {
      await vaultContract
        .connect(addr1)
        .withdraw(tokenContract.getAddress(), 50, 0);
      const balance = await vaultContract.getSpotBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(balance).to.equal(50);
    });

    it("should revert if withdraw amount exceeds balance", async function () {
      await expect(
        vaultContract
          .connect(addr1)
          .withdraw(tokenContract.getAddress(), 200, 0)
      ).to.be.revertedWith("Withdraw: insufficient spot balance");
    });

    it("should revert if withdraw amount is 0", async function () {
      await expect(
        vaultContract.connect(addr1).withdraw(tokenContract.getAddress(), 0, 0)
      ).to.be.revertedWith("Withdraw: amount must be > 0");
    });
  });

  describe("Internal Transfer", function () {
    beforeEach(async function () {
      ({ tokenContract, vaultContract, addr1 } = await deployFixture());
      // Allow the vault contract to transfer tokens on behalf of addr1 and deposit tokens into Spot vault
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 100);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100, 0);
    });

    it("should transfer tokens internally from Spot to Perp and update both balances", async function () {
      // Transfer 50 tokens from Spot (0) to Perp (1)
      await vaultContract
        .connect(addr1)
        .transferBetweenVaults(tokenContract.getAddress(), 50, 0, 1);

      const spotBalance = await vaultContract.getSpotBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      const perpBalance = await vaultContract.getPerpBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(spotBalance).to.equal(50);
      expect(perpBalance).to.equal(50);
    });

    it("should revert if transfer amount exceeds balance", async function () {
      await expect(
        vaultContract
          .connect(addr1)
          .transferBetweenVaults(tokenContract.getAddress(), 200, 0, 1)
      ).to.be.revertedWith("Transfer: insufficient spot balance");
    });

    it("should revert if transfer amount is 0", async function () {
      await expect(
        vaultContract
          .connect(addr1)
          .transferBetweenVaults(tokenContract.getAddress(), 0, 0, 1)
      ).to.be.revertedWith("Transfer: amount must be > 0");
    });
  });

  describe("Get Balance", function () {
    beforeEach(async function () {
      ({ tokenContract, vaultContract, addr1 } = await deployFixture());
      // Allow the vault contract to transfer tokens on behalf of addr1 and deposit tokens into Spot vault
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 100);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100, 0);
    });

    it("should return the correct Spot vault balance", async function () {
      const balance = await vaultContract.getSpotBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(balance).to.equal(100);
    });

    it("should return Perp vault balance as 0 initially", async function () {
      const balance = await vaultContract.getPerpBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(balance).to.equal(0);
    });
  });
});
