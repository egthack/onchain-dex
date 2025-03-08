import { BigInt, Address } from "@graphprotocol/graph-ts";
import {
  Deposit as DepositEvent,
  Withdrawal as WithdrawalEvent,
  OrderCancelled as OrderCancelledEvent,
  TradingVault
} from "../generated/TradingVault/TradingVault";
import {
  User,
  Token,
  Balance,
  Deposit,
  Withdrawal,
  Order,
} from "../generated/schema";
import { fetchTokenInfo } from "./mockerc20";
import { initializeKnownTokens } from "./init";

// このマッピングファイルがロードされた時に実行される関数
export function handleDeposit(event: DepositEvent): void {
  // 既知のトークン情報を初期化
  initializeKnownTokens();
  
  let userId = event.params.user.toHexString();
  let tokenId = event.params.token.toHexString();
  let balanceId = userId + "-" + tokenId;

  // ユーザーの取得または作成
  let user = User.load(userId);
  if (user == null) {
    user = new User(userId);
    user.totalDeposited = BigInt.fromI32(0);
    user.totalWithdrawn = BigInt.fromI32(0);
    user.createdAt = event.block.timestamp;
  }
  user.updatedAt = event.block.timestamp;
  user.totalDeposited = user.totalDeposited.plus(event.params.amount);
  user.save();

  // トークンの取得または作成
  let token = Token.load(tokenId);
  if (token == null) {
    token = new Token(tokenId);
    token.totalVolume = BigInt.fromI32(0);
  }
  token.totalVolume = token.totalVolume.plus(event.params.amount);
  token.save();
  
  // トークン情報の取得
  fetchTokenInfo(event.params.token);

  // 残高の取得または作成
  let balance = Balance.load(balanceId);
  if (balance == null) {
    balance = new Balance(balanceId);
    balance.user = userId;
    balance.token = tokenId;
    balance.amount = BigInt.fromI32(0);
  }
  balance.amount = balance.amount.plus(event.params.amount);
  balance.updatedAt = event.block.timestamp;
  balance.save();

  // デポジットイベントの記録
  let depositId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let deposit = new Deposit(depositId);
  deposit.user = userId;
  deposit.token = tokenId;
  deposit.amount = event.params.amount;
  deposit.timestamp = event.block.timestamp;
  deposit.transaction = event.transaction.hash;
  deposit.save();
}

export function handleWithdrawal(event: WithdrawalEvent): void {
  // 既知のトークン情報を初期化
  initializeKnownTokens();
  
  let userId = event.params.user.toHexString();
  let tokenId = event.params.token.toHexString();
  let balanceId = userId + "-" + tokenId;

  // ユーザーの更新
  let user = User.load(userId);
  if (user == null) {
    user = new User(userId);
    user.totalDeposited = BigInt.fromI32(0);
    user.totalWithdrawn = BigInt.fromI32(0);
    user.createdAt = event.block.timestamp;
  }
  user.updatedAt = event.block.timestamp;
  user.totalWithdrawn = user.totalWithdrawn.plus(event.params.amount);
  user.save();

  // トークンの更新
  let token = Token.load(tokenId);
  if (token == null) {
    token = new Token(tokenId);
    token.totalVolume = BigInt.fromI32(0);
  }
  token.totalVolume = token.totalVolume.plus(event.params.amount);
  token.save();
  
  // トークン情報の取得
  fetchTokenInfo(event.params.token);

  // 残高の更新
  let balance = Balance.load(balanceId);
  if (balance == null) {
    balance = new Balance(balanceId);
    balance.user = userId;
    balance.token = tokenId;
    balance.amount = BigInt.fromI32(0);
  }
  balance.amount = balance.amount.minus(event.params.amount);
  balance.updatedAt = event.block.timestamp;
  balance.save();

  // 引き出しイベントの記録
  let withdrawalId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let withdrawal = new Withdrawal(withdrawalId);
  withdrawal.user = userId;
  withdrawal.token = tokenId;
  withdrawal.amount = event.params.amount;
  withdrawal.timestamp = event.block.timestamp;
  withdrawal.transaction = event.transaction.hash;
  withdrawal.save();
}

export function handleOrderCancelled(event: OrderCancelledEvent): void {
  let orderId = event.params.orderId.toString();
  let order = Order.load(orderId);
  if (order != null) {
    order.status = "CANCELLED";
    order.cancelledAt = event.block.timestamp;
    order.save();
  }
}