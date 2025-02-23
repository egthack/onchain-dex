import { expect } from "chai";
import { ethers } from "hardhat";
import { MatchingEngine, TradingVault, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";
import {
  createTradeRequest,
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
  let baseToken: MockERC20;
  let quoteToken: MockERC20;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    admin = signers[0];
    user = signers[1];
    trader = signers[2];
    trader2 = signers[3];
    // --- ERC20 トークンのデプロイ (MockERC20) ---
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    // BTCとかETHとか
    baseToken = await TokenFactory.connect(admin).deploy(
      "Base Token",
      "BASE",
      100000000
    );
    await baseToken.waitForDeployment();
    // USDとかJPYとか
    quoteToken = await TokenFactory.connect(admin).deploy(
      "Quote Token",
      "QUOTE",
      100000000
    );
    await quoteToken.waitForDeployment();

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
    // baseToken を base、quoteToken を quote として decimals は両方とも 18 とする
    await matchingEngine
      .connect(admin)
      .addPair(
        await baseToken.getAddress(),
        await quoteToken.getAddress(),
        18,
        18
      );

    await baseToken.connect(admin).transfer(await user.getAddress(), 10000);
    await baseToken.connect(user).approve(await vault.getAddress(), 10000);
    await vault.connect(user).deposit(await baseToken.getAddress(), 10000);

    await baseToken.connect(admin).transfer(await trader.getAddress(), 10000);
    await baseToken.connect(trader).approve(await vault.getAddress(), 10000);
    await vault.connect(trader).deposit(await baseToken.getAddress(), 10000);

    // trader2 の初期設定を追加
    await baseToken.connect(admin).transfer(await trader2.getAddress(), 10000);
    await baseToken.connect(trader2).approve(await vault.getAddress(), 10000);
    await vault.connect(trader2).deposit(await baseToken.getAddress(), 10000);

    await quoteToken.connect(admin).transfer(await user.getAddress(), 10000);
    await quoteToken.connect(user).approve(await vault.getAddress(), 10000);
    await vault.connect(user).deposit(await quoteToken.getAddress(), 10000);

    await quoteToken.connect(admin).transfer(await trader.getAddress(), 10000);
    await quoteToken.connect(trader).approve(await vault.getAddress(), 10000);
    await vault.connect(trader).deposit(await quoteToken.getAddress(), 10000);

    // trader2 の初期設定を追加
    await quoteToken.connect(admin).transfer(await trader2.getAddress(), 10000);
    await quoteToken.connect(trader2).approve(await vault.getAddress(), 10000);
    await vault.connect(trader2).deposit(await quoteToken.getAddress(), 10000);
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
      await matchingEngine
        .connect(admin)
        .addPair(
          await quoteToken.getAddress(),
          await baseToken.getAddress(),
          8,
          8
        );
      const pairs = await matchingEngine.getPairsWithPagination(0, 10);
      expect(pairs.length).to.equal(2);

      // ペアの内容検証
      expect(pairs[0].tokenz[0]).to.equal(await baseToken.getAddress());
      expect(pairs[0].tokenz[1]).to.equal(await quoteToken.getAddress());
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
        price: 1,
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
        price: 1,
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
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 30,
        price: 1,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      // 2つ目： price = 2, amount = 100
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 5,
        price: 2,
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      // --- best order の検証 ---
      const pairId = await matchingEngine.getPairId(
        await baseToken.getAddress(),
        await quoteToken.getAddress()
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
        base: baseToken,
        quote: quoteToken,
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
      // baseToken を 100 トークンprice 2で買うのでquoteToken 200トークンが出る
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 100,
        price: 2,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      // baseToken を 100 トークンprice 2で売るのでquoteToken 200トークンが入る
      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseToken,
        quote: quoteToken,
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

      // user baseToken: 10100, quoteToken: 9800
      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseToken,
        quoteToken
      );
      expect(userBalanceBase).to.equal(10100);
      expect(userBalanceQuote).to.equal(9800);
      // trader baseToken: 9900, quoteToken: 10200
      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseToken, quoteToken);
      expect(traderBalanceBase).to.equal(9900);
      expect(traderBalanceQuote).to.equal(10200);
    });

    // 全量マッチング
    it("should match orders correctly with sell order", async function () {
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 1,
        amount: 100,
        price: 2,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseToken,
        quote: quoteToken,
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

      // user baseToken: 9900, quoteToken: 10200
      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseToken,
        quoteToken
      );
      expect(userBalanceBase).to.equal(9900);
      expect(userBalanceQuote).to.equal(10200);
      // trader baseToken: 10100, quoteToken: 9800
      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseToken, quoteToken);
      expect(traderBalanceBase).to.equal(10100);
      expect(traderBalanceQuote).to.equal(9800);
    });

    // 部分マッチング
    it("should match orders with partial fill", async function () {
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 100,
        price: 1,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseToken,
        quote: quoteToken,
        side: 1,
        amount: 50,
        price: 1,
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      expect(tradeExecutedEvents.length).to.equal(1);

      // user baseToken: 10050, quoteToken: 9900
      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseToken,
        quoteToken
      );
      expect(userBalanceBase).to.equal(10050);
      expect(userBalanceQuote).to.equal(9900);
      // trader baseToken: 9950, quoteToken: 10050
      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseToken, quoteToken);
      expect(traderBalanceBase).to.equal(9950);
      expect(traderBalanceQuote).to.equal(10050);

      // 繰り返しマッチング
      const tradeRequest3 = await createTradeRequest({
        user: trader,
        base: baseToken,
        quote: quoteToken,
        side: 1,
        amount: 50,
        price: 1,
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest3]);

      const tradeExecutedEvents2 = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      expect(tradeExecutedEvents2.length).to.equal(2);

      // user baseToken: 10100, quoteToken: 9900
      const {
        userBalanceBase: userBalanceBase2,
        userBalanceQuote: userBalanceQuote2,
      } = await getTokenBalances(vault, user, baseToken, quoteToken);
      expect(userBalanceBase2).to.equal(10100);
      expect(userBalanceQuote2).to.equal(9900);

      // trader baseToken: 9900, quoteToken: 10100
      const {
        userBalanceBase: traderBalanceBase2,
        userBalanceQuote: traderBalanceQuote2,
      } = await getTokenBalances(vault, trader, baseToken, quoteToken);
      expect(traderBalanceBase2).to.equal(9900);
      expect(traderBalanceQuote2).to.equal(10100);
    });

    // 成行注文
    it("should match orders with market order", async function () {
      const tradeRequest1 = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 100,
        price: 1,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest1]);

      const tradeRequest2 = await createTradeRequest({
        user: trader,
        base: baseToken,
        quote: quoteToken,
        side: 1,
        amount: 100,
        price: 1,
      });
      await vault.connect(trader).executeTradeBatch([tradeRequest2]);

      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      expect(tradeExecutedEvents.length).to.equal(1);
    });

    describe("Market Orders", function () {
      it("should execute market buy order against existing sell orders", async function () {
        // 指値売り注文を作成
        const limitSellOrder = await createTradeRequest({
          user: trader,
          base: baseToken,
          quote: quoteToken,
          side: 1, // Sell
          amount: 100,
          price: 2,
        });
        await vault.connect(trader).executeTradeBatch([limitSellOrder]);
        // 成行買い注文を実行
        const marketBuyOrder = await createTradeRequest({
          user: user,
          base: baseToken,
          quote: quoteToken,
          side: 0, // Buy
          amount: 50,
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
          baseToken,
          quoteToken
        );
        // base: 10025(50/2=25 bought), quote: 9950(50 used)
        expect(userBalanceBase).to.equal(10025);
        expect(userBalanceQuote).to.equal(9950);
        const {
          userBalanceBase: traderBalanceBase,
          userBalanceQuote: traderBalanceQuote,
        } = await getTokenBalances(vault, trader, baseToken, quoteToken);
        // base: 9900(75 locked, 25 sold), quote: 10050(50 returned)
        expect(traderBalanceBase).to.equal(9900);
        expect(traderBalanceQuote).to.equal(10050);

        // trader の50 locked 注文をキャンセルして返金される金額を確認
        await vault.connect(trader).cancelOrder(0);
        const {
          userBalanceBase: traderBalanceBase2,
          userBalanceQuote: traderBalanceQuote2,
        } = await getTokenBalances(vault, trader, baseToken, quoteToken);
        // base: 9975(9900 + 25 bought 50 locked), quote: 10050(50 returned)
        expect(traderBalanceBase2).to.equal(9975);
        expect(traderBalanceQuote2).to.equal(10050);
      });

      // 成行注文後、オーダーブックの最良売り注文が消えているかを検証するテスト
      it("should execute market sell order against existing sell orders and not match all", async function () {
        // 指値売り注文を作成
        const limitSellOrder = await createTradeRequest({
          user: trader,
          base: baseToken,
          quote: quoteToken,
          side: 1, // Sell
          amount: 100,
          price: 2,
        });
        await vault.connect(trader).executeTradeBatch([limitSellOrder]);
        // 成行買い注文を実行
        const marketSellOrder = await createTradeRequest({
          user: user,
          base: baseToken,
          quote: quoteToken,
          side: 0, // Buy
          amount: 300,
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
          baseToken,
          quoteToken
        );
        const {
          userBalanceBase: traderBalanceBase,
          userBalanceQuote: traderBalanceQuote,
        } = await getTokenBalances(vault, trader, baseToken, quoteToken);

        // base: 9900(100 returned), quote: 10200(200 returned)
        expect(userBalanceBase).to.equal(10100);
        expect(userBalanceQuote).to.equal(9800);
        // base: 10100(100 locked), quote: 9800(200 locked)
        expect(traderBalanceBase).to.equal(9900);
        expect(traderBalanceQuote).to.equal(10200);
      });

      it("should remove best sell order from orderbook after market buy execution", async function () {
        // 最良売り注文を作成 (price = 1)
        const bestSellOrder = await createTradeRequest({
          user: trader,
          base: baseToken,
          quote: quoteToken,
          side: 1, // Sell
          amount: 100,
          price: 1,
        });
        await vault.connect(trader).executeTradeBatch([bestSellOrder]);

        // 次に高い売り注文を作成 (price = 2)
        const secondSellOrder = await createTradeRequest({
          user: trader2,
          base: baseToken,
          quote: quoteToken,
          side: 1, // Sell
          amount: 100,
          price: 2,
        });
        await vault.connect(trader2).executeTradeBatch([secondSellOrder]);

        // オーダーブックの最良売り注文を確認
        const pairId = await matchingEngine.getPairId(
          await baseToken.getAddress(),
          await quoteToken.getAddress()
        );
        const bestSellBefore = await matchingEngine.getBestOrder(pairId, 1); // side = 1 for sell
        expect(bestSellBefore.price).to.equal(1);

        // 成行買い注文を実行
        const marketBuyOrder = await createTradeRequest({
          user: user,
          base: baseToken,
          quote: quoteToken,
          side: 0, // Buy
          amount: 100,
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
        expect(bestSellAfter.price).to.equal(2); // 次に高い注文が最良売り注文になっているはず

        // 残高確認
        const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
          vault,
          user,
          baseToken,
          quoteToken
        );
        expect(userBalanceBase).to.equal(10100); // 初期値10000 + 買った100
        expect(userBalanceQuote).to.equal(9900); // 初期値10000 - 支払った100
      });
    });
  });

  describe("Bulk Matching", function () {
    beforeEach(async function () {
      const requiredAmount = 190000; // 最初のbeforeEachと合わせて200000にする
      // traderにも同じ量を付与
      await baseToken
        .connect(admin)
        .transfer(await user.getAddress(), requiredAmount);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), requiredAmount);
      await vault
        .connect(user)
        .deposit(await baseToken.getAddress(), requiredAmount);

      await quoteToken
        .connect(admin)
        .transfer(await user.getAddress(), requiredAmount);
      await quoteToken
        .connect(user)
        .approve(await vault.getAddress(), requiredAmount);
      await vault
        .connect(user)
        .deposit(await quoteToken.getAddress(), requiredAmount);

      // traderにも必要な量を付与
      await baseToken
        .connect(admin)
        .transfer(await trader.getAddress(), requiredAmount);
      await baseToken
        .connect(trader)
        .approve(await vault.getAddress(), requiredAmount);
      await vault
        .connect(trader)
        .deposit(await baseToken.getAddress(), requiredAmount);

      await quoteToken
        .connect(admin)
        .transfer(await trader.getAddress(), requiredAmount);
      await quoteToken
        .connect(trader)
        .approve(await vault.getAddress(), requiredAmount);
      await vault
        .connect(trader)
        .deposit(await quoteToken.getAddress(), requiredAmount);

      // trader2にも同じ量を付与
      await baseToken
        .connect(admin)
        .transfer(await trader2.getAddress(), requiredAmount);
      await baseToken
        .connect(trader2)
        .approve(await vault.getAddress(), requiredAmount);
      await vault
        .connect(trader2)
        .deposit(await baseToken.getAddress(), requiredAmount);

      await quoteToken
        .connect(admin)
        .transfer(await trader2.getAddress(), requiredAmount);
      await quoteToken
        .connect(trader2)
        .approve(await vault.getAddress(), requiredAmount);
      await vault
        .connect(trader2)
        .deposit(await quoteToken.getAddress(), requiredAmount);
    });

    it("should match orders correctly with bulk matching", async function () {
      // MAX_MATCH_ITERATIONSに合わせてバッチサイズを調整
      const BATCH_SIZE = 50;
      const sellOrderLength = Math.floor(BATCH_SIZE);
      const traderRequests = [];
      // 50個の注文を一気に出す
      for (let i = 0; i < sellOrderLength; i++) {
        const tradeRequest = await createTradeRequest({
          user: trader,
          base: baseToken,
          quote: quoteToken,
          side: 1, // Sell
          amount: 100,
          price: 1,
        });
        traderRequests.push(tradeRequest);
      }
      await vault.connect(trader).executeTradeBatch(traderRequests);

      // 買い注文を出す
      const orders = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        const tradeRequest = await createTradeRequest({
          user: user,
          base: baseToken,
          quote: quoteToken,
          side: 0, // Buy
          amount: 100,
          price: 1,
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
      // 200個の売り注文を出す（各100ずつ）
      for (let i = 0; i < sellOrderLength; i++) {
        const tradeRequest = await createTradeRequest({
          user: trader,
          base: baseToken,
          quote: quoteToken,
          side: 1, // Sell
          amount: 100,
          price: 1,
        });
        await vault.connect(trader).executeTradeBatch([tradeRequest]);
      }

      // 成行買い注文を実行
      const marketBuyOrder = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 0, // Buy
        amount: 20000,
        price: 0, // Market order
      });
      await vault.connect(user).executeTradeBatch([marketBuyOrder]);

      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseToken,
        quoteToken
      );
      // 200000(今回付与) + 20000(成行買い注文約定) = 220000
      expect(userBalanceBase).to.equal(220000);
      // 200000(今回付与) - 20000(成行買い注文約定 × 価格1) = 180000
      expect(userBalanceQuote).to.equal(180000);

      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseToken, quoteToken);
      // 200000(今回付与) - 20000(売り注文約定) = 180000
      expect(traderBalanceBase).to.equal(180000);
      // 200000(今回付与) + 20000(売り注文約定 × 価格1) = 220000
      expect(traderBalanceQuote).to.equal(220000);
    });

    // 指値で板を食うマッチング
    it("should match orders correctly with bulk matching limit order", async function () {
      const BATCH_SIZE = 200;
      // まず売り注文を出す（買い注文のマッチング先として）
      // traderが板をならべる状況を作る
      // 1 - 200 の価格で板をならべる,合計amount 2000
      const sellOrderLength = Math.floor(BATCH_SIZE);
      for (let i = 0; i < sellOrderLength; i++) {
        const tradeRequest = await createTradeRequest({
          user: trader,
          base: baseToken,
          quote: quoteToken,
          side: 1, // Sell
          amount: 10,
          price: 1 + i,
        });
        await vault.connect(trader).executeTradeBatch([tradeRequest]);
      }

      // userが板を食う　 1-20までがマッチング対象
      // 合計 2000 * 200 = 4000000がhi
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 0, // Buy
        amount: 1000,
        price: 200,
      });
      await vault.connect(user).executeTradeBatch([tradeRequest]);

      const tradeExecutedEvents = await getContractEvents(
        matchingEngine,
        matchingEngine.filters.TradeExecuted
      );
      // 10の板を100個食うので100イベント
      expect(tradeExecutedEvents.length).to.equal(100);
      const { userBalanceBase, userBalanceQuote } = await getTokenBalances(
        vault,
        user,
        baseToken,
        quoteToken
      );
      // 200000(初期保有量) + 1000(userが食った量) = 201000
      expect(userBalanceBase).to.equal(201000);
      // 200000(初期保有量) - 200000(userが食った量) = 0
      expect(userBalanceQuote).to.equal(0);

      const {
        userBalanceBase: traderBalanceBase,
        userBalanceQuote: traderBalanceQuote,
      } = await getTokenBalances(vault, trader, baseToken, quoteToken);
      // 200000(初期保有量) - 2000(locked) = 198000
      expect(traderBalanceBase).to.equal(198000);
      // 並べた板のうち、価格が低いものからamountが1000になるまで、すなわちpriceが1-100までマッチしたはず
      // １から100までの交差数列の和 × amount = 10 × (100 × 101) / 2 = 50500
      // 200000(初期保有量) + 50500 = 250500
      expect(traderBalanceQuote).to.equal(250500);
    });
  });
});
