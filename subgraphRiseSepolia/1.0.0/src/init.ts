import { BigInt } from "@graphprotocol/graph-ts";
import { Token } from "../generated/schema";

// 既知のトークン情報を初期化する関数
export function initializeKnownTokens(): void {
  // WETH
  let wethId = "0x27F1F278c03f6C027C1Da24CB5090a50FeB3BBe3";
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
  let usdcId = "0x21Dd0A0Bc9D9696877eCb444d5306D6675e228cC";
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
  let wbtcId = "0xE7bDa28014BEb92B7657742de4AfDF85FA892640";
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
  let polId = "0x58cc332FB73FE6B96F2EbFf3A6dc4De6dF0fC751";
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