import { BigInt, Address, Bytes, BigDecimal } from "@graphprotocol/graph-ts";
import {
  OrderPlaced as OrderPlacedEvent,
  TradeExecuted as TradeExecutedEvent,
  PairAdded as PairAddedEvent
} from "../generated/MatchingEngine/MatchingEngine";
import {
  User,
  Token,
  Order,
  LastTrade,
  Trade
} from "../generated/schema";
import { fetchTokenInfo } from "./mockerc20";
import { initializeKnownTokens } from "./init";

export function handleOrderPlaced(event: OrderPlacedEvent): void {
  // 既知のトークン情報を初期化
  initializeKnownTokens();
  
  let orderId = event.params.orderId.toString();
  let userId = event.params.user.toHexString();
  let baseTokenId = event.params.base.toHexString();
  let quoteTokenId = event.params.quote.toHexString();

  // ユーザーの取得または作成
  let user = User.load(userId);
  if (user == null) {
    user = new User(userId);
    user.totalDeposited = BigInt.fromI32(0);
    user.totalWithdrawn = BigInt.fromI32(0);
    user.createdAt = event.block.timestamp;
    user.updatedAt = event.block.timestamp;
    user.save();
  }

  // ベーストークンの取得または作成
  let baseToken = Token.load(baseTokenId);
  if (baseToken == null) {
    baseToken = new Token(baseTokenId);
    baseToken.totalVolume = BigInt.fromI32(0);
    baseToken.save();
  }
  
  // ベーストークン情報の取得
  fetchTokenInfo(event.params.base);

  // クォートトークンの取得または作成
  let quoteToken = Token.load(quoteTokenId);
  if (quoteToken == null) {
    quoteToken = new Token(quoteTokenId);
    quoteToken.totalVolume = BigInt.fromI32(0);
    quoteToken.save();
  }
  
  // クォートトークン情報の取得
  fetchTokenInfo(event.params.quote);

  // 注文の作成
  let order = new Order(orderId);
  order.user = userId;
  order.baseToken = baseTokenId;
  order.quoteToken = quoteTokenId;
  order.side = event.params.side;
  order.price = event.params.price;
  order.amount = event.params.amount;
  order.lockedAmount = event.params.side == 0 
    ? event.params.price.times(event.params.amount) // Buy: price * amount
    : event.params.amount; // Sell: amount
  order.status = "OPEN";
  order.createdAt = event.block.timestamp;
  order.transaction = event.transaction.hash;
  order.save();
}

