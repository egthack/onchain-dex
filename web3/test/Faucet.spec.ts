import { expect } from "chai";
import { ethers } from "hardhat";
import { Faucet, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";

describe("Faucet", function () {
  let owner: Signer;
  let user: Signer;
  let faucet: Faucet;
  let wbtc: MockERC20;
  let usdc: MockERC20;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy tokens
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    wbtc = await TokenFactory.deploy("WBTC", "WBTC", 1000000, 8);
    usdc = await TokenFactory.deploy("USDC", "USDC", 1000000, 6);

    // Deploy Faucet
    const FaucetFactory = await ethers.getContractFactory("Faucet");
    faucet = await FaucetFactory.deploy();

    // Add tokens to Faucet
    await wbtc.approve(await faucet.getAddress(), ethers.MaxUint256);
    await usdc.approve(await faucet.getAddress(), ethers.MaxUint256);
    await faucet.addToken(await wbtc.getAddress(), 1000000n * 10n ** 8n);
    await faucet.addToken(await usdc.getAddress(), 1000000n * 10n ** 6n);
  });

  it("should drip correct amount based on decimals", async function () {
    // WBTC drip (8 decimals)
    await faucet.connect(user).drip(await wbtc.getAddress());
    expect(await wbtc.balanceOf(await user.getAddress())).to.equal(
      100n * 10n ** 8n
    );

    // USDC drip (6 decimals)
    await faucet.connect(user).drip(await usdc.getAddress());
    expect(await usdc.balanceOf(await user.getAddress())).to.equal(
      100n * 10n ** 6n
    );
  });

  it("should enforce drip interval", async function () {
    await faucet.connect(user).drip(await wbtc.getAddress());
    await expect(
      faucet.connect(user).drip(await wbtc.getAddress())
    ).to.be.revertedWith("Too soon");
  });

  it("should allow drip after interval", async function () {
    await faucet.connect(user).drip(await wbtc.getAddress());

    // 1時間進める
    await ethers.provider.send("evm_increaseTime", [1 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    // 再度ドリップ可能
    await faucet.connect(user).drip(await wbtc.getAddress());
    expect(await wbtc.balanceOf(await user.getAddress())).to.equal(
      200n * 10n ** 8n
    );
  });
});
