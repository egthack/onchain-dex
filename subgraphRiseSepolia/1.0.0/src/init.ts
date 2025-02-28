import { BigInt } from "@graphprotocol/graph-ts";
import { Token } from "../generated/schema";

// 既知のトークン情報を初期化する関数
export function initializeKnownTokens(): void {
  // WETH
  let wethId = "0x793910b74a9A9Bf3B929fe11FdE2Ed934aB37EF5";
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
  let usdcId = "0xfa2777F5E1d4e213974e209E2Da6638Ece5E6132";
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
  let wbtcId = "0x64011088563F8e98fd25F403f7A0Bb94820F5265";
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
  let polId = "0x70D58973809a4EBBebCCe047b2dE06F4C37F61b6";
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