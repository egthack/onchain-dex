import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20 } from "../typechain-types";
import { Vault } from "../typechain-types";
import { Signer } from "ethers";

describe("Vault", async function () {
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let tokenContract: MockERC20;
  let vaultContract: Vault;

  const deployFixture = async () => {
    const [owner, addr1, addr2] = await ethers.getSigners();
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    const tokenContract = await TokenFactory.connect(owner).deploy(
      "Mock Token",
      "MTK",
      1000000
    );
    await tokenContract.waitForDeployment();
    await tokenContract.connect(owner).transfer(addr1.address, 1000);

    const VaultFactory = await ethers.getContractFactory("Vault");
    const vaultContract = await VaultFactory.connect(owner).deploy();
    await vaultContract.waitForDeployment();

    return { owner, addr1, addr2, tokenContract, vaultContract };
  };

  describe("Deposit", function () {
    it("Should deposit tokens and update balance", async function () {
      ({ tokenContract, vaultContract, addr1 } = await deployFixture());
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 100);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100);

      expect(
        await vaultContract.getBalance(
          addr1.getAddress(),
          tokenContract.getAddress()
        )
      ).to.equal(100);
    });

    it("Should revert if deposit amount is 0", async function () {
      ({ tokenContract, vaultContract, addr1 } = await deployFixture());
      await expect(
        vaultContract.connect(addr1).deposit(tokenContract.getAddress(), 0)
      ).to.be.revertedWith("Deposit: amount must be > 0");
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      ({ tokenContract, vaultContract, addr1 } = await deployFixture());
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 100);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100);
    });

    it("Should withdraw tokens and update balance", async function () {
      await vaultContract
        .connect(addr1)
        .withdraw(tokenContract.getAddress(), 50);
      expect(
        await vaultContract.getBalance(
          addr1.getAddress(),
          tokenContract.getAddress()
        )
      ).to.equal(50);
    });

    it("Should revert if withdraw amount exceeds balance", async function () {
      await expect(
        vaultContract.connect(addr1).withdraw(tokenContract.getAddress(), 200)
      ).to.be.revertedWith("Withdraw: insufficient balance");
    });

    it("Should revert if withdraw amount is 0", async function () {
      await expect(
        vaultContract.connect(addr1).withdraw(tokenContract.getAddress(), 0)
      ).to.be.revertedWith("Withdraw: amount must be > 0");
    });
  });

  describe("Internal Transfer", function () {
    beforeEach(async function () {
      ({ tokenContract, vaultContract, owner, addr1, addr2 } =
        await deployFixture());
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 100);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100);
    });

    it("Should transfer tokens internally and update balances", async function () {
      await vaultContract
        .connect(owner)
        .internalTransfer(
          addr1.getAddress(),
          addr2.getAddress(),
          tokenContract.getAddress(),
          50
        );
      expect(
        await vaultContract.getBalance(
          addr1.getAddress(),
          tokenContract.getAddress()
        )
      ).to.equal(50);
      expect(
        await vaultContract.getBalance(
          addr2.getAddress(),
          tokenContract.getAddress()
        )
      ).to.equal(50);
    });

    it("Should revert if transfer amount exceeds balance", async function () {
      const { tokenContract, vaultContract, owner, addr1, addr2 } =
        await deployFixture();
      await expect(
        vaultContract
          .connect(owner)
          .internalTransfer(
            addr1.getAddress(),
            addr2.getAddress(),
            tokenContract.getAddress(),
            200
          )
      ).to.be.revertedWith("InternalTransfer: insufficient balance");
    });

    it("Should revert if transfer amount is 0", async function () {
      const { tokenContract, vaultContract, owner, addr1, addr2 } =
        await deployFixture();
      await expect(
        vaultContract
          .connect(owner)
          .internalTransfer(
            addr1.address,
            addr2.address,
            tokenContract.getAddress(),
            0
          )
      ).to.be.revertedWith("InternalTransfer: amount must be > 0");
    });
  });

  describe("Get Balance", function () {
    beforeEach(async function () {
      ({ tokenContract, vaultContract, addr1 } = await deployFixture());
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 100);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100);
    });

    it("Should return the correct balance", async function () {
      const balance = await vaultContract.getBalance(
        addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(balance).to.equal(100);
    });
  });
});
