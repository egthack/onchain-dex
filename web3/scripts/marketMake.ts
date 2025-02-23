import { ethers } from "hardhat";
import { MatchingEngine, TradingVault, MockERC20 } from "../typechain-types";
import { createTradeRequest } from "../test/helpers/tradeHelper";
import fs from "fs";
import path from "path";
import * as hre from "hardhat";

// 最新のデプロイメント情報を取得する関数
function getLatestDeployment(network: string): Record<string, string> {
  const deploymentPath = path.join(__dirname, "../deployments");
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

async function main() {
  const [deployer] = await ethers.getSigners();

  // デプロイされたコントラクトのアドレスを取得
  const network = hre.network.name;
  const addresses = getLatestDeployment(network);

  // コントラクトのアドレスを設定
  const MATCHING_ENGINE_ADDRESS = addresses.matchingEngine;
  const TRADING_VAULT_ADDRESS = addresses.tradingVault;
  const BASE_TOKEN_ADDRESS = addresses.baseToken;
  const QUOTE_TOKEN_ADDRESS = addresses.quoteToken;

  // コントラクトのインスタンスを取得
  const matchingEngine = (await ethers.getContractAt(
    "MatchingEngine",
    MATCHING_ENGINE_ADDRESS
  )) as MatchingEngine;
  const vault = (await ethers.getContractAt(
    "TradingVault",
    TRADING_VAULT_ADDRESS
  )) as TradingVault;
  const baseToken = (await ethers.getContractAt(
    "MockERC20",
    BASE_TOKEN_ADDRESS
  )) as MockERC20;
  const quoteToken = (await ethers.getContractAt(
    "MockERC20",
    QUOTE_TOKEN_ADDRESS
  )) as MockERC20;

  // 現在の最良気配値を取得
  const pairs = await matchingEngine.getPair(0);
  console.log(pairs);

  // 現在価格を決定（最良気配値の中間値、または最新約定価格など）
  let currentPrice: number;
  if (bestBuyPrice > 0 && bestSellPrice > 0) {
    currentPrice = Math.floor(
      (Number(bestBuyPrice) + Number(bestSellPrice)) / 2
    );
  } else if (bestBuyPrice > 0) {
    currentPrice = Number(bestBuyPrice);
  } else if (bestSellPrice > 0) {
    currentPrice = Number(bestSellPrice);
  } else {
    currentPrice = 100; // デフォルト価格
  }

  //   // 注文を生成
  //   const orders = [];
  //   const SPREAD = 1; // 価格間隔
  //   const ORDER_SIZE = 10; // 1注文あたりの数量
  //   const ORDER_COUNT = 10; // 片側の注文数

  //   // 売り注文を生成（現在価格より高い価格帯）
  //   for (let i = 1; i <= ORDER_COUNT; i++) {
  //     const sellOrder = await createTradeRequest({
  //       user: deployer,
  //       base: baseToken,
  //       quote: quoteToken,
  //       side: 1, // Sell
  //       amount: ORDER_SIZE,
  //       price: currentPrice + i * SPREAD,
  //     });
  //     orders.push(sellOrder);
  //   }

  //   // 買い注文を生成（現在価格より低い価格帯）
  //   for (let i = 1; i <= ORDER_COUNT; i++) {
  //     const buyOrder = await createTradeRequest({
  //       user: deployer,
  //       base: baseToken,
  //       quote: quoteToken,
  //       side: 0, // Buy
  //       amount: ORDER_SIZE,
  //       price: currentPrice - i * SPREAD,
  //     });
  //     orders.push(buyOrder);
  //   }

  //   // 注文を実行
  //   console.log(
  //     `Placing ${orders.length} orders around price ${currentPrice}...`
  //   );
  //   try {
  //     const tx = await vault.connect(deployer).executeTradeBatch(orders);
  //     await tx.wait();
  //     console.log("Market making orders placed successfully!");
  //   } catch (error) {
  //     console.error("Error placing orders:", error);
  //   }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
