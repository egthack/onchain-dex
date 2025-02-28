import { expect } from "chai";
import { ethers } from "hardhat";
import { MatchingEngine, TradingVault, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";
import {
  createTradeRequest,
  depositToken,
  getContractEvents,
  getTokenBalances,
} from "./helpers/tradeHelper";

describe("MatchingEngine", function () {
  let admin: Signer;
  let user: Signer;
  let trader: Signer;
  let trader2: Signer;
  let matchingEngine: MatchingEngine;
  let vault: TradingVault;
  let baseTokenA: MockERC20;
  let baseTokenB: MockERC20;
  let quoteTokenA: MockERC20;
  let quoteTokenB: MockERC20;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    admin = signers[0];
    user = signers[1];
    trader = signers[2];
    trader2 = signers[3];
    // --- ERC20 トークンのデプロイ (MockERC20) ---
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    // BTCとかETHとか
    baseTokenA = await TokenFactory.connect(admin).deploy(
      "Base Token A",
      "BASEA",
      100000000,
      18
    );
    await baseTokenA.waitForDeployment();
    // USDとかJPYとか
    quoteTokenA = await TokenFactory.connect(admin).deploy(
      "Quote Token A",
      "QUOTEA",
      100000000,
      6
    );
    await quoteTokenA.waitForDeployment();

    baseTokenB = await TokenFactory.connect(admin).deploy(
      "Base Token B",
      "BASEB",
      100000000,
      18
    );
    await baseTokenB.waitForDeployment();

    quoteTokenB = await TokenFactory.connect(admin).deploy(
      "Quote Token B",
      "QUOTEB",
      100000000,
      6
    );
    await quoteTokenB.waitForDeployment();

    // --- MatchingEngine のデプロイ ---
    const MatchingEngineFactory = await ethers.getContractFactory(
      "MatchingEngine"
    );
    // TODO: 一旦簡単のため、makerFeeRate = 0 (0%), takerFeeRate = 0 (0%)
    matchingEngine = await MatchingEngineFactory.connect(admin).deploy(0, 0);
    await matchingEngine.waitForDeployment();

    // --- TradingVault のデプロイ (Vault として利用) ---
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vault = await VaultFactory.connect(admin).deploy(
      await matchingEngine.getAddress()
    );
    await vault.waitForDeployment();

    // --- MatchingEngine に Vault アドレスを設定 ---
    await matchingEngine
      .connect(admin)
      .setVaultAddress(await vault.getAddress());

    // --- Trading Pair の追加 ---
    await matchingEngine
      .connect(admin)
      .addPair(await baseTokenA.getAddress(), await quoteTokenA.getAddress());
    // 全員にトークン入金
    await depositToken(baseTokenA, admin, user, vault, "1", 18);
    await depositToken(baseTokenA, admin, trader, vault, "1", 18);
    await depositToken(baseTokenA, admin, trader2, vault, "1", 18);
    await depositToken(quoteTokenA, admin, user, vault, "1", 6);
    await depositToken(quoteTokenA, admin, trader, vault, "1", 6);
    await depositToken(quoteTokenA, admin, trader2, vault, "1", 6);
    await depositToken(baseTokenB, admin, user, vault, "1", 18);
    await depositToken(baseTokenB, admin, trader, vault, "1", 18);
    await depositToken(baseTokenB, admin, trader2, vault, "1", 18);
    await depositToken(quoteTokenB, admin, user, vault, "1", 6);
    await depositToken(quoteTokenB, admin, trader, vault, "1", 6);
    await depositToken(quoteTokenB, admin, trader2, vault, "1", 6);


  });

  describe("Pair Management", function () {
    let lowDecimalToken: MockERC20;
    beforeEach(async function () {
      const TokenFactory = await ethers.getContractFactory("MockERC20");
      lowDecimalToken = await TokenFactory.connect(admin).deploy(
        "Low Decimal Token",
        "LDTOKEN",
        100000000,
        5
      );
    });

    it("should add a new pair and retrieve pair info", async function () {
      const pair = await matchingEngine.getPair(0);
      expect(pair.pairId).to.exist;
      expect(pair.tokenz[0]).to.equal(await baseTokenA.getAddress());
      expect(pair.tokenz[1]).to.equal(await quoteTokenA.getAddress());
      expect(pair.decimals[0]).to.equal(18);
      expect(pair.decimals[1]).to.equal(6);
    });

    it("should revert if base token has less than 6 decimals", async function () {
      // 低小数点トークンとquoteトークンのペアを追加
      await expect(matchingEngine
        .connect(admin)
        .addPair(
          await lowDecimalToken.getAddress(),
          await quoteTokenA.getAddress()
        )
      ).to.be.revertedWith("Base token decimals must be at least 6");
    });

    it("should revert if quote token has less than 6 decimals", async function () {

      // baseトークンと低小数点トークンのペアを追加
      await expect(matchingEngine
        .connect(admin)
        .addPair(
          await baseTokenB.getAddress(),
          await lowDecimalToken.getAddress()
        )
      ).to.be.revertedWith("Quote token decimals must be at least 6");
    });

    it("should return an array of pairs with getPairs()", async function () {
      // 別のペアを追加
      await matchingEngine
        .connect(admin)
        .addPair(await baseTokenB.getAddress(), await quoteTokenB.getAddress());
      const pairs = await matchingEngine.getPairsWithPagination(0, 10);
      expect(pairs.length).to.equal(2);

      // ペアの内容検証
      expect(pairs[0].tokenz[0]).to.equal(await baseTokenA.getAddress());
      expect(pairs[0].tokenz[1]).to.equal(await quoteTokenA.getAddress());

      // 2番目のペアの検証を追加
      expect(pairs[1].tokenz[0]).to.equal(await baseTokenB.getAddress());
      expect(pairs[1].tokenz[1]).to.equal(await quoteTokenB.getAddress());
    });
  });

  describe("Order Creation via Vault", function () {
    it("should create a single order properly through vault", async function () {
      // --- user によるトークン入金の準備 ---
      await baseTokenA.connect(admin).transfer(await user.getAddress(), ethers.parseUnits("100000", 18));
      await baseTokenA.connect(user).approve(await vault.getAddress(), ethers.parseUnits("100000", 18));
      await vault.connect(user).deposit(await baseTokenA.getAddress(), ethers.parseUnits("100000", 18));

      // --- Trade Request の作成 (Buy order: side = 0) ---
      // この例では amount = 100, price = 1 とする
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0,
        amount: 100,
        price: 1,
      });

      // --- Vault 経由で注文実行 ---
      await vault.connect(user).executeTradeBatch([tradeRequest]);

      // --- MatchingEngine にオーダーが作成されていることを検証 ---
      const order = await matchingEngine.getOrder(0);
      expect(order.id).to.equal(0);
      // トレーダー (trader) が executeTradeBatch を実行したが、取引は は user（委任者） になる
      expect(order.user).to.equal(await user.getAddress());
      expect(order.base).to.equal(await baseTokenA.getAddress());
      expect(order.quote).to.equal(await quoteTokenA.getAddress());
      // _executeSingleTrade で注文価格として amount をそのまま price にしている前提（簡易例）
      expect(order.price).to.equal(1);
      expect(order.amount).to.equal(100);
      expect(order.active).to.equal(true);
    });

    it("should create multiple orders properly through vault", async function () {
      await baseTokenA.connect(admin).transfer(await user.getAddress(), ethers.parseUnits("100000", 18));
      await baseTokenA.connect(user).approve(await vault.getAddress(), ethers.parseUnits("100000", 18));
      await vault.connect(user).deposit(await baseTokenA.getAddress(), ethers.parseUnits("100000", 18));
      await quoteTokenA
        .connect(admin)
        .transfer(await user.getAddress(), ethers.parseUnits("100000", 6));
      await quoteTokenA.connect(user).approve(await vault.getAddress(), ethers.parseUnits("100000", 6));
      await vault.connect(user).deposit(await quoteTokenA.getAddress(), ethers.parseUnits("100000", 6));

      const sellRequests = [];
      for (let i = 0; i < 5; i++) {
        const tradeRequest = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1,
          amount: 100,
          price: 100 + i,
        });
        sellRequests.push(tradeRequest);
      }
      await vault.connect(user).executeTradeBatch(sellRequests);

      const buyRequests = [];
      for (let i = 0; i < 5; i++) {
        const tradeRequest = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0,
          amount: 100,
          price: 99 - i,
        });
        buyRequests.push(tradeRequest);
      }
      await vault.connect(user).executeTradeBatch(buyRequests);

      // Matchingしないはず
      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      expect(tradeExecutedEvents.length).to.equal(0);

      const order = await matchingEngine.getOrder(0);
      expect(order.id).to.equal(0);
      expect(order.user).to.equal(await user.getAddress());
      expect(order.base).to.equal(await baseTokenA.getAddress());
      expect(order.quote).to.equal(await quoteTokenA.getAddress());
      expect(order.price).to.equal(100);
      expect(order.amount).to.equal(100);
      expect(order.active).to.equal(true);

      const page = await matchingEngine.getOrdersWithPagination(
        await matchingEngine.getPairId(
          await baseTokenA.getAddress(),
          await quoteTokenA.getAddress()
        ),
        0, // Buy side
        0,
        10
      );

      // console.log("Orders:", {
      //   orders: page.orders.map((o) => ({
      //     id: o.id.toString(),
      //     price: o.price.toString(),
      //     amount: o.amount.toString(),
      //     active: o.active,
      //   })),
      //   nextPrice: page.nextPrice.toString(),
      //   totalCount: page.totalCount.toString(),
      // });

      // // 各注文の状態を確認
      // for (let i = 0; i < 8; i++) {
      //   const order = await matchingEngine.getOrder(i);
      //   console.log(`Order ${i}:`, {
      //     price: order.price.toString(),
      //     amount: order.amount.toString(),
      //     active: order.active,
      //   });
      // }

      expect(page.orders.length).to.equal(5);
    });

    it("should revert when placeOrder is called directly by a non-vault account", async function () {
      await expect(
        matchingEngine.connect(user).placeOrder(
          await user.getAddress(),
          await baseTokenA.getAddress(),
          await quoteTokenA.getAddress(),
          0, // side Buy
          100,
          1
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
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0,
        amount: 100,
        price: 1,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      // 2つ目： price = 2, amount = 100
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0,
        amount: 100,
        price: 2,
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      // --- best order の検証 ---
      const pairId = await matchingEngine.getPairId(
        await baseTokenA.getAddress(),
        await quoteTokenA.getAddress()
      );
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
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0,
        amount: 100,
        price: 1,
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
      // 0.000001 baseToken を 単価0.02 quoteToken 100単位買う
      // get: 0.000001  * 100  = 0.0001 baseToken  out: 0.000001 * 0.02 * 100 = 0.000002 quoteToken
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0,
        amount: 100,
        price: 2,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      // 0.000001 baseToken を 単価0.02 quoteToken 100単位売る
      // out: 0.0001 baseToken  get: 0.000001 * 0.02 * 100 = 0.000002 quoteToken
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 1,
        amount: 100,
        price: 2,
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      expect(tradeExecutedEvents.length).to.equal(1);

      // --- 注文結果の検証 ---
      const order1 = await matchingEngine.getOrder(0);
      const order2 = await matchingEngine.getOrder(1);

      expect(order1.active).to.equal(false);
      expect(order2.active).to.equal(false);

      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseTokenA,
        quoteTokenA
      );

      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);

      // user basetoken: + 0.0001 * 18^18, quote: 0.000001 * 0.02 * 100 = 0.000002 
      expect(userBalanceBase).to.equal(ethers.parseUnits("1", 18) + ethers.parseUnits("0.0001", 18));
      expect(userBalanceQuote).to.equal(ethers.parseUnits("1", 6) - ethers.parseUnits("0.000002", 6));

      // trader basetoken: -0.0001 * 10^18, quote: 0.000001 * 0.02 * 100 = 0.000002 
      expect(traderBalanceBase).to.equal(ethers.parseUnits("1", 18) - ethers.parseUnits("0.0001", 18));
      expect(traderBalanceQuote).to.equal(ethers.parseUnits("1", 6) + ethers.parseUnits("0.000002", 6));
    });

    // 全量マッチング
    it("should match orders correctly with sell order", async function () {
      // 0.000001 baseToken を 単価0.02 quoteToken 100単位売る
      // out: 0.0001 baseToken  get: 0.000001 * 0.02 * 100 = 0.000002 quoteToken
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 1,
        amount: 100,
        price: 2,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      // 0.000001 baseToken を 単価0.02 quoteToken 100単位買う
      // get: 0.000001  * 100  = 0.0001 baseToken  out: 0.000001 * 0.02 * 100 = 0.000002 quoteToken
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0,
        amount: 100,
        price: 2,
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      expect(tradeExecutedEvents.length).to.equal(1);

      // --- 注文結果の検証 ---
      const order1 = await matchingEngine.getOrder(0);
      const order2 = await matchingEngine.getOrder(1);

      expect(order1.active).to.equal(false);
      expect(order2.active).to.equal(false);

      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseTokenA,
        quoteTokenA
      );
      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);

      // user baseToken: -0.0001 * 18^18, quoteToken: 0.000001 * 0.02 * 100 = 0.000002
      expect(userBalanceBase).to.equal(ethers.parseUnits("1", 18) - ethers.parseUnits("0.0001", 18));
      expect(userBalanceQuote).to.equal(ethers.parseUnits("1", 6) + ethers.parseUnits("0.000002", 6));
      // trader baseToken: +0.0001 * 18^18, quoteToken: -0.000002 * 6
      expect(traderBalanceBase).to.equal(ethers.parseUnits("1", 18) + ethers.parseUnits("0.0001", 18));
      expect(traderBalanceQuote).to.equal(ethers.parseUnits("1", 6) - ethers.parseUnits("0.000002", 6));
    });

    // 部分マッチング
    it("should match orders with partial fill", async function () {
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0,
        amount: 1000,
        price: 1,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 1,
        amount: 500,
        price: 1,
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      expect(tradeExecutedEvents.length).to.equal(1);

      // 部分約定するので、baseToken 0.000001を 単価0.01 quoteToken で500単位買う
      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseTokenA,
        quoteTokenA
      );
      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);
      // user baseToken: +0.000001 * 500 * 18^18, quoteToken(executed:500, locked:500): -0.000001 * 0.01 * 1000 = -0.00001
      expect(userBalanceBase).to.equal(ethers.parseUnits("1", 18) + ethers.parseUnits("0.0005", 18));
      expect(userBalanceQuote).to.equal(ethers.parseUnits("1", 6) - ethers.parseUnits("0.00001", 6));

      // trader baseToken: -0.000001 * 18^18, quoteToken: +0.000001 * 0.01 * 500 = 0.000005
      expect(traderBalanceBase).to.equal(ethers.parseUnits("1", 18) - ethers.parseUnits("0.0005", 18));
      expect(traderBalanceQuote).to.equal(ethers.parseUnits("1", 6) + ethers.parseUnits("0.000005", 6));

      // 繰り返しマッチング
      const tradeRequest3 = await createTradeRequest({
        user: trader,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 1,
        amount: 500,
        price: 1,
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest3]);

      const tradeExecutedEvents2 = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      expect(tradeExecutedEvents2.length).to.equal(2);


      const {
        userBalanceBase: userBalanceBase2,
        userBalanceQuote: userBalanceQuote2,
      } = await getTokenBalances(vault, user, baseTokenA, quoteTokenA);
      const {
        userBalanceBase: traderBalanceBase2,
        userBalanceQuote: traderBalanceQuote2,
      } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);

      // user baseToken: +0.000001 * 500 * 18^18, quoteToken: -0.000001 * 0.01 * 1000 = -0.00001
      expect(userBalanceBase2).to.equal(ethers.parseUnits("1", 18) + ethers.parseUnits("0.0005", 18) + ethers.parseUnits("0.0005", 18));
      expect(userBalanceQuote2).to.equal(ethers.parseUnits("1", 6) - ethers.parseUnits("0.00001", 6));

      // trader baseToken: 9900, quoteToken: 10100
      expect(traderBalanceBase2).to.equal(ethers.parseUnits("1", 18) - ethers.parseUnits("0.0005", 18) - ethers.parseUnits("0.0005", 18));
      expect(traderBalanceQuote2).to.equal(ethers.parseUnits("1", 6) + ethers.parseUnits("0.00001", 6));
    });



    describe("Market Orders", function () {
      it("should execute market buy order against existing sell orders", async function () {
        // 指値売り注文を作成
        const limitSellOrder = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 1000,
          price: 2,
        });
        await vault.connect(trader).executeTradeBatch([limitSellOrder]);
        // 成行買い注文を実行
        const marketBuyOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy
          amount: 500,
          price: 0, // Market order
        });
        await vault.connect(user).executeTradeBatch([marketBuyOrder]);
        // 約定確認
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(1);
        // 残高確認
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
          vault,
          user,
          baseTokenA,
          quoteTokenA
        );
        // quote: - 500 , base: + 0.000001 * 0.01 * 500 / 2 = 0.0000025
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.00025', 18));
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.000005', 6));

        const {
          userBalanceBase: traderBalanceBase,
          userBalanceQuote: traderBalanceQuote,
        } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);
        // base: 9900(75 locked, 25 sold), quote: 10050(50 returned)
        expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.001', 18));
        expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.000005', 6));

        // trader の50 locked 注文をキャンセルして返金される金額を確認
        await vault.connect(trader).cancelOrder(0);
        const {
          userBalanceBase: traderBalanceBase2,
          userBalanceQuote: traderBalanceQuote2,
        } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);
        // base: 9975(9900 + 25 bought 50 locked), quote: 10050(50 returned)
        expect(traderBalanceBase2).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.00025', 18));
        expect(traderBalanceQuote2).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.000005', 6));
      });

      it("should execute market sell order against existing buy orders", async function () {
        // 指値買い注文を作成
        const limitBuyOrder = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy
          amount: 1000,
          price: 1,
        });
        await vault.connect(trader).executeTradeBatch([limitBuyOrder]);

        // 成行売り注文を実行
        const marketSellOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 500,
          price: 0, // Market order
        });
        await vault.connect(user).executeTradeBatch([marketSellOrder]);
        // 約定確認
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(1);
        // 残高確認
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
          vault,
          user,
          baseTokenA,
          quoteTokenA
        );
        // base: + 0.000001 * 500 = 0.0005, quote: - 0.000001 * 0.01 * 500 = -0.000005
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.0005', 18));
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.000005', 6));

        const {
          userBalanceBase: traderBalanceBase,
          userBalanceQuote: traderBalanceQuote,
        } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);
        // base: - 0.000001 * 500 = -0.0005, quote: + 0.000001 * 0.01 * 1000 = 0.00001(locked)
        expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.0005', 18));
        expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.00001', 6));
      });




      // 買いの成行注文後、返金があるパターン
      it("should execute market sell order against existing sell orders and not match all", async function () {
        // 指値売り注文を作成
        const limitSellOrder = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 1000,
          price: 2,
        });
        await vault.connect(trader).executeTradeBatch([limitSellOrder]);
        // 成行買い注文を実行
        const marketSellOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy
          amount: 3000,
          price: 0, // Market order
        });
        await vault.connect(user).executeTradeBatch([marketSellOrder]);
        // 約定確認
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(1);
        // 残高確認
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
          vault,
          user,
          baseTokenA,
          quoteTokenA
        );
        const {
          userBalanceBase: traderBalanceBase,
          userBalanceQuote: traderBalanceQuote,
        } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);

        // base: + 0.000001 * 1000 = 0.001, quote: - 0.000001 * 0.01 * 2000 = -0.00002
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.001', 18));
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.00002', 6));
        // traderの注文はすべて約定する
        // base: - 0.000001 * 1000 = 0.001, quote: + 0.000001 * 0.01 * 2000 = 0.00002
        expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.001', 18));
        expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.00002', 6));
      });

      // 売りの成行注文後、返金があるパターン
      it("should execute market sell order against existing sell orders and not match all", async function () {
        // 指値売り注文を作成
        const limitBuyOrder = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy
          amount: 1000,
          price: 1,
        });
        await vault.connect(trader).executeTradeBatch([limitBuyOrder]);
        // 成行売り注文を実行
        const marketSellOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 3000,
          price: 0, // Market order
        });
        await vault.connect(user).executeTradeBatch([marketSellOrder]);
        // 約定確認
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(1);
        // 残高確認
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
          vault,
          user,
          baseTokenA,
          quoteTokenA
        );
        const {
          userBalanceBase: traderBalanceBase,
          userBalanceQuote: traderBalanceQuote,
        } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);

        // base: - 0.000001 * 1000 = - 0.001, quote: - 0.000001 * 0.01 * 1000 = -0.00001
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.001', 18));
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.00001', 6));
        // traderの注文はすべて約定する
        // base: + 0.000001 * 1000 = 0.001, quote: - 0.000001 * 0.01 * 1000 = -0.00001
        expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.001', 18));
        expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.00001', 6));
      });



      // 買いの成行注文後、返金があるパターンの桁上げ
      it("should execute large market sell order against existing sell orders and not match all", async function () {
        // 指値売り注文を作成
        const limitSellOrder = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 10000,
          price: 20,
        });
        await vault.connect(trader).executeTradeBatch([limitSellOrder]);
        // 成行買い注文を実行
        const marketSellOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy
          amount: 300000,
          price: 0, // Market order
        });
        await vault.connect(user).executeTradeBatch([marketSellOrder]);
        // 約定確認
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(1);
        // 残高確認
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
          vault,
          user,
          baseTokenA,
          quoteTokenA
        );
        const {
          userBalanceBase: traderBalanceBase,
          userBalanceQuote: traderBalanceQuote,
        } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);

        // base: + 0.000001 * 10000 = 0.01, quote: - 0.000001 * 0.01 * 200000 = -0.0002
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.01', 18));
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.002', 6));
        // traderの注文はすべて約定する
        // base: - 0.000001 * 10000 = 0.0001, quote: + 0.000001 * 0.01 * 200000 = 0.002
        expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.01', 18));
        expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.002', 6));
      });

      // 売りの成行注文後、返金があるパターンの桁上げ
      it("should execute market sell order against existing sell orders and not match all", async function () {
        // 指値売り注文を作成
        const limitBuyOrder = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy
          amount: 10000,
          price: 10,
        });
        await vault.connect(trader).executeTradeBatch([limitBuyOrder]);
        // 成行売り注文を実行
        const marketSellOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 300000,
          price: 0, // Market order
        });
        await vault.connect(user).executeTradeBatch([marketSellOrder]);
        // 約定確認
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(1);
        // 残高確認
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
          vault,
          user,
          baseTokenA,
          quoteTokenA
        );
        const {
          userBalanceBase: traderBalanceBase,
          userBalanceQuote: traderBalanceQuote,
        } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);

        // base: - 0.000001 * 10000 = - 0.001, quote: - 0.000001 * 0.01 * 100000 = -0.001
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.01', 18));
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.001', 6));
        // traderの注文はすべて約定する
        // base: + 0.000001 * 10000 = 0.01, quote: - 0.000001 * 0.01 * 100000 = -0.001
        expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.01', 18));
        expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.001', 6));
      });

      // 成行買い注文後、最良売り注文が削除されることの確認
      it("should remove best sell order from orderbook after market buy execution", async function () {
        // 最良売り注文を作成 (price = 10)
        const bestSellOrder = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 100,
          price: 10,
        });
        await vault.connect(trader).executeTradeBatch([bestSellOrder]);

        // 次に高い売り注文を作成 (price = 20)
        const secondSellOrder = await createTradeRequest({
          user: trader2,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 100,
          price: 20,
        });
        await vault.connect(trader2).executeTradeBatch([secondSellOrder]);

        // オーダーブックの最良売り注文を確認
        const pairId = await matchingEngine.getPairId(
          await baseTokenA.getAddress(),
          await quoteTokenA.getAddress()
        );
        const bestSellBefore = await matchingEngine.getBestOrder(pairId, 1); // side = 10 for sell
        expect(bestSellBefore.price).to.equal(10);

        // 成行買い注文を実行
        const marketBuyOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy
          amount: 1000,
          price: 0, // Market order
        });
        await vault.connect(user).executeTradeBatch([marketBuyOrder]);

        // 約定イベントを確認
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(1);

        // オーダーブックの最良売り注文が更新されていることを確認
        const bestSellAfter = await matchingEngine.getBestOrder(pairId, 1);
        expect(bestSellAfter.price).to.equal(20); // price10の売り注文が削除され、price20の売り注文が最良売り注文になっているはず

        // 残高確認
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
          vault,
          user,
          baseTokenA,
          quoteTokenA
        );
        // base: + 0.000001 * 100 = 0.001, quote: - 0.000001 * 0.01 * 1000 = -0.00001
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.0001', 18)); // 初期値10000 + 買った100
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.00001', 6)); // 初期値10000 - 支払った100
      });

      // 売り板に、priceが1000と2000でamountがそれぞれ100の注文を出し、成行買い注文で全て買い上げる
      it("should execute market buy order for sell orders at prices 1000 and 2000", async function () {
        // traderが売り注文を出す
        const sellOrder1 = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell order
          amount: 100,
          price: 1000
        });
        await vault.connect(trader).executeTradeBatch([sellOrder1]);

        const sellOrder2 = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell order
          amount: 100,
          price: 2000
        });
        await vault.connect(trader).executeTradeBatch([sellOrder2]);

        // userは成行買い注文で2000のamountを発注
        const marketBuyOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy order
          amount: 300000,
          price: 0 // Market order
        });
        await vault.connect(user).executeTradeBatch([marketBuyOrder]);

        // TradeExecutedイベントが2件発火しているはず
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(2);

        // 売り注文がすべて約定済みになっていることを確認
        const order1 = await matchingEngine.getOrder(0);
        const order2 = await matchingEngine.getOrder(1);
        expect(order1.active).to.equal(false);
        expect(order2.active).to.equal(false);

        // 約定後の残高チェック
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(vault, user, baseTokenA, quoteTokenA);
        // + 200 * 0.000001 = 0.0002
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.0002', 18));
        //  - 300000 * 0.01 * 0.000001 = -0.000003
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.003', 6));

        const { userBalanceBase: traderBalanceBase, userBalanceQuote: traderBalanceQuote } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);
        expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.0002', 18));
        expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.003', 6));
      });

      // 買い板に、priceが1000と2000でamountがそれぞれ100の注文を出し、成行売り注文で全て売り払う
      it("should execute market sell order for buy orders at prices 1000 and 2000", async function () {
        // traderが買い注文を出す
        const buyOrder1 = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy order
          amount: 100,
          price: 1000
        });
        await vault.connect(trader).executeTradeBatch([buyOrder1]);

        const buyOrder2 = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy order
          amount: 100,
          price: 2000
        });
        await vault.connect(trader).executeTradeBatch([buyOrder2]);

        // userは成行売り注文で200のamountを発注
        const marketSellOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell order
          amount: 200,
          price: 0 // Market order
        });
        await vault.connect(user).executeTradeBatch([marketSellOrder]);

        // TradeExecutedイベントが2件発火しているはず
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(2);

        // 買い注文がすべて約定済みになっていることを確認
        const order1 = await matchingEngine.getOrder(0);
        const order2 = await matchingEngine.getOrder(1);
        expect(order1.active).to.equal(false);
        expect(order2.active).to.equal(false);

        // 約定後の残高チェック
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(vault, user, baseTokenA, quoteTokenA);
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.0002', 18));
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.003', 6));
      });

      // 限度注文で買い板を食う（sell orders に対して limit buy order）のシナリオ
      it("should execute limit buy order for sell orders at prices 1000 and 2000 with balance check", async function () {
        // traderがSell orderを出す。priceを20に変更
        const sellOrder1 = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell order
          amount: 100,
          price: 20
        });
        await vault.connect(trader).executeTradeBatch([sellOrder1]);

        const sellOrder2 = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell order
          amount: 100,
          price: 20
        });
        await vault.connect(trader).executeTradeBatch([sellOrder2]);

        // userがlimit buy order（指定価格: 20, amount: 200）で注文
        const limitBuyOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy order
          amount: 200,
          price: 20
        });
        await vault.connect(user).executeTradeBatch([limitBuyOrder]);

        // 2件のTradeExecutedイベントが発生しているはず
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(2);

        // 両方の注文が約定済みであることを確認
        const order1 = await matchingEngine.getOrder(0);
        const order2 = await matchingEngine.getOrder(1);
        expect(order1.active).to.equal(false);
        expect(order2.active).to.equal(false);

        // 約定後の残高チェック
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(vault, user, baseTokenA, quoteTokenA);
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.0002', 18));
        // 200 * 20 * 0.000001 * 0.01 = 0.00004
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.00004', 6));

        const { userBalanceBase: traderBalanceBase, userBalanceQuote: traderBalanceQuote } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);
        expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.0002', 18));
        expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.00004', 6));
      });

      // 限度注文で売り板を食う（buy orders に対して limit sell order）のシナリオ
      it("should execute limit sell order for buy orders at prices 1000 and 2000 with balance check", async function () {
        // traderがBuy orderを出す。priceを20に変更
        const buyOrder1 = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy order
          amount: 100,
          price: 20
        });
        await vault.connect(trader).executeTradeBatch([buyOrder1]);

        const buyOrder2 = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy order
          amount: 100,
          price: 20
        });
        await vault.connect(trader).executeTradeBatch([buyOrder2]);

        // userがlimit sell order（指定価格: 20, amount: 200）で注文
        const limitSellOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell order
          amount: 200,
          price: 20
        });
        await vault.connect(user).executeTradeBatch([limitSellOrder]);

        // 2件のTradeExecutedイベントが発生しているはず
        const tradeExecutedEvents = await getContractEvents(
          matchingEngine,
          matchingEngine.filters.TradeExecuted
        );
        expect(tradeExecutedEvents.length).to.equal(2);

        // 両方の注文が約定済みであることを確認
        const order1 = await matchingEngine.getOrder(0);
        const order2 = await matchingEngine.getOrder(1);
        expect(order1.active).to.equal(false);
        expect(order2.active).to.equal(false);

        // 約定後の残高チェック
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(vault, user, baseTokenA, quoteTokenA);
        // 200 * 0.000001 = 0.0002
        expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.0002', 18));
        // 200 * 20 * 0.01 * 0.000001 = 0.00004
        expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.00004', 6));

        const { userBalanceBase: traderBalanceBase, userBalanceQuote: traderBalanceQuote } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);
        expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.0002', 18));
        // 200 * 20 * 0.01 * 0.000001 = 0.00004
        expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.00004', 6));
      });
    });

    // マッチング順のチェック　買い ->　売り 成行
    it("should match orders correctly with matching order", async function () {
      // 買い注文を出す,あえて価格を順番通りにしていない
      const orderPriceList = [{
        price: 230,
        amount: 1000,
      }, {
        price: 300,
        amount: 1000,
      }, {
        price: 30,
        amount: 1000,
      },
      {
        price: 40,
        amount: 1000,
      },
      {
        price: 100,
        amount: 1000,
      }]

      for (const order of orderPriceList) {
        const buyOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy
          amount: order.amount,
          price: order.price,
        });
        await vault.connect(user).executeTradeBatch([buyOrder]);
      }

      // 売り注文を出す
      const sellOrder = await createTradeRequest({
        user: trader,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 1, // Sell
        amount: 100000,
        price: 0, // Market order
      });
      await vault.connect(trader).executeTradeBatch([sellOrder]);

      // マッチング順のチェック
      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      // マッチングは価格の高い順に行われるはず
      // orderPriceListの価格の高いものから並べる
      const sortedOrderPriceList = orderPriceList.sort((a, b) => b.price - a.price);
  
      expect(tradeExecutedEvents.length).to.equal(sortedOrderPriceList.length);

      console.log(tradeExecutedEvents.map(event => event.args.price));
      for (let i = 0; i < tradeExecutedEvents.length; i++) {
        const event = tradeExecutedEvents[i];
        const price = event.args.price;
        expect(price).to.equal(sortedOrderPriceList[i].price);
      }
    })

    // マッチング順のチェック　売り ->　買い　成行
    it("should match orders correctly with matching order", async function () {
      // 売り注文を出す,あえて価格を順番通りにしていない
      const orderPriceList = [{
        price: 230,
        amount: 1000,
      }, {
        price: 300,
        amount: 1000,
      }, {
        price: 30,
        amount: 1000,
      },
      {
        price: 40,
        amount: 1000,
      },
      {
        price: 100,
        amount: 1000,
      }]

      for (const order of orderPriceList) {
        const sellOrder = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: order.amount,
          price: order.price,
        });
        await vault.connect(user).executeTradeBatch([sellOrder]);
      }

      // 買い注文を出す
      const buyOrder = await createTradeRequest({
        user: trader,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0, // Buy
        amount: 1000000,
        price: 0, // Market order
      });
      await vault.connect(trader).executeTradeBatch([buyOrder]);

      // マッチング順のチェック
      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      // マッチングは価格の低い順に行われるはず
      // orderPriceListの価格の低いものから並べる
      const sortedOrderPriceList = orderPriceList.sort((a, b) => a.price - b.price);
  
      for (let i = 0; i < tradeExecutedEvents.length; i++) {
        const event = tradeExecutedEvents[i];
        const price = event.args.price;
        expect(price).to.equal(sortedOrderPriceList[i].price);
      }
    })
  });

  describe("Bulk Matching", function () {
    it("should match orders correctly with bulk matching", async function () {
      // MAX_MATCH_ITERATIONSに合わせてバッチサイズを調整
      const BATCH_SIZE = 50;
      const sellOrderLength = Math.floor(BATCH_SIZE);
      const traderRequests = [];
      // 50個の注文を一気に出す
      for (let i = 0; i < sellOrderLength; i++) {
        const tradeRequest = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 1000,
          price: 10,
        });
        traderRequests.push(tradeRequest);
      }
      await vault.connect(trader).executeTradeBatch(traderRequests);

      // 買い注文を出す
      const orders = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        const tradeRequest = await createTradeRequest({
          user: user,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 0, // Buy
          amount: 1000,
          price: 10,
        });
        orders.push(tradeRequest);
      }
      // 小さなバッチに分割して実行
      const CHUNK_SIZE = 10;
      for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
        const chunk = orders.slice(i, i + CHUNK_SIZE);
        await vault.connect(user).executeTradeBatch(chunk);
      }

      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      expect(tradeExecutedEvents.length).to.equal(orders.length);
    });

    it("should match orders correctly with bulk matching market order", async function () {
      const BATCH_SIZE = 200;
      const sellOrderLength = Math.floor(BATCH_SIZE);
      // 200個の売り注文を出す
      for (let i = 0; i < sellOrderLength; i++) {
        const tradeRequest = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 1000,
          price: 10,
        });
        await vault.connect(trader).executeTradeBatch([tradeRequest]);
      }

      // 成行買い注文を実行
      const marketBuyOrder = await createTradeRequest({
        user: user,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0, // Buy
        amount: 2000000,
        price: 0, // Market order
      });
      await vault.connect(user).executeTradeBatch([marketBuyOrder]);

      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseTokenA,
        quoteTokenA
      );
      // base: + 0.000001 * 2000000 /10 = 0.002, quote: - 0.000001 * 0.01 * 2000000 = -0.00002
      expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.2', 18));
      expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.02', 6));

      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);
      // base: - 0.000001 * 2000000 /10 = -0.002, quote: + 0.000001 * 0.01 * 2000000 = 0.00002
      expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.2', 18));
      expect(traderBalanceQuote).to.equal(ethers.parseUnits('1', 6) + ethers.parseUnits('0.02', 6));
    });

    // 指値で板を食うマッチング(実際のシナリオテスト)
    it("should match orders correctly with bulk matching limit order", async function () {
      const BATCH_SIZE = 200;
      // まず売り注文を出す（買い注文のマッチング先として）
      // traderが板をならべる状況を作る
      // 1 - 200 の価格で板をならべる
      // base: 初項1000 公差1000 の等差数列で200個と考えれる = 1000 + 1000 * 199 = 200000 -> 0.2
      // quote: 初項1 公差1 の等差数列で200個 = 1 + 1 * 199 = 200 -> 0.0002
      const sellOrderLength = Math.floor(BATCH_SIZE);
      for (let i = 0; i < sellOrderLength; i++) {
        const tradeRequest = await createTradeRequest({
          user: trader,
          base: baseTokenA,
          quote: quoteTokenA,
          side: 1, // Sell
          amount: 1000,
          price: 1 + i,
        });
        await vault.connect(trader).executeTradeBatch([tradeRequest]);
      }

      const pairId = await matchingEngine.getPairId(
        await baseTokenA.getAddress(),
        await quoteTokenA.getAddress()
      );
      const sellOrders = await matchingEngine.getOrdersWithPagination(pairId, 1, 0, 200);
      expect(sellOrders[0].length).to.equal(200);

      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseTokenA,
        quote: quoteTokenA,
        side: 0, // Buy
        amount: 200000,
        price: 200,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest]);

      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );

      // 板を100個(MAX_MATCH_ITERATIONS)食うので100イベント
      expect(tradeExecutedEvents.length).to.equal(100);
      // userが食った板を考えると　 1-100までがマッチング対象
      // base: 初項1000 公差1000 の等差数列で100個 = 1000 + 1000 * 99 = 100000 -> 0.1
      // quote: 初項200の数列で200個 = 200 * 200 = 40000 -> 0.4
      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseTokenA,
        quoteTokenA
      );
      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseTokenA, quoteTokenA);


      expect(userBalanceBase).to.equal(ethers.parseUnits('1', 18) + ethers.parseUnits('0.1', 18));
      expect(userBalanceQuote).to.equal(ethers.parseUnits('1', 6) - ethers.parseUnits('0.4', 6));



      expect(traderBalanceBase).to.equal(ethers.parseUnits('1', 18) - ethers.parseUnits('0.2', 18));
      expect(traderBalanceQuote).to.equal(1050500);
    });
  });
});
