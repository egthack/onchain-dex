import { expect } from "chai";
import { ethers } from "hardhat";
import { MatchingEngine, TradingVault, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";

describe("MatchingEngine", function () {
  let admin: Signer;
  let addr1: Signer;
  let addr2: Signer;
  
  let matchingEngine: MatchingEngine;
  let vault: TradingVault;
  let tokenA: MockERC20;
  let tokenB: MockERC20;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    admin = signers[0];
    addr1 = signers[1];
    addr2 = signers[2];

    // --- ERC20 トークンのデプロイ（MockERC20） ---
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    tokenA = await TokenFactory.connect(admin).deploy("Token A", "TKA", 1000000);
    await tokenA.waitForDeployment();
    tokenB = await TokenFactory.connect(admin).deploy("Token B", "TKB", 1000000);
    await tokenB.waitForDeployment();

    // --- MatchingEngine のデプロイ ---
    const MatchingEngineFactory = await ethers.getContractFactory("MatchingEngine");
    // makerFeeRate = 10 (0.1%), takerFeeRate = 15 (0.15%)
    matchingEngine = await MatchingEngineFactory.connect(admin).deploy(10, 15);
    await matchingEngine.waitForDeployment();

    // --- TradingVault のデプロイ（Vault として利用） ---
    const VaultFactory = await ethers.getContractFactory("TradingVault");
    vault = await VaultFactory.connect(admin).deploy(await matchingEngine.getAddress());
    await vault.waitForDeployment();

    // --- MatchingEngine に Vault アドレスを設定 ---
    await matchingEngine.connect(admin).setVaultAddress(await vault.getAddress());

    // --- Trading Pair の追加 ---
    // tokenA: tokenIn, tokenB: tokenOut　（小数点は両方とも 18 とする）
    await matchingEngine.connect(admin).addPair(await tokenA.getAddress(), await tokenB.getAddress(), 18, 18);
  });

  describe("Pair Management", function () {
    it("should add a new pair and retrieve pair info", async function () {
      const pair = await matchingEngine.getPair(0);
      expect(pair.pairId).to.exist;
      expect(pair.tokenz[0]).to.equal(await tokenA.getAddress());
      expect(pair.tokenz[1]).to.equal(await tokenB.getAddress());
      expect(pair.decimals[0]).to.equal(18);
      expect(pair.decimals[1]).to.equal(18);
    });

    it("should return an array of pairs with getPairs()", async function () {
      // 別ペアとして既存の tokenA, tokenB の組み合わせ（ダミー）を追加
      await matchingEngine.connect(admin).addPair(await tokenA.getAddress(), await tokenB.getAddress(), 8, 8);
      const pairs = await matchingEngine.getPairs(2, 0);
      expect(pairs.length).to.equal(2);
    });
  });

  describe("Order Creation via Vault", function () {
    it("should create a buy order properly through vault", async function () {
      // --- addr1 によるトークン入金の準備 ---
      // （必要に応じ、admin から addr1 へトークン転送）
      await tokenA.connect(admin).transfer(await addr1.getAddress(), 1000);
      await tokenA.connect(addr1).approve(await vault.getAddress(), 200);
      await vault.connect(addr1).deposit(await tokenA.getAddress(), 100);

      // --- Trade Request の作成 ---
      // VaultLib.checkTradeRequest の内容に沿い、署名対象は以下の通り
      const preApprovalId = ethers.getBytes("approved");
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "uint256", "bytes32"],
        [
          await addr1.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          100,
          0,
          preApprovalId,
        ]
      );
      const signature = await addr1.signMessage(ethers.getBytes(messageHash));

      const tradeRequest = {
        user: await addr1.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 100,
        minAmountOut: 0,
        preApprovalId: preApprovalId,
        side: 0, // Buy order
        signature: signature,
      };

      // --- Vault 経由で注文実行 ---
      // addr2 が取引執行者（トレーダー）として取引を実行
      await vault.connect(addr2).executeTradeBatch([tradeRequest]);

      // --- MatchingEngine にオーダーが作成されていることを検証 ---
      const order = await matchingEngine.orders(0);
      expect(order.id).to.equal(0);
      expect(order.user).to.equal(await addr1.getAddress());
      expect(order.tokenIn).to.equal(await tokenA.getAddress());
      expect(order.tokenOut).to.equal(await tokenB.getAddress());
      // _executeSingleTrade では engine.placeOrder の第4引数に req.amountIn が渡されるため、
      // この例では price == 100 となると仮定
      expect(order.price).to.equal(100);
      expect(order.amount).to.equal(100);
      expect(order.active).to.equal(true);
    });

    it("should create a sell order properly through vault", async function () {
      // --- addr1 によるトークン入金の準備 ---
      await tokenA.connect(admin).transfer(await addr1.getAddress(), 1000);
      await tokenA.connect(addr1).approve(await vault.getAddress(), 200);
      await vault.connect(addr1).deposit(await tokenA.getAddress(), 150);

      // --- Sell Order リクエスト作成 (side = 1) ---
      const preApprovalId = ethers.getBytes("approved");
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "uint256", "bytes32"],
        [
          await addr1.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          150,
          0,
          preApprovalId,
        ]
      );
      const signature = await addr1.signMessage(ethers.getBytes(messageHash));
      const tradeRequest = {
        user: await addr1.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 150,
        minAmountOut: 0,
        preApprovalId: preApprovalId,
        side: 1, // Sell order
        signature: signature,
      };

      await vault.connect(addr2).executeTradeBatch([tradeRequest]);
      const order = await matchingEngine.orders(0);
      expect(order.id).to.equal(0);
      expect(order.user).to.equal(await addr1.getAddress());
      expect(order.tokenIn).to.equal(await tokenA.getAddress());
      expect(order.tokenOut).to.equal(await tokenB.getAddress());
      expect(order.price).to.equal(150);
      expect(order.amount).to.equal(150);
      expect(order.active).to.equal(true);
    });

    it("should revert when placeOrder is called directly by a non-vault account", async function () {
      await expect(
        matchingEngine.connect(addr1).placeOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          0,  // Buy
          150,
          50
        )
      ).to.be.revertedWith("Only vault allowed");
    });
  });

  describe("Order Best Retrieval", function () {
    it("should retrieve the best buy order", async function () {
      // --- 複数の Buy Order を Vault 経由で発行 ---
      
      // 1つ目の注文（price として 150 を採用＝amountIn 150）
      await tokenA.connect(admin).transfer(await addr1.getAddress(), 1000);
      await tokenA.connect(addr1).approve(await vault.getAddress(), 300);
      await vault.connect(addr1).deposit(await tokenA.getAddress(), 150);
      const preApprovalId1 = ethers.getBytes("approved1");
      let messageHash1 = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "uint256", "bytes32"],
        [
          await addr1.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          150,
          0,
          preApprovalId1,
        ]
      );
      const signature1 = await addr1.signMessage(ethers.getBytes(messageHash1));
      const tradeRequest1 = {
        user: await addr1.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 150,
        minAmountOut: 0,
        preApprovalId: preApprovalId1,
        side: 0,
        signature: signature1,
      };
      await vault.connect(addr2).executeTradeBatch([tradeRequest1]);

      // 2つ目の注文（price＝160 として amountIn 160）
      await tokenA.connect(admin).transfer(await addr2.getAddress(), 1000);
      await tokenA.connect(addr2).approve(await vault.getAddress(), 300);
      await vault.connect(addr2).deposit(await tokenA.getAddress(), 160);
      const preApprovalId2 = ethers.getBytes("approved2");
      let messageHash2 = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "uint256", "bytes32"],
        [
          await addr2.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          160,
          0,
          preApprovalId2,
        ]
      );
      const signature2 = await addr2.signMessage(ethers.getBytes(messageHash2));
      const tradeRequest2 = {
        user: await addr2.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 160,
        minAmountOut: 0,
        preApprovalId: preApprovalId2,
        side: 0,
        signature: signature2,
      };
      await vault.connect(addr2).executeTradeBatch([tradeRequest2]);

      // --- Best Order の検証 ---
      const pairId = await matchingEngine.getPairId(await tokenA.getAddress(), await tokenB.getAddress());
      const bestBuy = await matchingEngine.getBestOrder(pairId, 0);
      // 複数注文中、より高い price (=160) のものがベストとなるはず
      expect(bestBuy.price).to.equal(160);
    });
  });

  describe("Order Cancellation", function () {
    it("should cancel an active order and mark it inactive", async function () {
      // --- addr1 によるデポジット ---
      await tokenA.connect(admin).transfer(await addr1.getAddress(), 1000);
      await tokenA.connect(addr1).approve(await vault.getAddress(), 200);
      await vault.connect(addr1).deposit(await tokenA.getAddress(), 100);

      // --- 注文発行 ---
      const preApprovalId = ethers.getBytes("approved");
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "uint256", "bytes32"],
        [
          await addr1.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          100,
          0,
          preApprovalId,
        ]
      );
      const signature = await addr1.signMessage(ethers.getBytes(messageHash));
      const tradeRequest = {
        user: await addr1.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 100,
        minAmountOut: 0,
        preApprovalId: preApprovalId,
        side: 0,
        signature: signature,
      };
      await vault.connect(addr2).executeTradeBatch([tradeRequest]);
      const orderId = 0;

      // --- Vault 経由でキャンセル実行 ---
      await vault.connect(addr1).cancelOrder(orderId);

      const order = await matchingEngine.orders(orderId);
      expect(order.active).to.equal(false);
    });
  });
});
