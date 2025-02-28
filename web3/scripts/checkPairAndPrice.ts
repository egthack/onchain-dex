import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main(): Promise<void> {
  // 最新のデプロイメント情報を取得する関数
  function getLatestDeployment(network: string): {
    tokens: Record<string, string>;
    trading: Record<string, string>;
  } {
    const deploymentPath = path.join(__dirname, "../../deployments", network);
    const files = fs
      .readdirSync(deploymentPath)
      .filter((f) => f.startsWith(`deployment-${network}`))
      .sort((a, b) => {
        const timeA = parseInt(a.split("-").pop()?.replace(".json", "") || "0");
        const timeB = parseInt(b.split("-").pop()?.replace(".json", "") || "0");
        return timeB - timeA;
      });

    if (files.length === 0) {
      throw new Error(`No deployment found for network: ${network}`);
    }

    const deployment = JSON.parse(
      fs.readFileSync(path.join(deploymentPath, files[0]), "utf8")
    );
    return deployment.contracts;
  }

  const deployments = getLatestDeployment("riseSepolia");
  const matchingEngineAddress: string = deployments.trading.matchingEngine;

  // 問題のトークンアドレス
  const baseToken = "0x793910b74a9A9Bf3B929fe11FdE2Ed934aB37EF5";
  const quoteToken = "0xfa2777F5E1d4e213974e209E2Da6638Ece5E6132";

  // MatchingEngineコントラクトのインスタンスを取得
  const MatchingEngine = await ethers.getContractFactory("MatchingEngine");
  const matchingEngine = MatchingEngine.attach(matchingEngineAddress) as any;

  console.log("--------------------------------------------------");
  console.log("ペアとベストプライスの確認");
  console.log("--------------------------------------------------");
  console.log(`Base Token: ${baseToken}`);
  console.log(`Quote Token: ${quoteToken}`);

  // 正方向のペアID
  const pairId = await matchingEngine.getPairId(baseToken, quoteToken);
  console.log(`Pair ID: ${pairId}`);

  // 逆方向のペアID
  const reversePairId = await matchingEngine.getPairId(quoteToken, baseToken);
  console.log(`Reverse Pair ID: ${reversePairId}`);

  // ペアの存在確認
  try {
    const pairInfo = await matchingEngine.getPair(pairId);
    console.log("Pair Info:", pairInfo);
  } catch (error) {
    console.log("ペアが存在しません");
  }

  // ベストプライスの確認
  try {
    const bestBuyPrice = await matchingEngine.getBestBuyPrice(pairId);
    console.log(`Best Buy Price: ${bestBuyPrice.toString()}`);
  } catch (error) {
    console.log("getBestBuyPrice エラー:", error);
  }

  try {
    const bestSellPrice = await matchingEngine.getBestSellPrice(pairId);
    console.log(`Best Sell Price: ${bestSellPrice.toString()}`);
  } catch (error) {
    console.log("getBestSellPrice エラー:", error);
  }

  // 注文の確認
  const orderId = 1; // 問題の注文ID
  try {
    const order = await matchingEngine.getOrder(orderId);
    console.log("--------------------------------------------------");
    console.log(`Order ID: ${orderId}`);
    console.log(`User: ${order.user}`);
    console.log(`Base Token: ${order.base}`);
    console.log(`Quote Token: ${order.quote}`);
    console.log(`Price: ${order.price.toString()}`);
    console.log(`Amount: ${order.amount.toString()}`);
    console.log(`Side: ${order.side.toString()}`); // 0: Buy, 1: Sell
    console.log(`Active: ${order.active}`);

    // この注文のペアIDを計算
    const orderPairId = await matchingEngine.getPairId(order.base, order.quote);
    console.log(`Order's Pair ID: ${orderPairId}`);

    // このペアIDでのベストプライスを確認
    try {
      const bestBuyPrice = await matchingEngine.getBestBuyPrice(orderPairId);
      console.log(`Best Buy Price for this pair: ${bestBuyPrice.toString()}`);
    } catch (error) {
      console.log("このペアのgetBestBuyPrice エラー:", error);
    }
  } catch (error) {
    console.error(`Order ${orderId} の取得に失敗しました`, error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("main エラー:", error);
    process.exit(1);
  });
