import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { MockERC20 } from "../generated/templates/MockERC20Template/MockERC20";
import { MockERC20Template } from "../generated/templates";
import { Token } from "../generated/schema";

// トークンの情報を取得するためのヘルパー関数
export function fetchTokenInfo(tokenAddress: Address): void {
  let tokenId = tokenAddress.toHexString();
  let token = Token.load(tokenId);
  
  if (token == null) {
    token = new Token(tokenId);
    token.totalVolume = BigInt.fromI32(0);
    token.symbol = ""; // 初期値を空文字列に設定
    token.decimals = 0;
    token.save();
  }
  
  // テンプレートの作成（必ず呼び出す）
  MockERC20Template.create(tokenAddress);
  
  // シンボルとデシマル情報を直接取得する
  let tokenContract = MockERC20.bind(tokenAddress);
  
  // シンボルの取得
  let symbolCall = tokenContract.try_symbol();
  if (!symbolCall.reverted) {
    // 成功した場合
    log.info("Symbol for token {} is {}", [tokenId, symbolCall.value]);
    token.symbol = symbolCall.value;
  } else {
    // 失敗した場合はハードコーディングを試みる
    log.warning("Failed to get symbol for token {}", [tokenId]);
    
    // 既知のトークンアドレスの場合はハードコーディングする
    let lowerTokenId = tokenId.toLowerCase();
    if (lowerTokenId == "0xaC9396e4FD04bD298E5d5ECb3bA712137580F669") {
      token.symbol = "WETH";
    } else if (lowerTokenId == "0xCBEAb9095EB6505551c5aF1cb685f31A0bc6124a") {
      token.symbol = "USDC";
    } else if (lowerTokenId == "0x08c024d64A212d1e78240Cf642318249ABE077D4") {
      token.symbol = "WBTC";
    } else if (lowerTokenId == "0xc23b5bb2b95311041DB97C1032C9BCaE592BdF5C") {
      token.symbol = "POL";
    } else {
      // 不明なトークンの場合は短縮アドレスを使用
      token.symbol = "TKN-" + tokenId.slice(2, 6);
    }
  }
  
  // デシマルの取得
  let decimalsCall = tokenContract.try_decimals();
  if (!decimalsCall.reverted) {
    token.decimals = decimalsCall.value;
  }
  
  token.save();
}