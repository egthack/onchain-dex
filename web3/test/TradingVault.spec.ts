import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, TradingVault, MatchingEngine } from "../typechain-types";
import { getBytes, Signer } from "ethers";

describe("TradingVault", function () {
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let tokenContract: MockERC20;
  let vaultContract: TradingVault;
  let engineContract: MatchingEngine;

  // Fixture: deploy mock token, MatchingEngine as engine, and TradingVault using engine address.
  const deployFixture = async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    addr1 = signers[1];
    addr2 = signers[2];

    // Deploy MockERC20
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    tokenContract = await TokenFactory.connect(owner).deploy(
      "Mock Token",
      "MTK",
      1000000
    );
    await tokenContract.waitForDeployment();
    // Transfer tokens to addr1
    await tokenContract.connect(owner).transfer(await addr1.getAddress(), 1000);

    // Deploy MatchingEngine as engine (makerFeeRate = 10, takerFeeRate = 15)
    const EngineFactory = await ethers.getContractFactory("MatchingEngine");
    engineContract = await EngineFactory.connect(owner).deploy(10, 15);
    await engineContract.waitForDeployment();
    // 管理者により、取引ペア(tokenIn, tokenOut) を追加
    // ※ここでは便宜的に tokenContract.getAddress() を両方に採用
    await engineContract
      .connect(owner)
      .addPair(tokenContract.getAddress(), tokenContract.getAddress(), 18, 18);

    // Deploy TradingVault with engine address
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vaultContract = await VaultFactory.connect(owner).deploy(
      engineContract.getAddress()
    );
    await vaultContract.waitForDeployment();

    return {
      owner,
      addr1,
      addr2,
      tokenContract,
      vaultContract,
      engineContract,
    };
  };

  describe("Deposit", function () {
    it("should allow depositing tokens", async function () {
      const { tokenContract, vaultContract, addr1 } = await deployFixture();
      // Approve token transfer for addr1
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
      // 0トークンの引き出しは問題なく動作する（no-op）
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
      // addr1 sets trader approval for addr2 (approved=true, maxOrderSize=100, expiry=9999)
      await vaultContract
        .connect(addr1)
        .setTraderApproval(await addr2.getAddress(), true, 100, 9999);
      const approval = await vaultContract.traderApprovals(
        await addr1.getAddress(),
        await addr2.getAddress()
      );
      expect(approval.approved).to.be.true;
      expect(approval.maxOrderSize).to.equal(100);
      expect(approval.expiry).to.equal(9999);
    });
  });

  describe("Trade Request", function () {
    it("should execute a trade request", async function () {
      const { vaultContract, tokenContract, addr1, addr2 } =
        await deployFixture();

      // Deposit tokens by addr1
      await tokenContract
        .connect(addr1)
        .approve(vaultContract.getAddress(), 200);
      await vaultContract
        .connect(addr1)
        .deposit(tokenContract.getAddress(), 100);

      // addr1 が addr2 に対して、十分な注文可能額と有効期限で承認を設定
      await vaultContract
        .connect(addr1)
        .setTraderApproval(await addr2.getAddress(), true, 100, 9999999999);

      // Create trade request (if preApprovalId is nonzero, treat as a Buy order)
      const preApprovalId = ethers.encodeBytes32String("approved");

      // Compute the message hash using the same method as VaultLib
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "uint256", "bytes32"],
        [
          await addr1.getAddress(),
          tokenContract.getAddress(),
          tokenContract.getAddress(),
          100,
          0,
          preApprovalId,
        ]
      );
      // Arrayify the message hash for signMessage
      const signature = await addr1.signMessage(getBytes(messageHash));

      const tradeRequest = {
        user: await addr1.getAddress(),
        tokenIn: tokenContract.getAddress(),
        tokenOut: tokenContract.getAddress(),
        amountIn: 100,
        minAmountOut: 0,
        preApprovalId: preApprovalId,
        side: 0, // 0: Buy, 1: Sell
        signature: signature,
      };

      // Execute trade batch (internally calls MatchingEngine.placeOrder)
      await vaultContract.connect(addr2).executeTradeBatch([tradeRequest]);

      // Inside _executeSingleTrade, subtract 100 from balances[req.user][tokenIn] and add the output from engine.placeOrder (orderId 0)
      const finalBalance = await vaultContract.getBalance(
        await addr1.getAddress(),
        tokenContract.getAddress()
      );
      expect(finalBalance).to.equal(0);
    });
  });
});
