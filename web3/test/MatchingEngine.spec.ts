import { expect } from "chai";
import { ethers } from "hardhat";
import { MatchingEngine, TradingVault, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";
import {
  createTradeRequest,
  getContractEvents,
  getTokenBalances,
} from "./helpers/tradeHelper";

interface Fixture {
  owner: Signer;
  user: Signer;
  trader: Signer;
  baseToken: MockERC20;
  usdcToken: MockERC20;
  lowDecimalToken: MockERC20;
  vault: TradingVault;
  engine: MatchingEngine;
}

async function deployFixture(): Promise<Fixture> {
  const signers = await ethers.getSigners();
  const owner = signers[0];
  const user = signers[1];
  const trader = signers[2];

  // Deploy MockERC20 tokens
  const TokenFactory = await ethers.getContractFactory("MockERC20");
  const baseToken = await TokenFactory.connect(owner).deploy("Mock Base Token", "MBASE", 1000000000, 18);
  await baseToken.waitForDeployment();
  const usdcToken = await TokenFactory.connect(owner).deploy("Mock USDC Token(Quote)", "USDC", 1000000000, 6);
  await usdcToken.waitForDeployment();
  const lowDecimalToken = await TokenFactory.connect(owner).deploy("Low Decimal Token", "LOW", 1000000000, 5);
  await lowDecimalToken.waitForDeployment();

  // Transfer tokens to user for deposit tests
  await baseToken.connect(owner).transfer(await user.getAddress(), ethers.parseUnits("10000", 18));
  await usdcToken.connect(owner).transfer(await user.getAddress(), ethers.parseUnits("10000", 6));
  await lowDecimalToken.connect(owner).transfer(await user.getAddress(), ethers.parseUnits("10000", 5));

  // Deploy MatchingEngine with makerFeeRate = 10, takerFeeRate = 15
  const EngineFactory = await ethers.getContractFactory("MatchingEngine");
  const engine = await EngineFactory.connect(owner).deploy(10, 15);
  await engine.waitForDeployment();

  // Add trading pair for baseToken and usdcToken
  await engine.connect(owner).addPair(await baseToken.getAddress(), await usdcToken.getAddress());

  // Deploy TradingVault with engine address
  const VaultFactory = await ethers.getContractFactory("TradingVault");
  const vault = await VaultFactory.connect(owner).deploy(await engine.getAddress());
  await vault.waitForDeployment();

  // Set vault address in MatchingEngine
  await engine.connect(owner).setVaultAddress(await vault.getAddress());

  return { owner, user, trader, baseToken, usdcToken, lowDecimalToken, vault, engine };
}

/***********************
 * MatchingEngine Deployment & Setup
 ***********************/
describe("MatchingEngine Contract Deployment & Setup", function () {
  let fixture: Fixture;

  beforeEach(async function () {
    fixture = await deployFixture();
  });

  it("should deploy the contracts and set vault correctly", async function () {
    expect(await fixture.engine.getAddress()).to.properAddress;
    expect(await fixture.vault.getAddress()).to.properAddress;
  });
});

/***********************
 * Execute Trade Tests
 ***********************/
describe("Execute Trade", function () {
  let fixture: Fixture;

  beforeEach(async function () {
    fixture = await deployFixture();
  });

  it("should revert if base token has less than 6 decimals (Buy order)", async function () {
    // Deposit USDC
    const depositAmount = ethers.parseUnits("1000", 6);
    await fixture.usdcToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.usdcToken.getAddress(), depositAmount);
    
    // Add pair: lowDecimalToken (base) and USDC (quote)
    await fixture.engine.connect(fixture.owner).addPair(await fixture.lowDecimalToken.getAddress(), await fixture.usdcToken.getAddress());
    
    // Create Buy order trade request
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.lowDecimalToken,
      quote: fixture.usdcToken,
      side: 0, // Buy
      amount: 100,
      price: 100
    });

    await expect(fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest]))
      .to.be.revertedWithCustomError(fixture.vault, "InsufficientDecimals")
      .withArgs(await fixture.lowDecimalToken.getAddress(), 5);
  });

  it("should revert if quote token has less than 6 decimals (Sell order)", async function () {
    // Deposit base token
    const depositAmount = ethers.parseUnits("1000", 18);
    await fixture.baseToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.baseToken.getAddress(), depositAmount);
    
    // Add pair: baseToken and lowDecimalToken (quote)
    await fixture.engine.connect(fixture.owner).addPair(await fixture.baseToken.getAddress(), await fixture.lowDecimalToken.getAddress());
    
    // Create Sell order trade request
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.lowDecimalToken,
      side: 1, // Sell
      amount: 100,
      price: 100
    });

    await expect(fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest]))
      .to.be.revertedWithCustomError(fixture.vault, "InsufficientDecimals")
      .withArgs(await fixture.lowDecimalToken.getAddress(), 5);
  });

  it("should revert if trade amount is below the minimum threshold", async function () {
    // Deposit base and quote
    const depositAmount = ethers.parseUnits("1000", 18);
    await fixture.baseToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.baseToken.getAddress(), depositAmount);
    const quoteDepositAmount = ethers.parseUnits("1000", 6);
    await fixture.usdcToken.connect(fixture.user).approve(await fixture.vault.getAddress(), quoteDepositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.usdcToken.getAddress(), quoteDepositAmount);
    
    // Create Sell order with amount = 0 (below minimum)
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 1, // Sell
      amount: 0,
      price: 100
    });

    await expect(fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest]))
      .to.be.revertedWith("Amount below minimum threshold");
  });
});

