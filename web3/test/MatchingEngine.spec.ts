import { expect } from "chai";
import { ethers } from "hardhat";
import { MatchingEngine, TradingVault, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";
import { createTradeRequest, getTradeExecutedEvents } from "./helpers/tradeHelper";



describe("MatchingEngine", function () {
  let admin: Signer;
  let user: Signer;
  let trader: Signer;

  let matchingEngine: MatchingEngine;
  let vault: TradingVault;
  let baseToken: MockERC20;
  let quoteToken: MockERC20;


  beforeEach(async function () {
    const signers = await ethers.getSigners();
    admin = signers[0];
    user = signers[1];
    trader = signers[2];

    // --- ERC20 トークンのデプロイ (MockERC20) ---
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    // BTCとかETHとか
    baseToken = await TokenFactory.connect(admin).deploy("Base Token", "BASE", 1000000);
    await baseToken.waitForDeployment();
    // USDとかJPYとか
    quoteToken = await TokenFactory.connect(admin).deploy("Quote Token", "QUOTE", 1000000);
    await quoteToken.waitForDeployment();

    // --- MatchingEngine のデプロイ ---
    const MatchingEngineFactory = await ethers.getContractFactory("MatchingEngine");
    // TODO: 一旦簡単のため、makerFeeRate = 0 (0%), takerFeeRate = 0 (0%)
    matchingEngine = await MatchingEngineFactory.connect(admin).deploy(0, 0);
    await matchingEngine.waitForDeployment();

    // --- TradingVault のデプロイ (Vault として利用) ---
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vault = await VaultFactory.connect(admin).deploy(await matchingEngine.getAddress());
    await vault.waitForDeployment();

    // --- MatchingEngine に Vault アドレスを設定 ---
    await matchingEngine.connect(admin).setVaultAddress(await vault.getAddress());

    // --- Trading Pair の追加 ---
    // baseToken を base、quoteToken を quote として decimals は両方とも 18 とする
    await matchingEngine.connect(admin).addPair(await baseToken.getAddress(), await quoteToken.getAddress(), 18, 18);


    await baseToken.connect(admin).transfer(await user.getAddress(), 10000);
    await baseToken.connect(user).approve(await vault.getAddress(), 10000);
    await vault.connect(user).deposit(await baseToken.getAddress(), 10000);

    await baseToken.connect(admin).transfer(await trader.getAddress(), 10000);
    await baseToken.connect(trader).approve(await vault.getAddress(), 10000);
    await vault.connect(trader).deposit(await baseToken.getAddress(), 10000);

    await quoteToken.connect(admin).transfer(await user.getAddress(), 10000);
    await quoteToken.connect(user).approve(await vault.getAddress(), 10000);
    await vault.connect(user).deposit(await quoteToken.getAddress(), 10000);

    await quoteToken.connect(admin).transfer(await trader.getAddress(), 10000);
    await quoteToken.connect(trader).approve(await vault.getAddress(), 10000);
    await vault.connect(trader).deposit(await quoteToken.getAddress(), 10000);
  });

  describe("Pair Management", function () {
    it("should add a new pair and retrieve pair info", async function () {
      const pair = await matchingEngine.getPair(0);
      expect(pair.pairId).to.exist;
      expect(pair.tokenz[0]).to.equal(await baseToken.getAddress());
      expect(pair.tokenz[1]).to.equal(await quoteToken.getAddress());
      expect(pair.decimals[0]).to.equal(18);
      expect(pair.decimals[1]).to.equal(18);
    });

    it("should return an array of pairs with getPairs()", async function () {
      // ダミーの別ペアとして、逆順 (quoteToken, baseToken) を追加
      await matchingEngine.connect(admin).addPair(await quoteToken.getAddress(), await baseToken.getAddress(), 8, 8);
      const pairs = await matchingEngine.getPairs(2, 0);
      expect(pairs.length).to.equal(2);
    });
  });

  describe("Order Creation via Vault", function () {
    it("should create a buy order properly through vault", async function () {
      // --- user によるトークン入金の準備 ---
      await baseToken.connect(admin).transfer(await user.getAddress(), 1000);
      await baseToken.connect(user).approve(await vault.getAddress(), 500);
      await vault.connect(user).deposit(await baseToken.getAddress(), 100);

      // --- Trade Request の作成 (Buy order: side = 0) ---
      // この例では amount = 100, price = 1 とする
      // Traderが
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
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
      expect(order.base).to.equal(await baseToken.getAddress());
      expect(order.quote).to.equal(await quoteToken.getAddress());
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
        base: baseToken,
        quote: quoteToken,
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
      expect(order.base).to.equal(await baseToken.getAddress());
      expect(order.quote).to.equal(await quoteToken.getAddress());
      expect(order.price).to.equal(1);
      expect(order.amount).to.equal(100);
      expect(order.active).to.equal(true);
    });

    it("should revert when placeOrder is called directly by a non-vault account", async function () {
      await expect(
        matchingEngine.connect(user).placeOrder(
          await user.getAddress(),
          await baseToken.getAddress(),
          await quoteToken.getAddress(),
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
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 30,
        price: 1
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      // 2つ目： price = 2, amount = 100
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 5,
        price: 2
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      // --- best order の検証 ---
      const pairId = await matchingEngine.getPairId(await baseToken.getAddress(), await quoteToken.getAddress());
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
        base: baseToken,
        quote: quoteToken,
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
    // 全量マッチング
    it("should match orders correctly", async function () {

      // baseToken を 100 トークンprice 2で買うのでquoteToken 200トークンが出る
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 100,
        price: 2
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      // baseToken を 100 トークンprice 2で売るのでquoteToken 200トークンが入る
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseToken,
        quote: quoteToken,
        side: 1,
        amount: 100,
        price: 2
      });
      // ここでマッチングするはず
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      const tradeExecutedEvents = await getTradeExecutedEvents(matchingEngine);

      expect(tradeExecutedEvents.length).to.equal(1);

      // --- 注文結果の検証 ---
      const order1 = await matchingEngine.getOrder(0);
      const order2 = await matchingEngine.getOrder(1);

      expect(order1.active).to.equal(false);
      expect(order2.active).to.equal(false);


      // user baseToken: 10100, quoteToken: 9800
      const userBalanceBase = await vault.getBalance(await user.getAddress(), await baseToken.getAddress());
      expect(userBalanceBase).to.equal(10100);
      const userBalanceQuote = await vault.getBalance(await user.getAddress(), await quoteToken.getAddress());
      expect(userBalanceQuote).to.equal(9800);
      // trader baseToken: 9900, quoteToken: 10200
      const traderBalanceBase = await vault.getBalance(await trader.getAddress(), await baseToken.getAddress());
      expect(traderBalanceBase).to.equal(9900);
      const traderBalanceQuote = await vault.getBalance(await trader.getAddress(), await quoteToken.getAddress());
      expect(traderBalanceQuote).to.equal(10200);
    });

    // 全量マッチング
    it('should match orders correctly with sell order', async function () {
      // baseToken を 100 トークンprice 2で売るのでquoteToken 200トークンが入る
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 1,
        amount: 100,
        price: 2
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);
      
      // baseToken を 100 トークンprice 2で買うのでquoteToken 200トークンが出る
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 100,
        price: 2
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);
      
      const tradeExecutedEvents = await getTradeExecutedEvents(matchingEngine);
      expect(tradeExecutedEvents.length).to.equal(1);

      // --- 注文結果の検証 ---
      const order1 = await matchingEngine.getOrder(0);
      const order2 = await matchingEngine.getOrder(1);  

      expect(order1.active).to.equal(false);
      expect(order2.active).to.equal(false);

      // user baseToken: 9900, quoteToken: 10200
      const userBalanceBase = await vault.getBalance(await user.getAddress(), await baseToken.getAddress());  
      expect(userBalanceBase).to.equal(9900);  
      const userBalanceQuote = await vault.getBalance(await user.getAddress(), await quoteToken.getAddress());
      expect(userBalanceQuote).to.equal(10200);
      // trader baseToken: 10100, quoteToken: 9800
      const traderBalanceBase = await vault.getBalance(await trader.getAddress(), await baseToken.getAddress());
      expect(traderBalanceBase).to.equal(10100); 
      const traderBalanceQuote = await vault.getBalance(await trader.getAddress(), await quoteToken.getAddress());
      expect(traderBalanceQuote).to.equal(9800);
    });

    // TODO: 残っているものの繰り返しマッチング
    // it('should match orders with partial fill', async function () {
    //   const tradeRequest1 = await createTradeRequest({
    //     user: user,
    //     base: baseToken,
    //     quote: quoteToken,
    //     side: 0,
    //     amount: 100,
    //     price: 1
    //   });
    //   await vault.connect(user).executeTradeBatch([tradeRequest1]);

    //   const tradeRequest2 = await createTradeRequest({
    //     user: trader,
    //     base: baseToken,
    //     quote: quoteToken,
    //     side: 1,
    //     amount: 50,
    //     price: 1
    //   });
    //   await vault.connect(trader).executeTradeBatch([tradeRequest2]);
    //   const tradeExecutedEvents = await getTradeExecutedEvents(matchingEngine);
    //   expect(tradeExecutedEvents.length).to.equal(1);

    //   // user baseToken: 10200, quoteToken: 9800
    //   const userBalanceBase = await vault.getBalance(await user.getAddress(), await baseToken.getAddress());
    //   expect(userBalanceBase).to.equal(10200);
    //   const userBalanceQuote = await vault.getBalance(await user.getAddress(), await quoteToken.getAddress());
    //   expect(userBalanceQuote).to.equal(9800);
    //   // trader baseToken: 9900, quoteToken: 10100
      
    // });

    // TODO: 成り行き注文

    // TODO: 手数料計算
    // TODO: 順番のテスト
  });
});
