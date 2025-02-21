import { ethers } from "hardhat";
import { MatchingEngine, MockERC20, TradingVault } from "../../typechain-types";
import {
  Contract,
  ContractEventName,
  EventFilter,
  Filter,
  Signer,
} from "ethers";
import { TypedContractEvent } from "../../typechain-types/common";
export interface TradeRequest {
  user: string;
  base: string;
  quote: string;
  amount: number;
  price: number;
  side: number;
  signature: string;
}

export async function createTradeRequest({
  user,
  base,
  quote,
  side,
  amount,
  price,
}: {
  user: Signer;
  base: MockERC20;
  quote: MockERC20;
  side: number;
  amount: number;
  price: number;
}): Promise<TradeRequest> {
  const userAddress = await user.getAddress();

  // 署名対象は、ユーザー、base、quote、amount、price、side を連結
  const hash = ethers.keccak256(
    ethers.solidityPacked(
      ["address", "address", "address", "uint256", "uint256", "uint8"],
      [
        userAddress,
        await base.getAddress(),
        await quote.getAddress(),
        amount,
        price,
        side,
      ]
    )
  );
  // signMessage の引数はバイト列に変換
  const signature = await user.signMessage(ethers.getBytes(hash));
  return {
    user: userAddress,
    base: await base.getAddress(),
    quote: await quote.getAddress(),
    amount: amount,
    price: price,
    side: side,
    signature: signature,
  };
}

export async function getContractEvents(
  contract: MatchingEngine | TradingVault,
  event: TypedContractEvent<any, any, any>
) {
  const latestBlock = await ethers.provider.getBlockNumber();
  const events = await contract.queryFilter(event, 0, latestBlock);
  return events;
}

export async function getTokenBalances(
  vault: TradingVault,
  user: Signer,
  base: MockERC20,
  quote: MockERC20
) {
  const userAddress = await user.getAddress();
  const baseAddress = await base.getAddress();
  const quoteAddress = await quote.getAddress();

  const userBalanceBase = await vault.getBalance(userAddress, baseAddress);
  const userBalanceQuote = await vault.getBalance(userAddress, quoteAddress);
  return {
    userBalanceBase,
    userBalanceQuote,
  };
}