/***********************
 * Precision Handling Tests
 ***********************/
describe("Precision Handling", function () {
  let fixture: Fixture;

  beforeEach(async function () {
    fixture = await deployFixture();
  });

  it("should truncate order amounts to 6 decimals when placing orders (Sell order)", async function () {
    // Deposit base token
    const depositAmount = ethers.parseUnits("100", 18);
    await fixture.baseToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.baseToken.getAddress(), depositAmount);
    
    // Create Sell order trade request
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 1, // Sell
      amount: 10,
      price: 100
    });

    await fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest]);
    
    // Retrieve order from MatchingEngine
    const order = await fixture.engine.getOrder(0);
    expect(order.amount).to.equal(10);
    expect(order.price).to.equal(100);
  });

  it("should lock correct amounts for buy orders", async function () {
    // Deposit USDC
    const depositAmount = ethers.parseUnits("1000", 6);
    await fixture.usdcToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.usdcToken.getAddress(), depositAmount);

    const balanceBefore = await fixture.vault.getBalance(await fixture.user.getAddress(), await fixture.usdcToken.getAddress());

    // Create Buy order trade request
    // For example: amount = 5, price = 100, so locked amount should be (5*100/100) = 5 in 6-decimal precision
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 0, // Buy
      amount: 5,
      price: 100
    });

    await fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest]);
    
    const balanceAfter = await fixture.vault.getBalance(await fixture.user.getAddress(), await fixture.usdcToken.getAddress());
    const diff = BigInt(balanceBefore) - BigInt(balanceAfter);
    expect(diff).to.equal(BigInt(5));
  });

  it("should handle minimum amount correctly", async function () {
    // Deposit base token
    const depositAmount = ethers.parseUnits("100", 18);
    await fixture.baseToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.baseToken.getAddress(), depositAmount);

    // Create Sell order trade request with minimum amount (1)
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 1, // Sell
      amount: 1,
      price: 100
    });

    await fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest]);
    const order = await fixture.engine.getOrder(0);
    expect(order.amount).to.equal(1);
  });

  it("should revert when buy order quote amount is below minimum threshold", async function () {
    // Deposit USDC
    const depositAmount = ethers.parseUnits("1000", 6);
    await fixture.usdcToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.usdcToken.getAddress(), depositAmount);

    // Create Buy order trade request with extremely low amount and price that yield quote below minimum
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 0, // Buy
      amount: 1,
      price: 1
    });

    await expect(fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest]))
      .to.be.revertedWith("Quote amount below minimum threshold");
  });

  it("should accept buy order when quote amount equals minimum threshold", async function () {
    // Deposit USDC
    const depositAmount = ethers.parseUnits("1000", 6);
    await fixture.usdcToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.usdcToken.getAddress(), depositAmount);

    // Create Buy order trade request where quote amount equals minimum threshold
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 0, // Buy
      amount: 100,
      price: 100
    });

    await expect(fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest])).to.not.be.reverted;
    const order = await fixture.engine.getOrder(0);
    expect(order.amount).to.equal(100);
    expect(order.price).to.equal(100);
  });
});

