import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, TradingVault, MatchingEngine } from "../typechain-types";
import { Signer } from "ethers";
import { createTradeRequest } from "./helpers/tradeHelper";

export interface TradeRequest {
  user: string;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  price: number;
  side: number;
  signature: string;
} 

describe("TradingVault", function () {
  let owner: Signer;
  let user: Signer;
  let trader: Signer;
  let tokenA: MockERC20;
  let tokenB: MockERC20;
  let vault: TradingVault;
  let engine: MatchingEngine;


  const deployFixture = async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    user = signers[1];
    trader = signers[2];

    // Deploy MockERC20 token
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    tokenA = await TokenFactory.connect(owner).deploy("Mock Token A", "MTKA", 1000000);
    await tokenA.waitForDeployment();
    tokenB = await TokenFactory.connect(owner).deploy("Mock Token B", "MTKB", 1000000);
    await tokenB.waitForDeployment();

    // Transfer some tokens to user for deposit tests
    await tokenA.connect(owner).transfer(await user.getAddress(), 1000);
    await tokenB.connect(owner).transfer(await user.getAddress(), 1000);

    // Deploy MatchingEngine with fee rates (makerFeeRate = 10, takerFeeRate = 15)
    const EngineFactory = await ethers.getContractFactory("MatchingEngine");
    engine = await EngineFactory.connect(owner).deploy(10, 15);
    await engine.waitForDeployment();

    // Add a trading pair into the MatchingEngine.
    // ここでは、tokenIn と tokenOut の両方に同じ token.address を指定する
    await engine.connect(owner).addPair(tokenA.getAddress(), tokenB.getAddress(), 18, 18);

    // Deploy TradingVault with the engine address
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vault = await VaultFactory.connect(owner).deploy(await engine.getAddress());
    await vault.waitForDeployment();

    await engine.connect(owner).setVaultAddress(await vault.getAddress());

    return { owner, user, trader, tokenA, tokenB, vault, engine };
  };

  beforeEach(async function () {
    await deployFixture();
  });

  describe("Deposit", function () {
    it("should allow deposits", async function () {
      // user 承認後、100 トークンを deposit する
      await tokenA.connect(user).approve(await vault.getAddress(), 200);
      await vault.connect(user).deposit(tokenA.getAddress(), 100);
      const balance = await vault.getBalance(await user.getAddress(), tokenA.getAddress());
      expect(balance).to.equal(100);
    });

    it("should revert deposit if amount is zero", async function () {
      await expect(
        vault.connect(user).deposit(tokenA.getAddress(), 0)
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      await tokenA.connect(user).approve(await vault.getAddress(), 200);
      await vault.connect(user).deposit(tokenA.getAddress(), 100);
    });

    it("should allow withdrawal of tokens", async function () {
      await vault.connect(user).withdraw(tokenA.getAddress(), 50);
      const balance = await vault.getBalance(await user.getAddress(), tokenA.getAddress());
      expect(balance).to.equal(50);
    });

    it("should revert withdrawal when amount exceeds balance", async function () {
      await expect(
        vault.connect(user).withdraw(tokenA.getAddress(), 150)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("should allow withdrawal of zero tokens without changes", async function () {
      const before = await vault.getBalance(await user.getAddress(), tokenA.getAddress());
      await vault.connect(user).withdraw(tokenA.getAddress(), 0);
      const after = await vault.getBalance(await user.getAddress(), tokenA.getAddress());
      expect(after).to.equal(before);
    });
  });



  describe("Trade Request", function () {
    // VaultLib の内部チェック等を前提として、トレードリクエストの実行をテスト
    it("should execute a trade request", async function () {
      // user が 100 トークンを deposit する
      await tokenA.connect(user).approve(await vault.getAddress(), 200);
      await vault.connect(user).deposit(tokenA.getAddress(), 100);

      // 取引リクエスト作成：今回は Buy 注文 (side = 0)
      const tradeRequest = await createTradeRequest({
        user: user,
        tokenIn: tokenA,
        tokenOut: tokenB,
        side: 0,
        amount: 100,
        price: 1
      });
      // trader が executeTradeBatch を実行 => MatchingEngine に注文が作成され、user の Vault から 100 トークンが引かれる
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      // _executeSingleTrade 内で 100 トークンが Vault から引かれるため、最終的な残高は 0 となる
      const finalBalance = await vault.getBalance(await user.getAddress(), tokenA.getAddress());
      expect(finalBalance).to.equal(0);
    });
  });

  describe("Cancel Order", function () {
    it("should cancel an active order and refund remaining funds", async function () {
      // user が 100 トークンを deposit する
      await tokenA.connect(user).approve(await vault.getAddress(), 200);
      await vault.connect(user).deposit(tokenA.getAddress(), 100);

      // 取引リクエスト作成：今回は Buy 注文 (side = 0)
      const tradeRequest = await createTradeRequest({
        user: user,
        tokenIn: tokenA,
        tokenOut: tokenB,
        side: 0,
        amount: 100,
        price: 1
      });

      // user が executeTradeBatch を実行 => MatchingEngine に注文が作成され、user の Vault から 100 トークンが引かれる
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      // この時点で、MatchingEngine の注文 ID は 0 から開始すると仮定
      const orderId = 0;

      // user が注文キャンセルを実行（所有者のみキャンセル可能）
      await vault.connect(user).cancelOrder(orderId);

      // キャンセル処理時、注文にロックされていた未約定の数量が Vault に返金される（テストでは 100 トークンが返金）
      const balanceAfter = await vault.getBalance(await user.getAddress(), tokenA.getAddress());
      expect(balanceAfter).to.equal(100);

      // MatchingEngine 側の注文はキャンセル済みとなっているはず
      const orderData = await engine.getOrder(orderId);
      expect(orderData.active).to.equal(false);
    });
  });
});
