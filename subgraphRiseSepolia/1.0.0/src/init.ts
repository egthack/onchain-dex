import { BigInt } from "@graphprotocol/graph-ts";
import { Token } from "../generated/schema";

// 既知のトークン情報を初期化する関数
export function initializeKnownTokens(): void {
  // WETH
  let wethId = "0xb0fa0536a85dfbfa078f51d8a52a009a86f7cc72";
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
  let usdcId = "0xf96c5d210da8ad33b2badeedf59ccaebbb4e2629";
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
  let wbtcId = "0xd59874cec35c7e9ff121e27ac72367bbc28f3fe8";
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
  let polId = "0xfb9519fd8730bff3cf8469c5634b6338e95a378e";
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