/***********************
 * Cancel Order Tests
 ***********************/
describe("Cancel Order", function () {
  let fixture: Fixture;

  beforeEach(async function () {
    fixture = await deployFixture();
  });

  it("should cancel an active order and refund remaining funds (Buy order)", async function () {
    // Deposit USDC
    const depositAmount = ethers.parseUnits("1000", 6);
    await fixture.usdcToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.usdcToken.getAddress(), depositAmount);

    // Create Buy order trade request
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 0, // Buy
      amount: 100,
      price: 1
    });
    await fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest]);
    const orderId = 0;

    // Cancel order
    await fixture.vault.connect(fixture.user).cancelOrder(orderId);

    const balanceAfter = await fixture.vault.getBalance(await fixture.user.getAddress(), await fixture.usdcToken.getAddress());
    expect(balanceAfter).to.equal(depositAmount);

    const orderData = await fixture.engine.getOrder(orderId);
    expect(orderData.active).to.be.false;
  });

  it("should handle order cancellation correctly (Sell order)", async function () {
    // Deposit base token
    const depositAmount = ethers.parseUnits("1", 18);
    await fixture.baseToken.connect(fixture.user).approve(await fixture.vault.getAddress(), depositAmount);
    await fixture.vault.connect(fixture.user).deposit(await fixture.baseToken.getAddress(), depositAmount);

    // Create Sell order trade request
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 1, // Sell
      amount: 10,
      price: 100
    });
    await fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest]);
    const orderId = 0;

    const balanceBefore = await fixture.vault.getBalance(await fixture.user.getAddress(), await fixture.baseToken.getAddress());
    // Expect locked amount to be deducted
    expect(balanceBefore).to.be.below(depositAmount);

    // Cancel order
    await fixture.vault.connect(fixture.user).cancelOrder(orderId);

    const balanceAfter = await fixture.vault.getBalance(await fixture.user.getAddress(), await fixture.baseToken.getAddress());
    expect(balanceAfter).to.equal(depositAmount);
  });
});

describe("Minimum Trade Amount Rejection", function () {
  let fixture: Fixture;
  beforeEach(async function () {
    fixture = await deployFixture();
  });

  it("should revert buy order when calculated quote amount is below minimum threshold", async function () {
    // amount=1 と price=1 の場合、1*1=1 < 100 となり、require(exactQuoteAmount >= MINIMUM_AMOUNT * 100)によりリバート
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 0, // Buy
      amount: 1,
      price: 1
    });
    await expect(
      fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest])
    ).to.be.revertedWith("Quote amount below minimum threshold");
  });

  it("should revert sell order when trade amount is below minimum threshold", async function () {
    // amount=0 は executeTradeBatch の require(req.amount >= MINIMUM_AMOUNT, ...) によりリバート
    const tradeRequest = await createTradeRequest({
      user: fixture.user,
      base: fixture.baseToken,
      quote: fixture.usdcToken,
      side: 1, // Sell
      amount: 0,
      price: 100
    });
    await expect(
      fixture.vault.connect(fixture.user).executeTradeBatch([tradeRequest])
    ).to.be.revertedWith("Amount below minimum threshold");
  });
});
