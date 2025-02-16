import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, TradingVault } from "../typechain-types";
import { Signer } from "ethers";

describe("TradingVault", function () {
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let tokenContract: MockERC20;
  let vaultContract: TradingVault;

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

    const DexFactory = await ethers.getContractFactory("DEX");
    const dexContract = await DexFactory.connect(owner).deploy();
    await dexContract.waitForDeployment();

    const TradingVaultFactory = await ethers.getContractFactory("TradingVault");
    vaultContract = await TradingVaultFactory.connect(owner).deploy(
      dexContract.getAddress()
    );
    await vaultContract.waitForDeployment();

    return { owner, addr1, addr2, tokenContract, vaultContract };
  };

  describe("Deposit", function () {
    it("should allow depositing tokens", async function () {
      const { tokenContract, vaultContract, addr1 } = await deployFixture();
      // addr1 によるトークン移動を可能にするため approve
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 200);
      // deposit(token, amount) を実行
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100);
      const balance = await vaultContract.getBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(balance).to.equal(100);
    });

    it("should revert deposit if amount is zero", async function () {
      const { tokenContract, vaultContract, addr1 } = await deployFixture();
      await expect(
        vaultContract.connect(addr1).deposit(tokenContract.getAddress(), 0)
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      const fixture = await deployFixture();
      ({ tokenContract, vaultContract, addr1 } = fixture);
      // まず deposit しておく
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 200);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100);
    });

    it("should allow withdrawal of tokens", async function () {
      await vaultContract
        .connect(addr1)
        .withdraw(tokenContract.getAddress(), 50);
      const balance = await vaultContract.getBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(balance).to.equal(50);
    });

    it("should revert withdrawal if amount exceeds balance", async function () {
      await expect(
        vaultContract.connect(addr1).withdraw(tokenContract.getAddress(), 150)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("should allow withdrawal of zero tokens without change", async function () {
      const beforeBalance = await vaultContract.getBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      // withdrawing 0 tokens should work (or be a no-op) since no explicit check is present
      await vaultContract
        .connect(addr1)
        .withdraw(tokenContract.getAddress(), 0);
      const afterBalance = await vaultContract.getBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(afterBalance).to.equal(beforeBalance);
    });
  });

  describe("Get Balance", function () {
    beforeEach(async function () {
      const fixture = await deployFixture();
      ({ tokenContract, vaultContract, addr1 } = fixture);
      // Deposit tokens
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 200);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100);
    });

    it("should return the correct balance", async function () {
      const balance = await vaultContract.getBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(balance).to.equal(100);
    });
  });

  describe("Trader Approval", function () {
    it("should allow setting trader approval", async function () {
      const { vaultContract, addr1, addr2 } = await deployFixture();
      // addr1 sets approval for addr2; parameters example: approved = true, maxOrderSize = 100, expiry = 9999
      await vaultContract
        .connect(addr1)
        .setTraderApproval(await addr2.getAddress(), true, 100, 9999);
      const traderApproval = await vaultContract.traderApprovals(
        await addr1.getAddress(),
        await addr2.getAddress()
      );
      expect(traderApproval.approved).to.be.true;
      expect(traderApproval.maxOrderSize).to.equal(100);
      expect(traderApproval.expiry).to.equal(9999);
    });
  });
});
