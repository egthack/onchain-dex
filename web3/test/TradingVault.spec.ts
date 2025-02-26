import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, TradingVault, MatchingEngine } from "../typechain-types";
import { Signer } from "ethers";
import { createTradeRequest } from "./helpers/tradeHelper";

export interface TradeRequest {
  user: string;
  base: string;
  quote: string;
  amount: number;
  price: number;
  side: number;
  signature: string;
}

describe("TradingVault", function () {
  let owner: Signer;
  let user: Signer;
  let trader: Signer;
  let baseToken: MockERC20;
  let usdcToken: MockERC20;
  let lowDecimalToken: MockERC20; // 6桁未満のトークン
  let vault: TradingVault;
  let engine: MatchingEngine;

  const deployFixture = async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    user = signers[1];
    trader = signers[2];

    // Deploy MockERC20 token
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    baseToken = await TokenFactory.connect(owner).deploy(
      "Mock Base Token",
      "MBASE",
      1000000000,
      18
    );
    await baseToken.waitForDeployment();
    usdcToken = await TokenFactory.connect(owner).deploy(
      "Mock USDC Token(Quote)",
      "USDC",
      1000000000,
      6
    );
    await usdcToken.waitForDeployment();

    // 6桁未満のトークンをデプロイ
    lowDecimalToken = await TokenFactory.connect(owner).deploy(
      "Low Decimal Token",
      "LOW",
      1000000000,
      5
    );
    await lowDecimalToken.waitForDeployment();

    // Transfer some tokens to user for deposit tests
    await baseToken
      .connect(owner)
      .transfer(await user.getAddress(), ethers.parseUnits("10000", 18));
    await usdcToken
      .connect(owner)
      .transfer(await user.getAddress(), ethers.parseUnits("10000", 6));
    await lowDecimalToken
      .connect(owner)
      .transfer(await user.getAddress(), ethers.parseUnits("10000", 5));

    // Deploy MatchingEngine with fee rates (makerFeeRate = 10, takerFeeRate = 15)
    const EngineFactory = await ethers.getContractFactory("MatchingEngine");
    engine = await EngineFactory.connect(owner).deploy(10, 15);
    await engine.waitForDeployment();

    // Add a trading pair into the MatchingEngine.
    await engine
      .connect(owner)
      .addPair(await baseToken.getAddress(), await usdcToken.getAddress());

    // Deploy TradingVault with the engine address
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vault = await VaultFactory.connect(owner).deploy(await engine.getAddress());
    await vault.waitForDeployment();

    await engine.connect(owner).setVaultAddress(await vault.getAddress());

    return {
      owner,
      user,
      trader,
      baseToken,
      usdcToken,
      lowDecimalToken,
      vault,
      engine,
    };
  };

  beforeEach(async function () {
    await deployFixture();
  });

  describe("Deposit", function () {
    it("should allow deposits", async function () {
      // 1000トークンをデポジット
      const depositAmount = ethers.parseUnits("1000", 18);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await baseToken.getAddress(), depositAmount);

      const balance = await vault.getBalance(
        await user.getAddress(),
        await baseToken.getAddress()
      );
      expect(balance).to.equal(depositAmount);
    });

    it("should revert deposit if amount is zero", async function () {
      await expect(
        vault.connect(user).deposit(await baseToken.getAddress(), 0)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should revert deposit if token has less than 6 decimals", async function () {
      const depositAmount = ethers.parseUnits("1000", 5);
      await lowDecimalToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);

      await expect(
        vault
          .connect(user)
          .deposit(await lowDecimalToken.getAddress(), depositAmount)
      )
        .to.be.revertedWithCustomError(vault, "InsufficientDecimals")
        .withArgs(await lowDecimalToken.getAddress(), 5);
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseUnits("1000", 18);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await baseToken.getAddress(), depositAmount);
    });

    it("should allow withdrawal of tokens", async function () {
      const withdrawAmount = ethers.parseUnits("500", 18);
      await vault
        .connect(user)
        .withdraw(await baseToken.getAddress(), withdrawAmount);

      const balance = await vault.getBalance(
        await user.getAddress(),
        await baseToken.getAddress()
      );
      const expectedBalance = ethers.parseUnits("500", 18);
      expect(balance).to.equal(expectedBalance);
    });

    it("should revert withdrawal when amount exceeds balance", async function () {
      const withdrawAmount = ethers.parseUnits("1500", 18);
      await expect(
        vault
          .connect(user)
          .withdraw(await baseToken.getAddress(), withdrawAmount)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("should allow withdrawal of zero tokens without changes", async function () {
      const before = await vault.getBalance(
        await user.getAddress(),
        await baseToken.getAddress()
      );
      await vault.connect(user).withdraw(await baseToken.getAddress(), 0);
      const after = await vault.getBalance(
        await user.getAddress(),
        await baseToken.getAddress()
      );
      expect(after).to.equal(before);
    });
  });

  describe("Execute Trade", function () {

    it("should revert if amount is below minimum threshold", async function () {
      // ユーザーがbaseトークンとquoteトークンをデポジット
      const depositAmount = ethers.parseUnits("1000", 18);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await baseToken.getAddress(), depositAmount);

      const quoteDepositAmount = ethers.parseUnits("1000", 6);
      await usdcToken
        .connect(user)
        .approve(await vault.getAddress(), quoteDepositAmount);
      await vault
        .connect(user)
        .deposit(await usdcToken.getAddress(), quoteDepositAmount);

      // 最小取引量未満の取引リクエスト作成：Sell注文
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: usdcToken,
        side: 1, // Sell
        amount: 0, // 最小取引量未満（1未満）
        price: 100, // 価格は小数点以下2桁精度（100 = 1.00）
      });

      // 実行時にエラーが発生することを確認
      await expect(
        vault.connect(user).executeTradeBatch([tradeRequest])
      ).to.be.revertedWith("Amount below minimum threshold");
    });
  });

  describe("Precision Handling", function () {
    it("should truncate amounts to 6 decimal places when placing orders", async function () {
      // 整数値でデポジット（100 ETH）
      const depositAmount = ethers.parseUnits("100", 18);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await baseToken.getAddress(), depositAmount);

      // 取引リクエスト作成：Sell注文
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: usdcToken,
        side: 1, // Sell
        amount: 10, // 0.00001
        price: 100, // 価格は小数点以下2桁精度（100 = 1.00）
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      const orderId = 0;

      // 注文情報を取得
      const order = await engine.getOrder(orderId);

      // 注文量が正しく設定されていることを確認
      // 注文量は10 -> 0.00001
      expect(order.amount).to.equal(10);

      // 価格が正しく設定されていることを確認
      expect(order.price).to.equal(100);
    });

    it("should lock correct amounts when placing buy orders", async function () {
      // 整数値でデポジット（1000 USDC）
      const depositAmount = ethers.parseUnits("1000", 6);
      await usdcToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await usdcToken.getAddress(), depositAmount);

      // 取引前の残高を確認
      const balanceBefore = await vault.getBalance(
        await user.getAddress(),
        await usdcToken.getAddress()
      );
      expect(balanceBefore).to.equal(depositAmount);

      // 取引リクエスト作成：Buy注文
      // 1 ETH = 1 USDCで 0.00005 ETHを購入
      // 0.00005 ETH * 1 = 0.00005 USDCがロックされる
      // 小数点以下6桁精度なので、vault上のbalanceでは5
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: usdcToken,
        side: 0, // Buy
        amount: 5, // 0.000005
        price: 100, // 1.00
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);

      // 注文後の残高を確認
      const balanceAfter = await vault.getBalance(
        await user.getAddress(),
        await usdcToken.getAddress()
      );

      // 残高が正確に減少していることを確認　 5 * (100 / 100) = 5
      // lock時には100で割った値を利用する
      const diff = balanceBefore - balanceAfter;
      expect(diff).to.equal(5);

      // 注文情報を取得して価格が正しく設定されていることを確認
      const order = await engine.getOrder(0);
      expect(order.price).to.equal(100);
    });

    it("should handle minimum amount correctly", async function () {
      // 整数値でデポジット（100 ETH）
      const depositAmount = ethers.parseUnits("100", 18);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await baseToken.getAddress(), depositAmount);

      // 取引リクエスト作成：Sell注文（最小量）
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: usdcToken,
        side: 1, // Sell
        amount: 1, // 最小量
        price: 100, // 価格は小数点以下2桁精度（100 = 1.00）
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      const orderId = 0;

      // 注文情報を取得
      const order = await engine.getOrder(orderId);

      // 最小量が正しく設定されていることを確認
      expect(order.amount).to.equal(1);
    });

    it("should revert when quote amount is below minimum threshold", async function () {
      // 整数値でデポジット（1000 USDC）
      const depositAmount = ethers.parseUnits("1000", 6);
      await usdcToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await usdcToken.getAddress(), depositAmount);

      // 取引リクエスト作成：Buy注文
      // amount = 1 (0.000001 ETH)
      // price = 0.01 (0.0001 USDC)
      // 計算結果: 0.000001 * 0.0001 = 0.0000000001 USDC（最小単位0.000001未満）
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: usdcToken,
        side: 0, // Buy
        amount: 1, // 0.000001
        price: 1, // 0.01
      });

      // 実行時にエラーが発生することを確認
      await expect(
        vault.connect(user).executeTradeBatch([tradeRequest])
      ).to.be.revertedWith("Quote amount below minimum threshold");
    });

    it("should accept when quote amount equals minimum threshold", async function () {
      // 整数値でデポジット（1000 USDC）
      const depositAmount = ethers.parseUnits("1000", 6);
      await usdcToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await usdcToken.getAddress(), depositAmount);

      // 取引リクエスト作成：Buy注文
      // amount = 100 (0.0001 ETH)
      // price = 100 (1.00 USDC)
      // 計算結果: 0.0001 * 1.00 = 0.0001 USDC（ロック額は100（6桁表現）として計算）
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: usdcToken,
        side: 0, // Buy
        amount: 100,
        price: 100,
      });

      // 注文が正常に実行されることを確認
      await expect(vault.connect(user).executeTradeBatch([tradeRequest])).to.not.be.reverted;

      // 注文情報を取得して確認
      const orderId = 0;
      const order = await engine.getOrder(orderId);
      expect(order.amount).to.equal(100);
      expect(order.price).to.equal(100);
    });

    it("should properly truncate buy order amounts to 6 decimals", async function () {
      // 整数値でデポジット（十分なUSDC）
      const depositAmount = ethers.parseUnits("10000", 6);
      await usdcToken.connect(user).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user).deposit(await usdcToken.getAddress(), depositAmount);

      // 取引リクエスト作成：Buy注文
      // amount = 1234567, price = 123
      // exactQuoteAmount = (1234567 * 123) / 100 = 1518517 (小数点以下切り捨て)
      // _truncateToMinimumDecimals(1518517) = (1518517 / 1000000)*1000000 = 1000000
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: usdcToken,
        side: 0, // Buy
        amount: 1234567,
        price: 123,
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);

      // 注文実行後、ロックされた金額はUSDCなので、factor = 10^(6-6)=1、期待値は1000000
      const balanceAfter = await vault.getBalance(await user.getAddress(), await usdcToken.getAddress());
      const expectedBalance = depositAmount - BigInt(1000000);
      expect(balanceAfter).to.equal(expectedBalance);
    });
  });

  describe("Cancel Order", function () {
    it("should cancel an active buy order and refund remaining funds", async function () {
      // ユーザーがquoteトークンをデポジット
      // 1000.000000 USDC
      // 6桁のトークンの返金
      const depositAmount = ethers.parseUnits("1000", 6);
      await usdcToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await usdcToken.getAddress(), depositAmount);
      // 取引リクエスト作成：Buy注文
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: usdcToken,
        side: 0, // Buy
        amount: 100,
        price: 1, // 価格は小数点以下2桁精度（1 = 0.01）
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      const orderId = 0;

      // 注文キャンセル
      await vault.connect(user).cancelOrder(orderId);

      // キャンセル後の残高確認
      const balanceAfter = await vault.getBalance(
        await user.getAddress(),
        await usdcToken.getAddress()
      );

      // 注文時にロックされた金額が正確に返金されていることを確認
      // 100 * 1 = 100 (100 units of usdcToken)
      const expectedBalance = depositAmount;
      expect(balanceAfter).to.equal(expectedBalance);

      // MatchingEngine側の注文がキャンセル済みになっていることを確認
      const orderData = await engine.getOrder(orderId);
      expect(orderData.active).to.equal(false);
    });

    it("should handle sell order cancellation correctly", async function () {
      // 整数値でデポジット（1 ETH）
      // 18桁のトークンの返金
      const depositAmount = ethers.parseUnits("1", 18);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault
        .connect(user)
        .deposit(await baseToken.getAddress(), depositAmount);

      // キャンセル前の残高を確認
      // const balanceBefore1 = await vault.getBalance(
      //   await user.getAddress(),
      //   await baseToken.getAddress()
      // );

      // console.log("balanceBefore1", balanceBefore1);
      // 取引リクエスト作成：Sell注文
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: usdcToken,
        side: 1, // Sell
        amount: 10, // 0.00001
        price: 100,
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      const orderId = 0;

      // キャンセル前の残高を確認
      const balanceBefore = await vault.getBalance(
        await user.getAddress(),
        await baseToken.getAddress()
      );

      // ロック量は10（0.00001 ETH）
      expect(balanceBefore).to.equal(
        depositAmount - BigInt(10) * BigInt(10 ** 12)
      );

      // 注文キャンセル
      await vault.connect(user).cancelOrder(orderId);

      // キャンセル後の残高を確認
      const balanceAfter = await vault.getBalance(
        await user.getAddress(),
        await baseToken.getAddress()
      );

      // console.log("balanceBefore", balanceBefore);
      // console.log("balanceAfter", balanceAfter);

      // 注文時にロックされた金額が返金されるはず
      const expectedBalance = depositAmount;
      expect(balanceAfter).to.equal(expectedBalance);
    });
  });
});
