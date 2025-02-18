import { expect } from "chai";
import { ethers } from "hardhat";
import { MatchingEngine, TradingVault, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";
import { createTradeRequest } from "./helpers/tradeHelper";


describe("MatchingEngine", function () {
  let admin: Signer;
  let user: Signer;
  let trader: Signer;

  let matchingEngine: MatchingEngine;
  let vault: TradingVault;
  let tokenA: MockERC20;
  let tokenB: MockERC20;


  beforeEach(async function () {
    const signers = await ethers.getSigners();
    admin = signers[0];
    user = signers[1];
    trader = signers[2];

    // --- ERC20 トークンのデプロイ (MockERC20) ---
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    tokenA = await TokenFactory.connect(admin).deploy("Token A", "TKA", 1000000);
    await tokenA.waitForDeployment();
    tokenB = await TokenFactory.connect(admin).deploy("Token B", "TKB", 1000000);
    await tokenB.waitForDeployment();

    // --- MatchingEngine のデプロイ ---
    const MatchingEngineFactory = await ethers.getContractFactory("MatchingEngine");
    // makerFeeRate = 10 (0.1%), takerFeeRate = 15 (0.15%)
    matchingEngine = await MatchingEngineFactory.connect(admin).deploy(10, 15);
    await matchingEngine.waitForDeployment();

    // --- TradingVault のデプロイ (Vault として利用) ---
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vault = await VaultFactory.connect(admin).deploy(await matchingEngine.getAddress());
    await vault.waitForDeployment();

    // --- MatchingEngine に Vault アドレスを設定 ---
    await matchingEngine.connect(admin).setVaultAddress(await vault.getAddress());

    // --- Trading Pair の追加 ---
    // tokenA を tokenIn、tokenB を tokenOut として decimals は両方とも 18 とする
    await matchingEngine.connect(admin).addPair(await tokenA.getAddress(), await tokenB.getAddress(), 18, 18);
  });

  describe("Pair Management", function () {
    it("should add a new pair and retrieve pair info", async function () {
      const pair = await matchingEngine.getPair(0);
      expect(pair.pairId).to.exist;
      expect(pair.tokenz[0]).to.equal(await tokenA.getAddress());
      expect(pair.tokenz[1]).to.equal(await tokenB.getAddress());
      expect(pair.decimals[0]).to.equal(18);
      expect(pair.decimals[1]).to.equal(18);
    });

    it("should return an array of pairs with getPairs()", async function () {
      // ダミーの別ペアとして、逆順 (tokenB, tokenA) を追加
      await matchingEngine.connect(admin).addPair(await tokenB.getAddress(), await tokenA.getAddress(), 8, 8);
      const pairs = await matchingEngine.getPairs(2, 0);
      expect(pairs.length).to.equal(2);
    });
  });

  describe("Order Creation via Vault", function () {
    it("should create a buy order properly through vault", async function () {
      // --- user によるトークン入金の準備 ---
      await tokenA.connect(admin).transfer(await user.getAddress(), 1000);
      await tokenA.connect(user).approve(await vault.getAddress(), 500);
      await vault.connect(user).deposit(await tokenA.getAddress(), 100);

      // --- Trade Request の作成 (Buy order: side = 0) ---
      // この例では amount = 100, price = 1 とする
      // Traderが
      const tradeRequest = await createTradeRequest({
        user: user,
        tokenIn: tokenA,
        tokenOut: tokenB,
        side: 0,
        amount: 100,
        price: 1
      });

      // --- Vault 経由で注文実行 ---
      await vault.connect(user).executeTradeBatch([tradeRequest]);

      // --- MatchingEngine にオーダーが作成されていることを検証 ---
      const order = await matchingEngine.getOrder(0);
      expect(order.id).to.equal(0);
      // トレーダー (trader) が executeTradeBatch を実行したが、取引は は user（委任者） になる
      expect(order.user).to.equal(await user.getAddress());
      expect(order.tokenIn).to.equal(await tokenA.getAddress());
      expect(order.tokenOut).to.equal(await tokenB.getAddress());
      // _executeSingleTrade で注文価格として amount をそのまま price にしている前提（簡易例）
      expect(order.price).to.equal(1);
      expect(order.amount).to.equal(100);
      expect(order.active).to.equal(true);
    });

    it("should create a sell order properly through vault", async function () {
      // --- user によるトークン入金の準備 ---
      await tokenA.connect(admin).transfer(await user.getAddress(), 1000);
      await tokenA.connect(user).approve(await vault.getAddress(), 500);
      await vault.connect(user).deposit(await tokenA.getAddress(), 150);

      // --- Trade Request の作成 (Sell order: side = 1) ---
      // この例では amount = 150, price = 1 とする
      const tradeRequest = await createTradeRequest({
        user: user,
        tokenIn: tokenA,
        tokenOut: tokenB,
        side: 1,
        amount: 150,
        price: 1
      });
      // --- Vault 経由で注文実行 ---
      await vault.connect(user).executeTradeBatch([tradeRequest]);

      // --- MatchingEngine にオーダーが作成されていることを検証 ---
      const order = await matchingEngine.getOrder(0);
      expect(order.id).to.equal(0);
      expect(order.user).to.equal(await user.getAddress());
      expect(order.tokenIn).to.equal(await tokenA.getAddress());
      expect(order.tokenOut).to.equal(await tokenB.getAddress());
      expect(order.price).to.equal(1);
      expect(order.amount).to.equal(150);
      expect(order.active).to.equal(true);
    });

    it("should revert when placeOrder is called directly by a non-vault account", async function () {
      await expect(
        matchingEngine.connect(user).placeOrder(
          await user.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          0,  // side Buy
          150,
          50,
        )
      ).to.be.revertedWith("Only vault allowed");
    });
  });

  describe("Order Best Retrieval", function () {
    it("should retrieve the best buy order", async function () {
      // --- 複数の Buy Order を発行 ---
      // 1つ目： price = 150, amount = 150
      await tokenA.connect(admin).transfer(await user.getAddress(), 1000);
      await tokenA.connect(user).approve(await vault.getAddress(), 500);
      await vault.connect(user).deposit(await tokenA.getAddress(), 150);
      const tradeRequest1 = await createTradeRequest({
        user: user,
        tokenIn: tokenA,
        tokenOut: tokenB,
        side: 0,
        amount: 150,
        price: 150
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      // 2つ目： price = 160, amount = 160
      await tokenA.connect(admin).transfer(await trader.getAddress(), 1000);
      await tokenA.connect(trader).approve(await vault.getAddress(), 500);
      await vault.connect(trader).deposit(await tokenA.getAddress(), 160);
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        tokenIn: tokenA,
        tokenOut: tokenB,
        side: 0,
        amount: 160,
        price: 160
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      // --- best order の検証 ---
      const pairId = await matchingEngine.getPairId(await tokenA.getAddress(), await tokenB.getAddress());
      const bestBuy = await matchingEngine.getBestOrder(pairId, 0);
      // 複数注文中、price が高い方（この例では 160）の注文が返ると仮定
      expect(bestBuy.price).to.equal(160);
    });
  });

  describe("Order Cancellation", function () {
    it("should cancel an active order and mark it inactive", async function () {
      // --- 事前に注文作成 ---
      await tokenA.connect(admin).transfer(await user.getAddress(), 1000);
      await tokenA.connect(user).approve(await vault.getAddress(), 500);
      await vault.connect(user).deposit(await tokenA.getAddress(), 100);
      const tradeRequest = await createTradeRequest({
        user: user,
        tokenIn: tokenA,
        tokenOut: tokenB,
        side: 0,
        amount: 100,
        price: 1
      });
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      const orderId = 0;

      // --- 注文キャンセル ---
      await vault.connect(user).cancelOrder(orderId);

      const order = await matchingEngine.getOrder(orderId);
      expect(order.active).to.equal(false);
    });
  });
});
