import { expect } from "chai";
import { ethers } from "hardhat";
import { DEX } from "../typechain-types";
import { Signer } from "ethers";

describe("DEX", function () {
  let dex: DEX;
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    addr1 = signers[1];
    addr2 = signers[2];

    const DEXFactory = await ethers.getContractFactory("DEX");
    dex = await DEXFactory.deploy();
    await dex.waitForDeployment();
  });

  describe("Order Creation", function () {
    it("should create a buy order properly", async function () {
      // Create a buy order with price 150 and amount 50
      const tx = await dex.connect(addr1).createOrder(150, 50, true);

      // Expect OrderCreated event with order id 0 (first order)
      await expect(tx)
        .to.emit(dex, "OrderCreated")
        .withArgs(0, await addr1.getAddress(), 150, 50, true);

      // Retrieve the buy order from the contract using the public getter
      const order = await dex.buyOrders(0);
      expect(order.id).to.equal(0);
      expect(order.owner).to.equal(await addr1.getAddress());
      expect(order.price).to.equal(150);
      expect(order.amount).to.equal(50);
      expect(order.isBuy).to.equal(true);
      expect(order.isActive).to.equal(true);
    });

    it("should create a sell order properly", async function () {
      // Create a sell order with price 100 and amount 30
      const tx = await dex.connect(addr1).createOrder(100, 30, false);

      // Expect OrderCreated event with order id 0 (first order in sellOrders)
      await expect(tx)
        .to.emit(dex, "OrderCreated")
        .withArgs(0, await addr1.getAddress(), 100, 30, false);

      // Retrieve the sell order from the contract using the public getter
      const order = await dex.sellOrders(0);
      expect(order.id).to.equal(0);
      expect(order.owner).to.equal(await addr1.getAddress());
      expect(order.price).to.equal(100);
      expect(order.amount).to.equal(30);
      expect(order.isBuy).to.equal(false);
      expect(order.isActive).to.equal(true);
    });
  });

  describe("Order Matching", function () {
    it("should match a buy order with an existing sell order", async function () {
      // First, create a sell order from addr1.
      const sellTx = await dex.connect(addr1).createOrder(100, 50, false);
      await expect(sellTx)
        .to.emit(dex, "OrderCreated")
        .withArgs(0, await addr1.getAddress(), 100, 50, false);

      // Then, create a buy order from addr2 that should match with the sell order.
      const buyTx = await dex.connect(addr2).createOrder(150, 50, true);
      await expect(buyTx)
        .to.emit(dex, "OrderCreated")
        .withArgs(1, await addr2.getAddress(), 150, 50, true)
        .and.to.emit(dex, "TradeExecuted")
        .withArgs(1, 0, 100, 50);

      // Check that the buy order from addr2 is fully matched and marked inactive.
      // Note: buy orders are stored in a separate array.
      const buyOrder = await dex.buyOrders(0);
      expect(buyOrder.id).to.equal(1);
      expect(buyOrder.amount).to.equal(0);
      expect(buyOrder.isActive).to.equal(false);

      // Check that the sell order from addr1 is also fully matched.
      const sellOrder = await dex.sellOrders(0);
      expect(sellOrder.id).to.equal(0);
      expect(sellOrder.amount).to.equal(0);
      expect(sellOrder.isActive).to.equal(false);
    });

    it("should match a sell order with an existing buy order", async function () {
      // Create a buy order from addr1.
      const buyTx = await dex.connect(addr1).createOrder(150, 50, true);
      await expect(buyTx)
        .to.emit(dex, "OrderCreated")
        .withArgs(0, await addr1.getAddress(), 150, 50, true);

      // Create a sell order from addr2 that partially matches the existing buy order.
      const sellTx = await dex.connect(addr2).createOrder(100, 30, false);
      await expect(sellTx)
        .to.emit(dex, "OrderCreated")
        .withArgs(1, await addr2.getAddress(), 100, 30, false)
        .and.to.emit(dex, "TradeExecuted")
        .withArgs(0, 1, 100, 30);

      // Check that the buy order is partially filled: remaining amount should be 20 and still active.
      const buyOrder = await dex.buyOrders(0);
      expect(buyOrder.amount).to.equal(20);
      expect(buyOrder.isActive).to.equal(true);

      // Check that the sell order is fully matched.
      const sellOrder = await dex.sellOrders(0);
      expect(sellOrder.amount).to.equal(0);
      expect(sellOrder.isActive).to.equal(false);
    });

    it("should partially match orders over multiple sell orders", async function () {
      // Create two sell orders from addr1.
      // Sell order A: price 100, amount 30.
      const sellATx = await dex.connect(addr1).createOrder(100, 30, false);
      await expect(sellATx)
        .to.emit(dex, "OrderCreated")
        .withArgs(0, await addr1.getAddress(), 100, 30, false);

      // Sell order B: price 90, amount 40.
      const sellBTx = await dex.connect(addr1).createOrder(90, 40, false);
      await expect(sellBTx)
        .to.emit(dex, "OrderCreated")
        .withArgs(1, await addr1.getAddress(), 90, 40, false);

      // Create a buy order from addr2 that can partially match both sell orders.
      const buyTx = await dex.connect(addr2).createOrder(110, 50, true);
      await expect(buyTx)
        .to.emit(dex, "OrderCreated")
        .withArgs(2, await addr2.getAddress(), 110, 50, true)
        .and.to.emit(dex, "TradeExecuted")
        .withArgs(2, 0, 100, 30)
        .and.to.emit(dex, "TradeExecuted")
        .withArgs(2, 1, 90, 20);

      // Check final state for the buy order.
      const buyOrder = await dex.buyOrders(0);
      expect(buyOrder.id).to.equal(2);
      expect(buyOrder.amount).to.equal(0);
      expect(buyOrder.isActive).to.equal(false);

      // Sell order A should be fully filled.
      const sellOrderA = await dex.sellOrders(0);
      expect(sellOrderA.amount).to.equal(0);
      expect(sellOrderA.isActive).to.equal(false);

      // Sell order B should be partially filled (remaining amount 20).
      const sellOrderB = await dex.sellOrders(1);
      expect(sellOrderB.amount).to.equal(20);
      expect(sellOrderB.isActive).to.equal(true);
    });
  });

  describe("Order Cancellation", function () {
    it("should cancel an active buy order", async function () {
      // Create a buy order from addr1.
      const tx = await dex.connect(addr1).createOrder(150, 50, true);
      await expect(tx)
        .to.emit(dex, "OrderCreated")
        .withArgs(0, await addr1.getAddress(), 150, 50, true);

      // Cancel the buy order.
      const cancelTx = await dex.connect(addr1).cancelOrder(0, true);
      await expect(cancelTx).to.emit(dex, "OrderCancelled").withArgs(0);

      // Verify that the buy order is marked inactive.
      const order = await dex.buyOrders(0);
      expect(order.isActive).to.equal(false);
    });

    it("should cancel an active sell order", async function () {
      // Create a sell order from addr1.
      const tx = await dex.connect(addr1).createOrder(100, 30, false);
      await expect(tx)
        .to.emit(dex, "OrderCreated")
        .withArgs(0, await addr1.getAddress(), 100, 30, false);

      // Cancel the sell order.
      const cancelTx = await dex.connect(addr1).cancelOrder(0, false);
      await expect(cancelTx).to.emit(dex, "OrderCancelled").withArgs(0);

      // Verify that the sell order is marked inactive.
      const order = await dex.sellOrders(0);
      expect(order.isActive).to.equal(false);
    });

    it("should revert when cancelling an order not owned by the caller", async function () {
      // Create a buy order from addr1.
      await dex.connect(addr1).createOrder(150, 50, true);

      // Attempt to cancel the order from addr2, which should revert.
      await expect(dex.connect(addr2).cancelOrder(0, true)).to.be.revertedWith(
        "Order not found or not cancellable"
      );
    });
  });

  describe("Edge Cases", function () {
    it("should revert when creating an order with 0 amount", async function () {
      await expect(
        dex.connect(addr1).createOrder(100, 0, true)
      ).to.be.revertedWith("Order: amount must be > 0");
    });

    it("should revert when creating an order with 0 price", async function () {
      await expect(
        dex.connect(addr1).createOrder(0, 50, false)
      ).to.be.revertedWith("Order: price must be > 0");
    });
  });
});
