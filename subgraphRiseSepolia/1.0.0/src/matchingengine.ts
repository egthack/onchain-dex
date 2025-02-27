import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  OrderPlaced as OrderPlacedEvent,
  TradeExecuted as TradeExecutedEvent,
  PairAdded as PairAddedEvent
} from "../generated/MatchingEngine/MatchingEngine";
import {
  User,
  Token,
  Order
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
  let baseTokenId = event.params.base.toHexString();
  let quoteTokenId = event.params.quote.toHexString();
  
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
}