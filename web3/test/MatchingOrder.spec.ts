import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, TradingVault, MatchingEngine } from "../typechain-types";
import { Signer } from "ethers";
import { createTradeRequest, depositToken } from "./helpers/tradeHelper";

describe("MatchingEngine Order Issues", function () {
  let owner: Signer;
  let seller: Signer;
  let buyer: Signer;
  let baseToken: MockERC20;
  let quoteToken: MockERC20;
  let vault: TradingVault;
  let engine: MatchingEngine;
  let pairId: string;

  // トラッキング用変数
  let sellOrderId: number;
  let buyOrderId: number;

  const deployFixture = async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    seller = signers[1];
    buyer = signers[2];

    // Deploy tokens
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    baseToken = await TokenFactory.connect(owner).deploy(
      "Base Token",
      "BASE",
      1000000000,
      18
    );
    await baseToken.waitForDeployment();
    
    quoteToken = await TokenFactory.connect(owner).deploy(
      "Quote Token",
      "QUOTE",
      1000000000,
      6
    );
    await quoteToken.waitForDeployment();

    // Deploy MatchingEngine
    const EngineFactory = await ethers.getContractFactory("MatchingEngine");
    engine = await EngineFactory.connect(owner).deploy(0,0); // maker fee 0%, taker fee 0%
    await engine.waitForDeployment();

    // Add trading pair
    await engine.connect(owner).addPair(
      await baseToken.getAddress(),
      await quoteToken.getAddress()
    );

    // Get pair ID
    pairId = await engine.getPairId(
      await baseToken.getAddress(),
      await quoteToken.getAddress()
    );

    // Deploy TradingVault with engine address
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vault = await VaultFactory.connect(owner).deploy(await engine.getAddress());
    await vault.waitForDeployment();

    // Set vault address in engine
    await engine.connect(owner).setVaultAddress(await vault.getAddress());

    // Transfer tokens to seller and buyer
    await baseToken.connect(owner).transfer(
      await seller.getAddress(),
      ethers.parseUnits("1000", 18)
    );
    await quoteToken.connect(owner).transfer(
      await buyer.getAddress(),
      ethers.parseUnits("1000", 6)
    );

    // Deposit tokens to vault
    await baseToken.connect(seller).approve(
      await vault.getAddress(),
      ethers.parseUnits("1000", 18)
    );
    await vault.connect(seller).deposit(
      await baseToken.getAddress(),
      ethers.parseUnits("1000", 18)
    );

    await quoteToken.connect(buyer).approve(
      await vault.getAddress(),
      ethers.parseUnits("1000", 6)
    );
    await vault.connect(buyer).deposit(
      await quoteToken.getAddress(),
      ethers.parseUnits("1000", 6)
    );

    return {
      owner,
      seller,
      buyer,
      baseToken,
      quoteToken,
      vault,
      engine,
      pairId,
    };
  };

  beforeEach(async function () {
    await deployFixture();
  });

  // 価格ツリーから消えない問題を再現するテスト
  describe("Price Tree Management Issues", function () {
    it("should reproduce issue: price level remains in tree after all orders are cancelled", async function () {
      // 同じ価格レベルに複数の売り注文を出す
      console.log("Placing first sell order...");
      const sellRequest1 = await createTradeRequest({
        user: seller,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 100000, // 0.1 BASE
        price: 200, // 2.00 QUOTE
      });

      // 最初の売り注文を実行
      await vault.connect(seller).executeTradeBatch([sellRequest1]);
      sellOrderId = 0; // 最初の注文のID

      // 現在のベスト売り注文価格を確認
      const bestSellPriceBefore = await engine.getBestSellPrice(pairId);
      console.log("Best sell price after first order:", bestSellPriceBefore);
      expect(bestSellPriceBefore).to.equal(200);

      // 同じ価格レベルに2つ目の売り注文を出す
      console.log("Placing second sell order at same price...");
      const sellRequest2 = await createTradeRequest({
        user: seller,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 50000, // 0.05 BASE
        price: 200, // 2.00 QUOTE (同じ価格)
      });

      // 2つ目の売り注文を実行
      await vault.connect(seller).executeTradeBatch([sellRequest2]);
      
      // 両方の注文をキャンセルする
      console.log("Cancelling both orders...");
      await vault.connect(seller).cancelOrder(0);
      await vault.connect(seller).cancelOrder(1);

      // このタイミングでベストセル価格はもうないはずだが、
      // バグがあるとまだ価格ツリーに残っている
      const bestSellPriceAfter = await engine.getBestSellPrice(pairId);
      console.log("Best sell price after cancellations:", bestSellPriceAfter);
      
      // バグがある場合、ここでまだ価格がツリーに残っている
      // 修正後は0になるはず
      // バグの再現のため、敢えて失敗させる検証
      expect(bestSellPriceAfter).to.equal(0, "Price should be removed from tree when all orders are cancelled");
    });

    it("should reproduce issue: matched orders do not remove price from tree", async function () {
      // まず売り注文を出す
      console.log("Placing sell order...");
      const sellRequest = await createTradeRequest({
        user: seller,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 100000, // 0.1 BASE
        price: 200, // 2.00 QUOTE
      });

      await vault.connect(seller).executeTradeBatch([sellRequest]);
      sellOrderId = 0;

      // 売り注文と一致する買い注文を出す
      console.log("Placing matching buy order...");
      const buyRequest = await createTradeRequest({
        user: buyer,
        base: baseToken,
        quote: quoteToken,
        side: 0, // Buy
        amount: 100000, // 0.1 BASE (完全一致)
        price: 200, // 2.00 QUOTE
      });

      // 買い注文を実行 (これにより注文がマッチングされるはず)
      await vault.connect(buyer).executeTradeBatch([buyRequest]);
      buyOrderId = 1;

      // 注文約定後、ベスト売り価格をチェック
      // 全ての注文が約定したため、売り注文はもうないはず
      const bestSellPriceAfter = await engine.getBestSellPrice(pairId);
      console.log("Best sell price after matching:", bestSellPriceAfter);
      
      // バグがある場合、ここでまだ価格がツリーに残っている
      // 修正後は0になるはず
      expect(bestSellPriceAfter).to.equal(0, "Price should be removed from tree when all orders are matched");
    });

    it("should reproduce issue: inactive orders not properly cleaned up", async function () {
      // 複数の異なる価格で売り注文を出す
      console.log("Placing multiple sell orders at different prices...");
      
      // 価格200の注文
      const sellRequest1 = await createTradeRequest({
        user: seller,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 100000, // 0.1 BASE
        price: 200, // 2.00 QUOTE
      });
      await vault.connect(seller).executeTradeBatch([sellRequest1]);
      
      // 価格210の注文
      const sellRequest2 = await createTradeRequest({
        user: seller,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 50000, // 0.05 BASE
        price: 210, // 2.10 QUOTE
      });
      await vault.connect(seller).executeTradeBatch([sellRequest2]);
      
      // ベストセル価格は200のはず
      const bestSellPrice1 = await engine.getBestSellPrice(pairId);
      console.log("Best sell price initially:", bestSellPrice1);
      expect(bestSellPrice1).to.equal(200);
      
      // 価格200の注文をキャンセル
      console.log("Cancelling order at price 200...");
      await vault.connect(seller).cancelOrder(0);
      
      // ベストセル価格は210になるはず
      const bestSellPrice2 = await engine.getBestSellPrice(pairId);
      console.log("Best sell price after cancellation:", bestSellPrice2);
      expect(bestSellPrice2).to.equal(210, "Best price should update when lower price orders are cancelled");
      
      // 価格210の注文もキャンセル
      console.log("Cancelling order at price 210...");
      await vault.connect(seller).cancelOrder(1);
      
      // ベストセル価格は0になるはず (注文がない)
      const bestSellPrice3 = await engine.getBestSellPrice(pairId);
      console.log("Best sell price after all cancellations:", bestSellPrice3);
      expect(bestSellPrice3).to.equal(0, "Best price should be 0 when all orders are cancelled");
    });
  });

  // 注文マッチングの問題を再現するテスト
  describe("Order Matching Issues", function () {
    it("should reproduce issue: orders not matching properly", async function () {
      // まず売り注文を出す
      console.log("Placing sell order...");
      const sellRequest = await createTradeRequest({
        user: seller,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 100000, // 0.1 BASE
        price: 200, // 2.00 QUOTE
      });

      await vault.connect(seller).executeTradeBatch([sellRequest]);
      
      // 売り注文が処理される前にセラーの残高を確認
      const sellerBaseBefore = await vault.getBalance(
        await seller.getAddress(),
        await baseToken.getAddress()
      );
      
      // 買い注文を出す (価格が売り注文よりも高いので確実にマッチするはず)
      console.log("Placing matching buy order with higher price...");
      const buyRequest = await createTradeRequest({
        user: buyer,
        base: baseToken,
        quote: quoteToken,
        side: 0, // Buy
        amount: 100000, // 0.1 BASE (完全一致)
        price: 220, // 2.20 QUOTE (売り注文よりも高い)
      });

      // 買い注文を実行
      await vault.connect(buyer).executeTradeBatch([buyRequest]);
      
      // 約定後のセラーのベーストークン残高を確認
      const sellerBaseAfter = await vault.getBalance(
        await seller.getAddress(),
        await baseToken.getAddress()
      );
      
      // 0.1 BASEが売られたので、残高が減っているはず
      const expectedBaseDiff = ethers.parseUnits("0.1", 18);
      const actualBaseDiff = sellerBaseBefore - sellerBaseAfter;
      console.log("Expected Base diff:", expectedBaseDiff);
      console.log("Actual Base diff:", actualBaseDiff);
      
      // バグがあると、注文がマッチングされていない可能性がある
      expect(actualBaseDiff).to.equal(expectedBaseDiff, "Orders should match and balance should decrease");
      
      // 売り注文がマッチングされて非アクティブになっているか確認
      const sellOrder = await engine.getOrder(0);
      expect(sellOrder.active).to.equal(false, "Sell order should be inactive after matching");
      
      // マッチング後に価格ツリーから価格が削除されているか確認
      const bestSellPriceAfter = await engine.getBestSellPrice(pairId);
      expect(bestSellPriceAfter).to.equal(0, "Price should be removed from tree after matching");
    });

    it("should reproduce issue: partial fills not updating price tree correctly", async function () {
      // 大きめの売り注文を出す
      console.log("Placing large sell order...");
      const sellRequest = await createTradeRequest({
        user: seller,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 200000, // 0.2 BASE
        price: 200, // 2.00 QUOTE
      });

      await vault.connect(seller).executeTradeBatch([sellRequest]);
      
      // 売り注文の一部だけをマッチングする買い注文を出す
      console.log("Placing smaller buy order for partial match...");
      const buyRequest = await createTradeRequest({
        user: buyer,
        base: baseToken,
        quote: quoteToken,
        side: 0, // Buy
        amount: 100000, // 0.1 BASE (売り注文の半分)
        price: 200, // 2.00 QUOTE
      });

      // 買い注文を実行
      await vault.connect(buyer).executeTradeBatch([buyRequest]);
      
      // 部分約定後の売り注文の状態を確認
      const sellOrder = await engine.getOrder(0);
      console.log("Sell order active after partial fill:", sellOrder.active);
      console.log("Sell order remaining amount:", sellOrder.amount);
      
      // まだ注文量が残っているので、注文はアクティブなはず
      expect(sellOrder.active).to.equal(true, "Sell order should still be active after partial fill");
      
      // 残り量は0.1 BASEのはず
      expect(sellOrder.amount).to.equal(100000, "Remaining amount should be half of original");
      
      // 価格ツリーにはまだ売り注文の価格があるはず
      const bestSellPrice = await engine.getBestSellPrice(pairId);
      console.log("Best sell price after partial fill:", bestSellPrice);
      expect(bestSellPrice).to.equal(200, "Price should still be in tree after partial fill");
      
      // 残りの量をマッチングする買い注文を出す
      console.log("Placing second buy order to match remaining amount...");
      const buyRequest2 = await createTradeRequest({
        user: buyer,
        base: baseToken,
        quote: quoteToken,
        side: 0, // Buy
        amount: 100000, // 残りの0.1 BASE
        price: 200, // 2.00 QUOTE
      });

      // 2つ目の買い注文を実行
      await vault.connect(buyer).executeTradeBatch([buyRequest2]);
      
      // 完全約定後の売り注文の状態を確認
      const sellOrderAfter = await engine.getOrder(0);
      console.log("Sell order active after complete fill:", sellOrderAfter.active);
      console.log("Sell order final amount:", sellOrderAfter.amount);
      
      // 注文は完全に約定したので、非アクティブなはず
      expect(sellOrderAfter.active).to.equal(false, "Sell order should be inactive after complete fill");
      
      // 価格ツリーから価格が削除されているはず
      const bestSellPriceAfter = await engine.getBestSellPrice(pairId);
      console.log("Best sell price after complete fill:", bestSellPriceAfter);
      expect(bestSellPriceAfter).to.equal(0, "Price should be removed from tree after complete fill");
    });
  });

  // マーケットオーダー (price=0) の問題を再現するテスト
  describe("Market Order Issues", function () {
    it("should reproduce issue: market orders not properly matched", async function () {
      // まず売り注文を出す
      console.log("Placing sell order...");
      const sellRequest = await createTradeRequest({
        user: seller,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 100000, // 0.1 BASE
        price: 200, // 2.00 QUOTE
      });

      await vault.connect(seller).executeTradeBatch([sellRequest]);
      
      // 買い手の初期QUOTE残高を確認
      const buyerQuoteBefore = await vault.getBalance(
        await buyer.getAddress(),
        await quoteToken.getAddress()
      );
      console.log("Buyer QUOTE balance before:", buyerQuoteBefore);
      
      // マーケットオーダー（price=0）で買い注文を出す
      console.log("Placing market buy order (price=0)...");
      const marketBuyRequest = await createTradeRequest({
        user: buyer,
        base: baseToken,
        quote: quoteToken,
        side: 0, // Buy
        amount: 100000, // 0.1 BASE
        price: 0, // マーケットオーダー
      });

      // マーケット買い注文を実行
      await vault.connect(buyer).executeTradeBatch([marketBuyRequest]);
      
      // 約定後の買い手のQUOTE残高を確認
      const buyerQuoteAfter = await vault.getBalance(
        await buyer.getAddress(),
        await quoteToken.getAddress()
      );
      console.log("Buyer QUOTE balance after:", buyerQuoteAfter);
      
      // 0.1 BASE * 2.00 QUOTE = 0.2 QUOTE が使われたはず
      // 手数料も考慮: 0.2 QUOTE + 手数料
      const expectedQuoteDiff = ethers.parseUnits("0.2", 6) + (ethers.parseUnits("0.2", 6) * 15n / 10000n);
      const actualQuoteDiff = buyerQuoteBefore - buyerQuoteAfter;
      console.log("Expected QUOTE diff:", expectedQuoteDiff);
      console.log("Actual QUOTE diff:", actualQuoteDiff);
      
      // バグがあると、マーケットオーダーが正しく約定していない可能性
      expect(actualQuoteDiff).to.be.gte(expectedQuoteDiff, "Market order should match at the limit price or better");
      
      // 売り注文が非アクティブになっているか確認
      const sellOrderAfter = await engine.getOrder(0);
      expect(sellOrderAfter.active).to.equal(false, "Sell order should be inactive after matching with market order");
      
      // 価格ツリーからそのレベルが削除されているか確認
      const bestSellPriceAfter = await engine.getBestSellPrice(pairId);
      expect(bestSellPriceAfter).to.equal(0, "Price should be removed from tree after matching with market order");
    });
  });
}); 