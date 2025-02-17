import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, TradingVault, MatchingEngine } from "../typechain-types";
import { Signer } from "ethers";

describe("TradingVault", function () {
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let token: MockERC20;
  let vault: TradingVault;
  let engine: MatchingEngine;


  const deployFixture = async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    addr1 = signers[1];
    addr2 = signers[2];

    // Deploy MockERC20 token
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    token = await TokenFactory.connect(owner).deploy("Mock Token", "MTK", 1000000);
    await token.waitForDeployment();

    // Transfer some tokens to addr1 for deposit tests
    await token.connect(owner).transfer(await addr1.getAddress(), 1000);

    // Deploy MatchingEngine with fee rates (makerFeeRate = 10, takerFeeRate = 15)
    const EngineFactory = await ethers.getContractFactory("MatchingEngine");
    engine = await EngineFactory.connect(owner).deploy(10, 15);
    await engine.waitForDeployment();

    // Add a trading pair into the MatchingEngine.
    // ここでは、tokenIn と tokenOut の両方に同じ token.address を指定する
    await engine.connect(owner).addPair(token.getAddress(), token.getAddress(), 18, 18);

    // Deploy TradingVault with the engine address
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vault = await VaultFactory.connect(owner).deploy(await engine.getAddress());
    await vault.waitForDeployment();

    return { owner, addr1, addr2, token, vault, engine };
  };

  beforeEach(async function () {
    await deployFixture();
  });

  describe("Deposit", function () {
    it("should allow deposits", async function () {
      // addr1 承認後、100 トークンを deposit する
      await token.connect(addr1).approve(await vault.getAddress(), 200);
      await vault.connect(addr1).deposit(token.getAddress(), 100);
      const balance = await vault.getBalance(await addr1.getAddress(), token.getAddress());
      expect(balance).to.equal(100);
    });

    it("should revert deposit if amount is zero", async function () {
      await expect(
        vault.connect(addr1).deposit(token.getAddress(), 0)
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      await token.connect(addr1).approve(await vault.getAddress(), 200);
      await vault.connect(addr1).deposit(token.getAddress(), 100);
    });

    it("should allow withdrawal of tokens", async function () {
      await vault.connect(addr1).withdraw(token.getAddress(), 50);
      const balance = await vault.getBalance(await addr1.getAddress(), token.getAddress());
      expect(balance).to.equal(50);
    });

    it("should revert withdrawal when amount exceeds balance", async function () {
      await expect(
        vault.connect(addr1).withdraw(token.getAddress(), 150)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("should allow withdrawal of zero tokens without changes", async function () {
      const before = await vault.getBalance(await addr1.getAddress(), token.getAddress());
      await vault.connect(addr1).withdraw(token.getAddress(), 0);
      const after = await vault.getBalance(await addr1.getAddress(), token.getAddress());
      expect(after).to.equal(before);
    });
  });

  describe("Trader Approval", function () {
    it("should allow setting trader approval", async function () {
      // addr1 が addr2 に対して、承認 (approved=true, maxOrderSize=100, expiry=9999) を設定
      await vault.connect(addr1).setTraderApproval(await addr2.getAddress(), true, 100, 9999);
      const approval = await vault.traderApprovals(
        await addr1.getAddress(),
        await addr2.getAddress()
      );
      expect(approval.approved).to.be.true;
      expect(approval.maxOrderSize).to.equal(100);
      expect(approval.expiry).to.equal(9999);
    });
  });

  describe("Trade Request", function () {
    // VaultLib の内部チェック等を前提として、トレードリクエストの実行をテスト
    it("should execute a trade request", async function () {
      // addr1 が 100 トークンを deposit する
      await token.connect(addr1).approve(await vault.getAddress(), 200);
      await vault.connect(addr1).deposit(token.getAddress(), 100);

      // addr1 が addr2 に対して承認を設定（委任取引者としての addr2）
      await vault.connect(addr1).setTraderApproval(await addr2.getAddress(), true, 100, 9999999999);

      // 取引リクエスト作成：今回は Buy 注文 (side = 0)
      const preApprovalId = ethers.getBytes("approved");
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "uint256", "bytes32"],
        [
          await addr1.getAddress(),
          token.getAddress(),
          token.getAddress(),
          100,  // amountIn
          0,    // minAmountOut
          preApprovalId,
        ]
      );
      const signature = await addr1.signMessage(ethers.getBytes(messageHash));

      const tradeRequest = {
        user: await addr1.getAddress(),
        tokenIn: token.getAddress(),
        tokenOut: token.getAddress(),
        amountIn: 100,
        minAmountOut: 0,
        preApprovalId: preApprovalId,
        side: 0, // Buy order
        signature: signature,
      };

      // addr2 がバッチ取引として実行
      await vault.connect(addr2).executeTradeBatch([tradeRequest]);
      // _executeSingleTrade 内で 100 トークンが Vault から引かれるため、最終的な残高は 0 となる
      const finalBalance = await vault.getBalance(await addr1.getAddress(), token.getAddress());
      expect(finalBalance).to.equal(0);
    });
  });

  describe("Cancel Order", function () {
    it("should cancel an active order and refund remaining funds", async function () {
      // addr1 が 100 トークンを deposit する
      await token.connect(addr1).approve(await vault.getAddress(), 200);
      await vault.connect(addr1).deposit(token.getAddress(), 100);

      // addr1 が addr2 に対して承認を設定
      await vault.connect(addr1).setTraderApproval(await addr2.getAddress(), true, 100, 9999999999);

      // 取引リクエスト作成 (side = 0: Buy)
      const preApprovalId = ethers.getBytes("approved");
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "uint256", "bytes32"],
        [
          await addr1.getAddress(),
          token.getAddress(),
          token.getAddress(),
          100,
          0,
          preApprovalId,
        ]
      );
      const signature = await addr1.signMessage(ethers.getBytes(messageHash));

      const tradeRequest = {
        user: await addr1.getAddress(),
        tokenIn: token.getAddress(),
        tokenOut: token.getAddress(),
        amountIn: 100,
        minAmountOut: 0,
        preApprovalId: preApprovalId,
        side: 0,
        signature: signature,
      };

      // addr2 が executeTradeBatch を実行 => MatchingEngine に注文が作成され、addr1 の Vault から 100 トークンが引かれる
      await vault.connect(addr2).executeTradeBatch([tradeRequest]);
      // この時点で、MatchingEngine の注文 ID は 0 から開始すると仮定
      const orderId = 0;

      // addr1 が注文キャンセルを実行（所有者のみキャンセル可能）
      await vault.connect(addr1).cancelOrder(orderId);

      // キャンセル処理時、注文にロックされていた未約定の数量が Vault に返金される（テストでは 100 トークンが返金）
      const balanceAfter = await vault.getBalance(await addr1.getAddress(), token.getAddress());
      expect(balanceAfter).to.equal(100);

      // MatchingEngine 側の注文はキャンセル済みとなっているはず
      const orderData = await engine.getOrder(orderId);
      expect(orderData.active).to.equal(false);
    });
  });
});
