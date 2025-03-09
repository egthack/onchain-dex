import { BigInt } from "@graphprotocol/graph-ts";
import { Token } from "../generated/schema";

// 既知のトークン情報を初期化する関数
export function initializeKnownTokens(): void {
  // WETH
  let wethId = "0x7b545bcC53bC1A636ce0CB8a31125dA2efF8FA58";
  let weth = Token.load(wethId);
  if (weth == null) {
    weth = new Token(wethId);
    weth.symbol = "WETH";
    weth.decimals = 18;
    weth.totalVolume = BigInt.fromI32(0);
    weth.save();
  } else if (weth.symbol == null || weth.symbol == "") {
    weth.symbol = "WETH";
    weth.save();
  }

  // USDC
  let usdcId = "0x5503EeC97f3B1Ac7F56Ab884Aa7323794e2bBFD9";
  let usdc = Token.load(usdcId);
  if (usdc == null) {
    usdc = new Token(usdcId);
    usdc.symbol = "USDC";
    usdc.decimals = 6;
    usdc.totalVolume = BigInt.fromI32(0);
    usdc.save();
  } else if (usdc.symbol == null || usdc.symbol == "") {
    usdc.symbol = "USDC";
    usdc.save();
  }

  // WBTC
  let wbtcId = "0x8208d46B0423907d5B09C0C39805f5A69D5d5854";
  let wbtc = Token.load(wbtcId);
  if (wbtc == null) {
    wbtc = new Token(wbtcId);
    wbtc.symbol = "WBTC";
    wbtc.decimals = 8;
    wbtc.totalVolume = BigInt.fromI32(0);
    wbtc.save();
  } else if (wbtc.symbol == null || wbtc.symbol == "") {
    wbtc.symbol = "WBTC";
    wbtc.save();
  }

  // POL
  let polId = "0x32417634896eA54126f1220cA877c46125814623";
  let pol = Token.load(polId);
  if (pol == null) {
    pol = new Token(polId);
    pol.symbol = "POL";
    pol.decimals = 18;
    pol.totalVolume = BigInt.fromI32(0);
    pol.save();
  } else if (pol.symbol == null || pol.symbol == "") {
    pol.symbol = "POL";
    pol.save();
  }
}