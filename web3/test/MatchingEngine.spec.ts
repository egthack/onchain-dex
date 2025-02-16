import { expect } from "chai";
import { ethers } from "hardhat";
import { MatchingEngine } from "../typechain-types";
import { Signer } from "ethers";

describe("MatchingEngine", function () {
  let matchingEngine: MatchingEngine;
  let admin: Signer;
  let addr1: Signer;
  let addr2: Signer;

  // Use each signer's address as a dummy token address
  let tokenA: string;
  let tokenB: string;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    admin = signers[0];
    addr1 = signers[1];
    addr2 = signers[2];

    tokenA = await admin.getAddress(); // Dummy tokenIn
    tokenB = await addr1.getAddress(); // Dummy tokenOut

    const MatchingEngineFactory = await ethers.getContractFactory(
      "MatchingEngine"
    );
    // makerFeeRate = 10, takerFeeRate = 15
    matchingEngine = await MatchingEngineFactory.deploy(10, 15);
    await matchingEngine.waitForDeployment();

    // Admin adds trading pair (tokenA, tokenB) with decimals 18, 18
    await matchingEngine.connect(admin).addPair(tokenA, tokenB, 18, 18);
  });

  describe("Pair Management", function () {
    it("should add a new pair and get pair information correctly", async function () {
      const pairResult = await matchingEngine.getPair(0);
      expect(pairResult.pairId).to.exist;
      expect(pairResult.tokenz[0]).to.equal(tokenA);
      expect(pairResult.tokenz[1]).to.equal(tokenB);
      expect(pairResult.decimals[0]).to.equal(18);
      expect(pairResult.decimals[1]).to.equal(18);
    });

    it("should return an array of pairs with getPairs()", async function () {
      const tokenC = await addr1.getAddress();
      const tokenD = await addr2.getAddress();
      await matchingEngine.connect(admin).addPair(tokenC, tokenD, 8, 8);

      const pairs = await matchingEngine.getPairs(2, 0);
      expect(pairs.length).to.equal(2);
      expect(pairs[0].tokenz[0]).to.equal(tokenA);
      expect(pairs[0].tokenz[1]).to.equal(tokenB);
      expect(pairs[1].tokenz[0]).to.equal(tokenC);
      expect(pairs[1].tokenz[1]).to.equal(tokenD);
    });
  });

  describe("Order Creation", function () {
    it("should create a buy order properly", async function () {
      // Buy order: OrderSide.Buy = 0, price 150, amount 50
      const tx = await matchingEngine
        .connect(addr1)
        .placeOrder(tokenA, tokenB, 0, 150, 50);
      const receipt = await tx.wait();
      const parsedEvents = receipt?.logs
        ?.map((log: any) => {
          try {
            return matchingEngine.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter((e) => e !== null);
      const event = parsedEvents?.find((e: any) => e.name === "OrderPlaced");
      expect(event, "OrderPlaced event not found").to.exist;
      if (!event) {
        throw new Error("OrderPlaced event not found");
      }
      const { orderId, user, side, tokenIn, tokenOut, price, amount } =
        event.args;
      expect(orderId).to.equal(0);
      expect(user).to.equal(await addr1.getAddress());
      expect(side).to.equal(0);
      expect(tokenIn).to.equal(tokenA);
      expect(tokenOut).to.equal(tokenB);
      expect(price).to.equal(150);
      expect(amount).to.equal(50);

      const order = await matchingEngine.orders(0);
      expect(order.id).to.equal(0);
      expect(order.user).to.equal(await addr1.getAddress());
      expect(order.tokenIn).to.equal(tokenA);
      expect(order.tokenOut).to.equal(tokenB);
      expect(order.price).to.equal(150);
      expect(order.amount).to.equal(50);
      expect(order.active).to.equal(true);
    });

    it("should create a sell order properly", async function () {
      // Sell order: OrderSide.Sell = 1, price 100, amount 30
      const tx = await matchingEngine
        .connect(addr1)
        .placeOrder(tokenA, tokenB, 1, 100, 30);
      const receipt = await tx.wait();
      const parsedEvents = receipt?.logs
        ?.map((log: any) => {
          try {
            return matchingEngine.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter((e) => e !== null);
      const event = parsedEvents?.find((e: any) => e.name === "OrderPlaced");
      expect(event, "OrderPlaced event not found").to.exist;
      if (!event) {
        throw new Error("OrderPlaced event not found");
      }
      const { orderId, user, side, tokenIn, tokenOut, price, amount } =
        event.args;
      expect(orderId).to.equal(0);
      expect(user).to.equal(await addr1.getAddress());
      expect(side).to.equal(1);
      expect(tokenIn).to.equal(tokenA);
      expect(tokenOut).to.equal(tokenB);
      expect(price).to.equal(100);
      expect(amount).to.equal(30);

      const order = await matchingEngine.orders(0);
      expect(order.id).to.equal(0);
      expect(order.user).to.equal(await addr1.getAddress());
      expect(order.tokenIn).to.equal(tokenA);
      expect(order.tokenOut).to.equal(tokenB);
      expect(order.price).to.equal(100);
      expect(order.amount).to.equal(30);
      expect(order.active).to.equal(true);
    });
  });

  describe("Order Best Retrieval", function () {
    it("should retrieve the best order for a given side", async function () {
      // Place two buy orders: first order with price 150, second order with price 160
      await matchingEngine
        .connect(addr1)
        .placeOrder(tokenA, tokenB, 0, 150, 50);
      await matchingEngine
        .connect(addr2)
        .placeOrder(tokenA, tokenB, 0, 160, 30);

      const pairId = await matchingEngine.getPairId(tokenA, tokenB);
      const bestBuy = await matchingEngine.getBestOrder(pairId, 0);
      // Buy order is the highest value, so the second order (orderId = 1, price 160) should be returned
      expect(bestBuy.orderId).to.equal(1);
      expect(bestBuy.price).to.equal(160);

      // Place two sell orders: first order with price 90, second order with price 80
      await matchingEngine.connect(addr1).placeOrder(tokenA, tokenB, 1, 90, 40);
      await matchingEngine.connect(addr2).placeOrder(tokenA, tokenB, 1, 80, 20);

      const bestSell = await matchingEngine.getBestOrder(pairId, 1);
      // Sell order is the lowest value, so the second order (orderId = 3, price 80) should be returned
      expect(bestSell.orderId).to.equal(3);
      expect(bestSell.price).to.equal(80);
    });
  });
});
