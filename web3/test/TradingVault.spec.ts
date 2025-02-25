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
  let quoteToken: MockERC20;
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
      1000000,
      18
    );
    await baseToken.waitForDeployment();
    quoteToken = await TokenFactory.connect(owner).deploy(
      "Mock Quote Token",
      "MQUOTE",
      1000000,
      6
    );
    await quoteToken.waitForDeployment();

    // 6桁未満のトークンをデプロイ
    lowDecimalToken = await TokenFactory.connect(owner).deploy(
      "Low Decimal Token",
      "LOW",
      1000000,
      5
    );
    await lowDecimalToken.waitForDeployment();

    // Transfer some tokens to user for deposit tests
    await baseToken
      .connect(owner)
      .transfer(await user.getAddress(), 1000000000);
    await quoteToken
      .connect(owner)
      .transfer(await user.getAddress(), 1000000000);
    await lowDecimalToken
      .connect(owner)
      .transfer(await user.getAddress(), 1000000000);

    // Deploy MatchingEngine with fee rates (makerFeeRate = 10, takerFeeRate = 15)
    const EngineFactory = await ethers.getContractFactory("MatchingEngine");
    engine = await EngineFactory.connect(owner).deploy(10, 15);
    await engine.waitForDeployment();

    // Add a trading pair into the MatchingEngine.
    // ここでは、base と quote の両方に同じ token.address を指定する
    await engine
      .connect(owner)
      .addPair(baseToken.getAddress(), quoteToken.getAddress());

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
      quoteToken,
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
      // user 承認後、100 トークンを deposit する
      await baseToken.connect(user).approve(await vault.getAddress(), 200);
      await vault.connect(user).deposit(baseToken.getAddress(), 100);
      const balance = await vault.getBalance(
        await user.getAddress(),
        baseToken.getAddress()
      );
      expect(balance).to.equal(100);
    });

    it("should revert deposit if amount is zero", async function () {
      await expect(
        vault.connect(user).deposit(baseToken.getAddress(), 0)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should revert deposit if token has less than 6 decimals", async function () {
      await lowDecimalToken
        .connect(user)
        .approve(await vault.getAddress(), 200);

      // カスタムエラーの検証方法
      await expect(
        vault.connect(user).deposit(lowDecimalToken.getAddress(), 100)
      )
        .to.be.revertedWithCustomError(vault, "InsufficientDecimals")
        .withArgs(await lowDecimalToken.getAddress(), 5);
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      await baseToken.connect(user).approve(await vault.getAddress(), 200);
      await vault.connect(user).deposit(baseToken.getAddress(), 100);
    });

    it("should allow withdrawal of tokens", async function () {
      await vault.connect(user).withdraw(baseToken.getAddress(), 50);
      const balance = await vault.getBalance(
        await user.getAddress(),
        baseToken.getAddress()
      );
      expect(balance).to.equal(50);
    });

    it("should revert withdrawal when amount exceeds balance", async function () {
      await expect(
        vault.connect(user).withdraw(baseToken.getAddress(), 150)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("should allow withdrawal of zero tokens without changes", async function () {
      const before = await vault.getBalance(
        await user.getAddress(),
        baseToken.getAddress()
      );
      await vault.connect(user).withdraw(baseToken.getAddress(), 0);
      const after = await vault.getBalance(
        await user.getAddress(),
        baseToken.getAddress()
      );
      expect(after).to.equal(before);
    });
  });

  describe("Execute Trade", function () {
    it("should revert if base token has less than 6 decimals", async function () {
      // ユーザーがquoteトークンをデポジット
      await quoteToken.connect(user).approve(await vault.getAddress(), 1000);
      await vault.connect(user).deposit(quoteToken.getAddress(), 1000);

      // 低小数点トークンとquoteトークンのペアを追加
      await engine
        .connect(owner)
        .addPair(lowDecimalToken.getAddress(), quoteToken.getAddress());

      // 取引リクエスト作成：Buy注文
      const tradeRequest = await createTradeRequest({
        user: user,
        base: lowDecimalToken,
        quote: quoteToken,
        side: 0, // Buy
        amount: 100,
        price: 1,
      });

      // 実行時にエラーが発生することを確認
      await expect(vault.connect(user).executeTradeBatch([tradeRequest]))
        .to.be.revertedWithCustomError(vault, "InsufficientDecimals")
        .withArgs(await lowDecimalToken.getAddress(), 5);
    });

    it("should revert if quote token has less than 6 decimals", async function () {
      // ユーザーが低小数点トークンをデポジット
      await lowDecimalToken
        .connect(user)
        .approve(await vault.getAddress(), 1000);

      // baseトークンと低小数点トークンのペアを追加
      await engine
        .connect(owner)
        .addPair(baseToken.getAddress(), lowDecimalToken.getAddress());

      // 取引リクエスト作成：Buy注文
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: lowDecimalToken,
        side: 0, // Buy
        amount: 100,
        price: 1,
      });

      // 実行時にエラーが発生することを確認
      await expect(vault.connect(user).executeTradeBatch([tradeRequest]))
        .to.be.revertedWithCustomError(vault, "InsufficientDecimals")
        .withArgs(await lowDecimalToken.getAddress(), 5);
    });

    it("should revert if amount is below minimum threshold", async function () {
      // ユーザーがbaseトークンとquoteトークンをデポジット
      await baseToken.connect(user).approve(await vault.getAddress(), 1000);
      await vault.connect(user).deposit(baseToken.getAddress(), 1000);
      await quoteToken.connect(user).approve(await vault.getAddress(), 1000);
      await vault.connect(user).deposit(quoteToken.getAddress(), 1000);

      // 最小取引量未満の取引リクエスト作成：Sell注文
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 0, // 最小取引量未満（1未満）
        price: 1,
      });

      // 実行時にエラーが発生することを確認
      await expect(
        vault.connect(user).executeTradeBatch([tradeRequest])
      ).to.be.revertedWith("Amount below minimum threshold");
    });
  });

  describe("Cancel Order", function () {
    it("should cancel an active order and refund remaining funds", async function () {
      // user が 100 トークンを deposit する
      await quoteToken.connect(user).approve(await vault.getAddress(), 100);
      await vault.connect(user).deposit(quoteToken.getAddress(), 100);

      // 取引リクエスト作成：今回は Buy 注文 (side = 0)
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 0,
        amount: 100,
        price: 1,
      });

      // user が executeTradeBatch を実行 => MatchingEngine に注文が作成され、user の Vault から 100 トークンが引かれる
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      // この時点で、MatchingEngine の注文 ID は 0 から開始すると仮定
      const orderId = 0;

      // user が注文キャンセルを実行（所有者のみキャンセル可能）
      await vault.connect(user).cancelOrder(orderId);

      // キャンセル処理時、注文にロックされていた未約定の数量が Vault に返金される（テストでは 100 トークンが返金）
      const balanceAfter = await vault.getBalance(
        await user.getAddress(),
        quoteToken.getAddress()
      );
      expect(balanceAfter).to.equal(100);

      // MatchingEngine 側の注文はキャンセル済みとなっているはず
      const orderData = await engine.getOrder(orderId);
      expect(orderData.active).to.equal(false);
    });

    it("should handle precision truncation when cancelling orders", async function () {
      // 端数を含む金額でデポジット（100.123456 ETH）
      const depositAmount = ethers.parseUnits("100.123456", 18);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault.connect(user).deposit(baseToken.getAddress(), depositAmount);

      // 取引リクエスト作成：Sell注文
      // コントラクトでは小数点以下6桁に切り捨てられるので、
      // 100.123456 ETHは100.123000 ETHになる
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 100.123456, // 端数を含む金額（コントラクト内で切り捨てられる）
        price: 1,
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      const orderId = 0;

      // キャンセル前の残高を確認
      const balanceBefore = await vault.getBalance(
        await user.getAddress(),
        baseToken.getAddress()
      );
      expect(balanceBefore).to.equal(0); // 全額ロックされているはず

      // 注文キャンセル
      await vault.connect(user).cancelOrder(orderId);

      // キャンセル後の残高を確認
      const balanceAfter = await vault.getBalance(
        await user.getAddress(),
        baseToken.getAddress()
      );

      // 注文時に小数点以下6桁精度に切り捨てられた金額が返金されるはず
      // 100.123456 ETH → 100.123000 ETH
      const expectedRefund = ethers.parseUnits("100.123000", 18);
      expect(balanceAfter).to.equal(expectedRefund);
    });
  });

  describe("Precision Handling", function () {
    it("should truncate amounts to 6 decimal places when placing orders", async function () {
      // 端数を含む金額でデポジット（100.123456 ETH）
      const depositAmount = ethers.parseUnits("100.123456", 18);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault.connect(user).deposit(baseToken.getAddress(), depositAmount);

      // 取引リクエスト作成：Sell注文
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 100.123456, // 端数を含む金額（コントラクト内で切り捨てられる）
        price: 1,
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      const orderId = 0;

      // 注文情報を取得
      const order = await engine.getOrder(orderId);

      // 注文量が小数点以下6桁精度に切り捨てられていることを確認
      // 100.123456 ETH → 100.123000 ETH
      const expectedAmount = ethers.parseUnits("100.123000", 18);
      expect(order.amount).to.equal(expectedAmount);
    });

    it("should lock truncated amounts when placing buy orders", async function () {
      // 端数を含む金額でデポジット（100.123456 USDC）
      const depositAmount = ethers.parseUnits("100.123456", 6); // quoteTokenは6桁
      await quoteToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault.connect(user).deposit(quoteToken.getAddress(), depositAmount);

      // 取引前の残高を確認
      const balanceBefore = await vault.getBalance(
        await user.getAddress(),
        quoteToken.getAddress()
      );
      expect(balanceBefore).to.equal(depositAmount);

      // 取引リクエスト作成：Buy注文
      const orderAmount = 50; // 50 トークン
      const orderPrice = 1.123456; // 1.123456の価格
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 0, // Buy
        amount: orderAmount,
        price: Math.floor(orderPrice * 1000000), // 価格を整数に変換
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);

      // 注文後の残高を確認
      const balanceAfter = await vault.getBalance(
        await user.getAddress(),
        quoteToken.getAddress()
      );

      // 計算される正確な金額（切り捨て前）
      // 50 * 1.123456 = 56.1728
      const exactAmount = 50 * 1.123456;
      // 小数点以下6桁精度に切り捨てた金額
      // 56.1728 → 56.172800
      const expectedDeduction = ethers.parseUnits("56.172800", 6);

      // 残高が正確に減少していることを確認（切り捨てた金額分だけ減少）
      expect(balanceBefore - balanceAfter).to.equal(expectedDeduction);
    });

    it("should handle minimum amount when truncation results in zero", async function () {
      // 小さい金額でデポジット（0.0000005 ETH）
      const depositAmount = ethers.parseUnits("0.0000005", 18);
      await baseToken
        .connect(user)
        .approve(await vault.getAddress(), depositAmount);
      await vault.connect(user).deposit(baseToken.getAddress(), depositAmount);

      // 取引リクエスト作成：Sell注文（金額が小さすぎて切り捨てると0になる）
      const tradeRequest = await createTradeRequest({
        user: user,
        base: baseToken,
        quote: quoteToken,
        side: 1, // Sell
        amount: 0.0000005, // 切り捨てると0になる金額
        price: 1,
      });

      // 注文実行
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      const orderId = 0;

      // 注文情報を取得
      const order = await engine.getOrder(orderId);

      // 切り捨てると0になるはずだが、最小値の1が設定されていることを確認
      expect(order.amount).to.equal(1); // MINIMUM_AMOUNT = 1
    });
  });
});