export function handleTradeExecuted(event: TradeExecutedEvent): void {
  // 既知のトークン情報を初期化
  initializeKnownTokens();
  
  let makerOrderId = event.params.makerOrderId.toString();
  let takerOrderId = event.params.takerOrderId.toString();
  let baseTokenId = event.params.base.toHexString();
  let quoteTokenId = event.params.quote.toHexString();
  
  // 注文の更新
  let makerOrder = Order.load(makerOrderId);
  let takerOrder = Order.load(takerOrderId);
  
  if (makerOrder != null) {
    // 完全に約定した場合
    if (makerOrder.amount.equals(event.params.amount)) {
      makerOrder.status = "FILLED";
      makerOrder.filledAt = event.block.timestamp;
    } else {
      // 部分約定の場合は残量を更新
      makerOrder.amount = makerOrder.amount.minus(event.params.amount);
      makerOrder.lockedAmount = makerOrder.side == 0
        ? makerOrder.price.times(makerOrder.amount)
        : makerOrder.amount;
    }
    makerOrder.save();
  }
  
  if (takerOrder != null) {
    // 完全に約定した場合
    if (takerOrder.amount.equals(event.params.amount)) {
      takerOrder.status = "FILLED";
      takerOrder.filledAt = event.block.timestamp;
    } else {
      // 部分約定の場合は残量を更新
      takerOrder.amount = takerOrder.amount.minus(event.params.amount);
      takerOrder.lockedAmount = takerOrder.side == 0
        ? takerOrder.price.times(takerOrder.amount)
        : takerOrder.amount;
    }
    takerOrder.save();
  }
  
  // トークンの取引量を更新
  let baseToken = Token.load(baseTokenId);
  if (baseToken != null) {
    baseToken.totalVolume = baseToken.totalVolume.plus(event.params.amount);
    baseToken.save();
  }
  
  // ベーストークン情報の取得
  fetchTokenInfo(event.params.base);
  
  let quoteToken = Token.load(quoteTokenId);
  if (quoteToken != null) {
    let tradeValue = event.params.price.times(event.params.amount);
    quoteToken.totalVolume = quoteToken.totalVolume.plus(tradeValue);
    quoteToken.save();
  }
  
  // クォートトークン情報の取得
  fetchTokenInfo(event.params.quote);
  
  // 最新の取引情報を保存
  // lastTradeのIDは baseToken-quoteToken の形式で作成
  let lastTradeId = baseTokenId + "-" + quoteTokenId;
  let lastTrade = LastTrade.load(lastTradeId);
  
  // 新しい取引情報のエンティティを作成
  let tradeId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let trade = new Trade(tradeId);
  trade.makerOrderId = event.params.makerOrderId;
  trade.takerOrderId = event.params.takerOrderId;
  trade.baseToken = baseTokenId;
  trade.quoteToken = quoteTokenId;
  trade.price = event.params.price;
  trade.amount = event.params.amount;
  // サイドはtakerOrderのサイドを使用
  trade.side = takerOrder != null ? takerOrder.side : 0;
  trade.timestamp = event.block.timestamp;
  trade.transaction = event.transaction.hash;
  trade.save();
  
  if (lastTrade == null) {
    // 新規作成
    lastTrade = new LastTrade(lastTradeId);
    lastTrade.baseToken = baseTokenId;
    lastTrade.quoteToken = quoteTokenId;
    lastTrade.lastPrice = event.params.price;
    lastTrade.lastAmount = event.params.amount;
    lastTrade.lastTimestamp = event.block.timestamp;
    lastTrade.highPrice24h = event.params.price;
    lastTrade.lowPrice24h = event.params.price;
    lastTrade.volume24h = event.params.amount;
    lastTrade.quoteVolume24h = event.params.price.times(event.params.amount);
    lastTrade.priceChangePercent = BigDecimal.fromString("0");
    lastTrade.updatedAt = event.block.timestamp;
  } else {
    // 既存レコードの更新
    // 前回の価格を保存して変化率を計算
    let oldPrice = lastTrade.lastPrice;
    
    // 最新の価格情報を更新
    lastTrade.lastPrice = event.params.price;
    lastTrade.lastAmount = event.params.amount;
    lastTrade.lastTimestamp = event.block.timestamp;
    
    // 24時間の価格範囲を更新
    if (event.params.price.gt(lastTrade.highPrice24h)) {
      lastTrade.highPrice24h = event.params.price;
    }
    if (event.params.price.lt(lastTrade.lowPrice24h)) {
      lastTrade.lowPrice24h = event.params.price;
    }
    
    // 24時間の取引量を更新
    // 実際には24時間経過したら古いデータをリセットするロジックが必要
    let oneDayAgo = event.block.timestamp.minus(BigInt.fromI32(86400)); // 24時間 = 86400秒
    
    if (lastTrade.updatedAt.lt(oneDayAgo)) {
      // 24時間以上経過している場合はリセット
      lastTrade.volume24h = event.params.amount;
      lastTrade.quoteVolume24h = event.params.price.times(event.params.amount);
      // 価格変化率もリセット
      lastTrade.priceChangePercent = BigDecimal.fromString("0");
    } else {
      // 24時間以内の場合は加算
      lastTrade.volume24h = lastTrade.volume24h.plus(event.params.amount);
      lastTrade.quoteVolume24h = lastTrade.quoteVolume24h.plus(event.params.price.times(event.params.amount));
      
      // 価格変化率を計算
      if (!oldPrice.isZero()) {
        let priceDiff = event.params.price.minus(oldPrice).toBigDecimal();
        let oldPriceDecimal = oldPrice.toBigDecimal();
        let changePercent = priceDiff.times(BigDecimal.fromString("100")).div(oldPriceDecimal);
        lastTrade.priceChangePercent = changePercent;
      }
    }
    
    lastTrade.updatedAt = event.block.timestamp;
  }
  
  lastTrade.save();
}

export function handlePairAdded(event: PairAddedEvent): void {
  // 既知のトークン情報を初期化
  initializeKnownTokens();
  
  let baseTokenId = event.params.base.toHexString();
  let quoteTokenId = event.params.quote.toHexString();
  
  // ベーストークンの取得または作成
  let baseToken = Token.load(baseTokenId);
  if (baseToken == null) {
    baseToken = new Token(baseTokenId);
    baseToken.totalVolume = BigInt.fromI32(0);
    baseToken.decimals = event.params.decimals[0].toI32();
    baseToken.save();
  }
  
  // ベーストークン情報の取得
  fetchTokenInfo(event.params.base);
  
  // クォートトークンの取得または作成
  let quoteToken = Token.load(quoteTokenId);
  if (quoteToken == null) {
    quoteToken = new Token(quoteTokenId);
    quoteToken.totalVolume = BigInt.fromI32(0);
    quoteToken.decimals = event.params.decimals[1].toI32();
    quoteToken.save();
  }
  
  // クォートトークン情報の取得
  fetchTokenInfo(event.params.quote);
  
  // ペアの初期化（LastTradeエンティティの初期化）
  let lastTradeId = baseTokenId + "-" + quoteTokenId;
  let lastTrade = LastTrade.load(lastTradeId);
  
  if (lastTrade == null) {
    lastTrade = new LastTrade(lastTradeId);
    lastTrade.baseToken = baseTokenId;
    lastTrade.quoteToken = quoteTokenId;
    lastTrade.lastPrice = BigInt.fromI32(0);
    lastTrade.lastAmount = BigInt.fromI32(0);
    lastTrade.lastTimestamp = event.block.timestamp;
    lastTrade.highPrice24h = BigInt.fromI32(0);
    lastTrade.lowPrice24h = BigInt.fromI32(0);
    lastTrade.volume24h = BigInt.fromI32(0);
    lastTrade.quoteVolume24h = BigInt.fromI32(0);
    lastTrade.priceChangePercent = BigDecimal.fromString("0");
    lastTrade.updatedAt = event.block.timestamp;
    lastTrade.save();
  }
}