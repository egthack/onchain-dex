import { expect } from "chai";
import { ethers } from "hardhat";
import { MultiTokenFaucet, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";
describe("MultiTokenFaucet", function () {
    let owner: Signer;
    let user: Signer;
    let faucet: MultiTokenFaucet;
    let token: MockERC20;
    // faucetAmount: tokens sent per request (in standard units)
    // cooldown: cooldown period in seconds
    const faucetAmount = 100;
    const cooldown = 60;
    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();
        // Deploy token (MockERC20) with initial supply of 1,000,000 in given decimals (choose 18)
        const TokenFactory = await ethers.getContractFactory("MockERC20");
        token = (await TokenFactory.deploy("TestToken", "TTK", 1000000, 18)) as MockERC20;
        await token.waitForDeployment();
        // Deploy MultiTokenFaucet with faucetAmount and cooldown
        const FaucetFactory = await ethers.getContractFactory("MultiTokenFaucet");
        faucet = (await FaucetFactory.deploy(faucetAmount, cooldown)) as MultiTokenFaucet;
        await faucet.waitForDeployment();
        // Approve faucet to transfer tokens from deployer (owner) and deposit tokens into faucet
        await token.approve(await faucet.getAddress(), ethers.MaxUint256);
        // Deposit tokens to faucet
        await faucet.depositTokens(await token.getAddress(), ethers.parseUnits("1000", 18));
    });
    it("should deposit tokens into the faucet", async function () {
        // Check faucet token balance equals deposit amount
        const faucetBalance = await token.balanceOf(await faucet.getAddress());
        expect(faucetBalance).to.equal(ethers.parseUnits("1000", 18));
    });
    it("should allow a user to request tokens successfully", async function () {
        // Set maximum token amount for requests (in standard units)
        await faucet.setMaxTokenAmount(await token.getAddress(), 500);
        // User requests tokens: 'amount' is in standard units (here 200)
        await expect((faucet as any).connect(user).requestTokens(await token.getAddress(), 200))
            .to.emit(faucet, "TokensRequested");
        // Expected token transfer: amount * (10 decimals)
        const expectedAmount = ethers.parseUnits("200", 18);
        const userBalance = await token.balanceOf(await user.getAddress());
        expect(userBalance).to.equal(expectedAmount);
    });
    it("should fail when requested amount exceeds maximum allowed", async function () {
        // Set maximum token amount low (e.g. 300)
        await faucet.setMaxTokenAmount(await token.getAddress(), 300);
        // Attempt to request an excessive amount (e.g. 400)
        await expect(
            (faucet as any).connect(user).requestTokens(await token.getAddress(), 400)
        ).to.be.revertedWith("Amount exceeds maximum allowed");
    });
    it("should enforce cooldown period between requests", async function () {
        // Set maximum token amount
        await faucet.setMaxTokenAmount(await token.getAddress(), 500);
        // First request should succeed
        await (faucet as any).connect(user).requestTokens(await token.getAddress(), 100);
        // Immediate second request should revert due to cooldown
        await expect(
            (faucet as any).connect(user).requestTokens(await token.getAddress(), 100)
        ).to.be.revertedWith("In cooldown period");
    });
    it("should allow a request after cooldown period", async function () {
        // Set maximum token amount
        await faucet.setMaxTokenAmount(await token.getAddress(), 500);
        // First request by user
        await (faucet as any).connect(user).requestTokens(await token.getAddress(), 100);
        // Increase EVM time by 'cooldown' seconds (60 sec)
        await ethers.provider.send("evm_increaseTime", [cooldown]);
        await ethers.provider.send("evm_mine", []);
        // Second request should now succeed
        await (faucet as any).connect(user).requestTokens(await token.getAddress(), 100);
        // Expected user balance is 200 tokens (with decimals)
        const expectedAmount = ethers.parseUnits("200", 18);
        const userBalance = await token.balanceOf(await user.getAddress());
        expect(userBalance).to.equal(expectedAmount);
    });
    it("should allow the owner to withdraw tokens from the faucet", async function () {
        // Owner withdraws all tokens from faucet
        await expect(faucet.withdrawTokens(await token.getAddress(), ethers.parseUnits("1000", 18)))
            .to.emit(faucet, "TokensWithdrawn");
        const faucetBalance = await token.balanceOf(await faucet.getAddress());
        expect(faucetBalance).to.equal(0);
    });
});