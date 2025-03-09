import { ethers } from "hardhat";
import {
  MatchingEngine,
  TradingVault,
  MockERC20,
  IMatchingEngine,
} from "../typechain-types";
import fs from "fs";
import path from "path";
import * as hre from "hardhat";
import { createTradeRequest } from "../test/helpers/tradeHelper";

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

async function getAllOrders(
  matchingEngine: MatchingEngine,
  pairId: string,
  side: number,
  pageSize: number = 100
) {
  let startPrice = 0n;
  let allOrders: IMatchingEngine.OrderStructOutput[] = [];
  let totalCount = 0;

  while (true) {
    const page = await matchingEngine.getOrdersWithPagination(
      pairId,
      side,
      startPrice,
      pageSize
    );

    allOrders = [...allOrders, ...page.orders];
    totalCount = Number(page.totalCount);

    console.log(
      `Fetched ${page.orders.length} orders. Progress: ${allOrders.length}/${totalCount}`
    );

    if (page.nextPrice === 0n) break;
    startPrice = page.nextPrice;
  }

  return allOrders;
}

async function main() {
  const [deployer] = await ethers.getSigners();

  // デプロイされたコントラクトのアドレスを取得
  const network = hre.network.name;
  const deployment = {
    contracts: getLatestDeployment(network),
  };

  // コントラクトのインスタンスを取得
  const matchingEngine = (await ethers.getContractAt(
    "MatchingEngine",
    deployment.contracts.trading.matchingEngine
  )) as MatchingEngine;
  const vault = (await ethers.getContractAt(
    "TradingVault",
    deployment.contracts.trading.tradingVault
  )) as TradingVault;

  // 各ペアに対して板を並べる
  // priceはデフォルト
  const baseTokens = {
    WBTC: {
      symbol: "WBTC",
      price: 30000 * 10 ** 2, // 30000 USD
      amount: 10000, // 0.01 WBTC
    },
    WETH: {
      symbol: "WETH",
      price: 3000 * 10 ** 2,
      amount: 10000,
    },
    POL: {
      symbol: "POL",
      price: 5 * 10 ** 2,
      amount: 10000,
    },
    TRUMP: {
      symbol: "TRUMP",
      price: 0.5 * 10 ** 2,
      amount: 10000,
    },
  };

  for (const token of Object.values(baseTokens)) {
    console.log(`Setting up ${token.symbol}/USDC pair...`);

    const baseToken = (await ethers.getContractAt(
      "MockERC20",
      deployment.contracts.tokens[token.symbol]
    )) as MockERC20;
    const quoteToken = (await ethers.getContractAt(
      "MockERC20",
      deployment.contracts.tokens.USDC
    )) as MockERC20;

    // Vaultへのデポジット準備
    const baseDecimals = await baseToken.decimals();
    const quoteDecimals = await quoteToken.decimals();
    const baseAmount = BigInt(1000) * BigInt(10) ** BigInt(baseDecimals);
    // USDCのデポジット量を増やす（価格 * 数量 * 注文数 * 安全係数）
    const quoteAmount =
      BigInt(Math.ceil(token.price * token.amount * 20 * 1.5)) *
      BigInt(10) ** BigInt(quoteDecimals);

    // approve
    const approveBaseTx = await baseToken
      .connect(deployer)
      .approve(deployment.contracts.trading.tradingVault, baseAmount);
    await approveBaseTx.wait();
    const approveQuoteTx = await quoteToken
      .connect(deployer)
      .approve(deployment.contracts.trading.tradingVault, quoteAmount);
    await approveQuoteTx.wait();
    // deposit
    const depositBaseTx = await vault
      .connect(deployer)
      .deposit(deployment.contracts.tokens[token.symbol], baseAmount);
    await depositBaseTx.wait();
    const depositQuoteTx = await vault
      .connect(deployer)
      .deposit(deployment.contracts.tokens.USDC, quoteAmount);
    await depositQuoteTx.wait();
    // 注文を生成
    const pairId = await matchingEngine.getPairId(
      deployment.contracts.tokens[token.symbol],
      deployment.contracts.tokens.USDC
    );

    // 現在の最良気配値を取得
    let bestBuyPrice = 0n;
    let bestSellPrice = 0n;
    try {
      bestBuyPrice = await matchingEngine.getBestBuyPrice(pairId);
      bestSellPrice = await matchingEngine.getBestSellPrice(pairId);
    } catch (error) {
      console.log("No existing orders found, using default price");
    }

    // 現在価格を決定
    let currentPrice: number;
    if (bestBuyPrice > 0n && bestSellPrice > 0n) {
      // 注文がある場合は平均を現在価格とする
      console.log(
        `use average of best buy price and best sell price as current price: ${bestBuyPrice}, ${bestSellPrice}`
      );
      currentPrice = Math.floor(
        (Number(bestBuyPrice) + Number(bestSellPrice)) / 2
      );
    } else if (bestBuyPrice > 0n) {
      console.log(`use best buy price as current price: ${bestBuyPrice}`);
      // 買い注文のみがある場合は買い注文の価格を現在価格とする
      currentPrice = Number(bestBuyPrice);
    } else if (bestSellPrice > 0n) {
      // 売り注文のみがある場合は売り注文の価格を現在価格とする
      console.log(`use best sell price as current price: ${bestSellPrice}`);
      currentPrice = Number(bestSellPrice);
    } else {
      console.log(`use default price: ${token.price}`);
      currentPrice = token.price;
    }

    console.log(`Current price: ${currentPrice}`);

    const orders = [];
    const ORDER_COUNT = 10;

    // 0.1%スプレッドとして並べる
    const calculateSpread = (price: number, multiplier: number) => {
      return Math.floor(price * multiplier * 0.001);
    };

    // 売り注文を生成（現在価格より高い価格帯）
    for (let i = 1; i <= ORDER_COUNT; i++) {
      orders.push(
        await createTradeRequest({
          user: deployer,
          base: baseToken,
          quote: quoteToken,
          side: 1, // Sell
          amount: token.amount,
          price: currentPrice + calculateSpread(currentPrice, i),
        })
      );
    }

    // 買い注文を生成（現在価格より低い価格帯）
    for (let i = 1; i <= ORDER_COUNT; i++) {
      orders.push(
        await createTradeRequest({
          user: deployer,
          base: baseToken,
          quote: quoteToken,
          side: 0, // Buy
          amount: token.amount,
          price: currentPrice - calculateSpread(currentPrice, i),
        })
      );
    }
    console.log(`orders: ${JSON.stringify(orders)}`);

    // 注文を実行
    console.log(`Placing ${orders.length} orders for ${token.symbol}/USDC`);
    try {
      const tx = await vault.connect(deployer).executeTradeBatch(orders);
      await tx.wait();
      console.log(`Orders placed for ${token.symbol}/USDC`);

      // 板の状態を確認
      const buyOrders = await getAllOrders(matchingEngine, pairId, 0);
      const sellOrders = await getAllOrders(matchingEngine, pairId, 1);
      console.log(
        `${token.symbol}/USDC Buy orders:`,
        buyOrders.map((o) => ({
          id: o.id,
          side: "Buy",
          price: o.price,
          amount: o.amount,
          user: o.user,
        }))
      );
      console.log(
        `${token.symbol}/USDC Sell orders:`,
        sellOrders.map((o) => ({
          id: o.id,
          side: "Sell",
          price: o.price,
          amount: o.amount,
          user: o.user,
        }))
      );
    } catch (error) {
      console.error(`Error placing orders for ${token.symbol}/USDC:`, error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
