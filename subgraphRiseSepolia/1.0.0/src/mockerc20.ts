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
    if (lowerTokenId == "0x7b545bcC53bC1A636ce0CB8a31125dA2efF8FA58") {
      token.symbol = "WETH";
    } else if (lowerTokenId == "0x5503EeC97f3B1Ac7F56Ab884Aa7323794e2bBFD9") {
      token.symbol = "USDC";
    } else if (lowerTokenId == "0x8208d46B0423907d5B09C0C39805f5A69D5d5854") {
      token.symbol = "WBTC";
    } else if (lowerTokenId == "0x32417634896eA54126f1220cA877c46125814623") {
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