import { ethers } from "hardhat";
import { MockERC20 } from "../../typechain-types";
import { Signer } from "ethers";
export interface TradeRequest {
    user: string;
    tokenIn: string;
    tokenOut: string;
    amount: number;
    price: number;
    side: number;
    signature: string;
  }
  
  
  export async function createTradeRequest(
    {
      user,
      tokenIn,
      tokenOut,
      side,
      amount,
      price
    }: {
      user: Signer,
      tokenIn: MockERC20,
      tokenOut: MockERC20,
      side: number,
      amount: number,
      price: number
    }): Promise<TradeRequest> {
    const userAddress = await user.getAddress();

    // 署名対象は、ユーザー、tokenIn、tokenOut、amount、price、side を連結
    const hash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "address", "address", "uint256", "uint256", "uint8"],
        [userAddress, await tokenIn.getAddress(), await tokenOut.getAddress(), amount, price, side]
      )
    );
    // signMessage の引数はバイト列に変換
    const signature = await user.signMessage(ethers.getBytes(hash));
    return {
      user: userAddress,
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      amount: amount,
      price: price,
      side: side,
      signature: signature
    };
  }