import { BigInt } from "@graphprotocol/graph-ts";
import { Token } from "../generated/schema";

// 既知のトークン情報を初期化する関数
export function initializeKnownTokens(): void {
  // WETH
  let wethId = "0xaC9396e4FD04bD298E5d5ECb3bA712137580F669";
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
  let usdcId = "0xCBEAb9095EB6505551c5aF1cb685f31A0bc6124a";
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
  let wbtcId = "0x08c024d64A212d1e78240Cf642318249ABE077D4";
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
  let polId = "0xc23b5bb2b95311041DB97C1032C9BCaE592BdF5C";
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