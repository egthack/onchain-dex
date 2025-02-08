// scripts/deposit.js
import { ethers } from "hardhat";

async function main() {
  // ① 署名者の取得
  const [deployer] = await ethers.getSigners();

  // ② 対象ブリッジコントラクトのアドレスとABI（depositTransactionのみ）
  // ※ contractAddress は実際のブリッジコントラクトのアドレスに置換してください
  const contractAddress = "0x965DccA17AF63E36957BD8488CC50d3DD146c317";
  const depositABI = [
    "function depositTransaction(address _to, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes _data) external",
  ];

  // ③ コントラクトインスタンス生成
  const depositContract = new ethers.Contract(
    contractAddress,
    depositABI,
    deployer
  );

  // ④ 引数設定（BigIntを利用）
  const _to = "0xADEfC64dB771908b4915EC294a66892545045EAc";
  const _value = ethers.parseEther("0.01"); // ロックする金額（BigNumber）
  // ※関数の引数としての gasLimit（ここでは3000000）と、トランザクション送信のオプションとしての gasLimit は別々にセットできます
  const _gasLimitParam = BigInt(500000);
  const _isCreation = false; // 通常は false
  const _data = "0x"; // 追加データ（今回は空）

  const args = [_to, _value, _gasLimitParam, _isCreation, _data];

  // ⑤ 送信前に estimateGas を用いて必要なガス代を確認する
  const estimatedGas = await depositContract["depositTransaction"].estimateGas(
    ...args,
    { value: _value }
  );

  // セーフティマージンをかける（例: 1.2倍）
  const safeGasLimit = (estimatedGas * 120n) / 100n;
  console.log("Using safe gas limit:", safeGasLimit.toString());

  // ⑥ depositTransaction の呼び出し（トランザクションオプションで gasLimit を指定）
  const tx = await depositContract["depositTransaction"](...args, {
    value: _value,
  });
  console.log("Transaction sent. Hash:", tx.hash);

  // ⑦ トランザクション完了まで待機
  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
