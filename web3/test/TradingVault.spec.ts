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
  let vault: TradingVault;
  let engine: MatchingEngine;


  const deployFixture = async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    user = signers[1];
    trader = signers[2];

    // Deploy MockERC20 token
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    baseToken = await TokenFactory.connect(owner).deploy("Mock Base Token", "MBASE", 1000000);
    await baseToken.waitForDeployment();
    quoteToken = await TokenFactory.connect(owner).deploy("Mock Quote Token", "MQUOTE", 1000000);
    await quoteToken.waitForDeployment();

    // Transfer some tokens to user for deposit tests
    await baseToken.connect(owner).transfer(await user.getAddress(), 1000);
    await quoteToken.connect(owner).transfer(await user.getAddress(), 1000);

    // Deploy MatchingEngine with fee rates (makerFeeRate = 10, takerFeeRate = 15)
    const EngineFactory = await ethers.getContractFactory("MatchingEngine");
    engine = await EngineFactory.connect(owner).deploy(10, 15);
    await engine.waitForDeployment();

    // Add a trading pair into the MatchingEngine.
    // ここでは、base と quote の両方に同じ token.address を指定する
    await engine.connect(owner).addPair(baseToken.getAddress(), quoteToken.getAddress(), 18, 18);

    // Deploy TradingVault with the engine address
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vault = await VaultFactory.connect(owner).deploy(await engine.getAddress());
    await vault.waitForDeployment();

    await engine.connect(owner).setVaultAddress(await vault.getAddress());

    return { owner, user, trader, baseToken, quoteToken, vault, engine };
  };

  beforeEach(async function () {
    await deployFixture();
  });

  describe("Deposit", function () {
    it("should allow deposits", async function () {
      // user 承認後、100 トークンを deposit する
      await baseToken.connect(user).approve(await vault.getAddress(), 200);
      await vault.connect(user).deposit(baseToken.getAddress(), 100);
      const balance = await vault.getBalance(await user.getAddress(), baseToken.getAddress());
      expect(balance).to.equal(100);
    });

    it("should revert deposit if amount is zero", async function () {
      await expect(
        vault.connect(user).deposit(baseToken.getAddress(), 0)
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      await baseToken.connect(user).approve(await vault.getAddress(), 200);
      await vault.connect(user).deposit(baseToken.getAddress(), 100);
    });

    it("should allow withdrawal of tokens", async function () {
      await vault.connect(user).withdraw(baseToken.getAddress(), 50);
      const balance = await vault.getBalance(await user.getAddress(), baseToken.getAddress());
      expect(balance).to.equal(50);
    });

    it("should revert withdrawal when amount exceeds balance", async function () {
      await expect(
        vault.connect(user).withdraw(baseToken.getAddress(), 150)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("should allow withdrawal of zero tokens without changes", async function () {
      const before = await vault.getBalance(await user.getAddress(), baseToken.getAddress());
      await vault.connect(user).withdraw(baseToken.getAddress(), 0);
      const after = await vault.getBalance(await user.getAddress(), baseToken.getAddress());
      expect(after).to.equal(before);
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
        price: 1
      });

      // user が executeTradeBatch を実行 => MatchingEngine に注文が作成され、user の Vault から 100 トークンが引かれる
      await vault.connect(user).executeTradeBatch([tradeRequest]);
      // この時点で、MatchingEngine の注文 ID は 0 から開始すると仮定
      const orderId = 0;

      // user が注文キャンセルを実行（所有者のみキャンセル可能）
      await vault.connect(user).cancelOrder(orderId);

      // キャンセル処理時、注文にロックされていた未約定の数量が Vault に返金される（テストでは 100 トークンが返金）
      const balanceAfter = await vault.getBalance(await user.getAddress(), baseToken.getAddress());
      expect(balanceAfter).to.equal(100);

      // MatchingEngine 側の注文はキャンセル済みとなっているはず
      const orderData = await engine.getOrder(orderId);
      expect(orderData.active).to.equal(false);
    });
  });
});
