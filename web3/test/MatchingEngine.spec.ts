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
    // tokenA を base、tokenB を quote として decimals は両方とも 18 とする
    await matchingEngine.connect(admin).addPair(await tokenA.getAddress(), await tokenB.getAddress(), 18, 18);


    await tokenA.connect(admin).transfer(await user.getAddress(), 1000);
    await tokenA.connect(user).approve(await vault.getAddress(), 500);
    await vault.connect(user).deposit(await tokenA.getAddress(), 100);

    await tokenA.connect(admin).transfer(await trader.getAddress(), 1000);
    await tokenA.connect(trader).approve(await vault.getAddress(), 500);
    await vault.connect(trader).deposit(await tokenA.getAddress(), 100);

    await tokenB.connect(admin).transfer(await user.getAddress(), 1000);
    await tokenB.connect(user).approve(await vault.getAddress(), 500);
    await vault.connect(user).deposit(await tokenB.getAddress(), 100);

    await tokenB.connect(admin).transfer(await trader.getAddress(), 1000);
    await tokenB.connect(trader).approve(await vault.getAddress(), 500);
    await vault.connect(trader).deposit(await tokenB.getAddress(), 100);
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
        base: tokenA,
        quote: tokenB,
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
      expect(order.base).to.equal(await tokenA.getAddress());
      expect(order.quote).to.equal(await tokenB.getAddress());
      // _executeSingleTrade で注文価格として amount をそのまま price にしている前提（簡易例）
      expect(order.price).to.equal(1);
      expect(order.amount).to.equal(100);
      expect(order.active).to.equal(true);
    });

    it("should create a sell order properly through vault", async function () {
      // --- Trade Request の作成 (Sell order: side = 1) ---
      // この例では amount = 100, price = 1 とする
      const tradeRequest = await createTradeRequest({
        user: user,
        base: tokenA,
        quote: tokenB,
        side: 1,
        amount: 100,
        price: 1
      });
      // --- Vault 経由で注文実行 ---
      await vault.connect(user).executeTradeBatch([tradeRequest]);

      // --- MatchingEngine にオーダーが作成されていることを検証 ---
      const order = await matchingEngine.getOrder(0);
      expect(order.id).to.equal(0);
      expect(order.user).to.equal(await user.getAddress());
      expect(order.base).to.equal(await tokenA.getAddress());
      expect(order.quote).to.equal(await tokenB.getAddress());
      expect(order.price).to.equal(1);
      expect(order.amount).to.equal(100);
      expect(order.active).to.equal(true);
    });

    it("should revert when placeOrder is called directly by a non-vault account", async function () {
      await expect(
        matchingEngine.connect(user).placeOrder(
          await user.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          0,  // side Buy
          100,
          1,
        )
      ).to.be.revertedWith("Only vault allowed");
    });
  });

  describe("Order Best Retrieval", function () {
    it("should retrieve the best buy order", async function () {
      // --- 複数の Buy Order を発行 ---
      // 1つ目： price = 1, amount = 100
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: tokenA,
        quote: tokenB,
        side: 0,
        amount: 100,
        price: 1
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      // 2つ目： price = 2, amount = 100
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: tokenA,
        quote: tokenB,
        side: 0,
        amount: 100,
        price: 2
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      // --- best order の検証 ---
      const pairId = await matchingEngine.getPairId(await tokenA.getAddress(), await tokenB.getAddress());
      const bestBuy = await matchingEngine.getBestOrder(pairId, 0);
      // 複数注文中、price が高い方（この例では 2）の注文が返ると仮定
      expect(bestBuy.price).to.equal(2);
    });
  });

  describe("Order Cancellation", function () {
    it("should cancel an active order and mark it inactive", async function () {
      // --- 事前に注文作成 ---
      const tradeRequest = await createTradeRequest({
        user: user,
        base: tokenA,
        quote: tokenB,
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


  describe("Order Matching", function () {
    it.only("should match orders correctly", async function () {

      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: tokenA,
        quote: tokenB, 
        side: 0,
        amount: 100,
        price: 1
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: tokenA,
        quote: tokenB,
        side: 1,
        amount: 100,
        price: 1
      });
      // ここでマッチングするはず
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      const tradeExecutedFilter = matchingEngine.filters.TradeExecuted();
      const latestBlock = await ethers.provider.getBlockNumber();
      const tradeExecutedEvents = await matchingEngine.queryFilter(tradeExecutedFilter, 0, latestBlock);

      expect(tradeExecutedEvents.length).to.equal(1);

      // --- 注文結果の検証 ---
      const order1 = await matchingEngine.getOrder(0);
      const order2 = await matchingEngine.getOrder(1);

      expect(order1.active).to.equal(false);
      expect(order2.active).to.equal(false);
      
      
      // マッチング後、trader tokenA: 0, tokenB: 200
      const traderBalanceA = await vault.getBalance(await trader.getAddress(), await tokenA.getAddress());
      expect(traderBalanceA).to.equal(0);
      const traderBalanceB = await vault.getBalance(await trader.getAddress(), await tokenB.getAddress());
      expect(traderBalanceB).to.equal(200);
      
      // 同時に、user tokenA: 200, tokenB: 0
      // TODO: マッチング後にマッチング相手の残高を差し引く処理が必要
      // const userBalanceA = await vault.getBalance(await user.getAddress(), await tokenA.getAddress());
      // expect(userBalanceA).to.equal(200);
      const userBalanceB = await vault.getBalance(await user.getAddress(), await tokenB.getAddress());
      expect(userBalanceB).to.equal(0);
    });
  });
});
