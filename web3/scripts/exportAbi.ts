import fs from "fs";
import path from "path";
import { artifacts } from "hardhat";

// 出力先ディレクトリ
const JSON_ABI_DIR = path.join(__dirname, "../../graphRiseSepolia/1.0.0/abis");

// 出力したいコントラクトの一覧
const contracts = [
  "MatchingEngine",
  "TradingVault",
  "MockERC20", // テスト用のトークンも含める
] as const;

// ABIファイルを作成
async function exportAbi(): Promise<void> {
  // 出力先ディレクトリがない場合は作成
  if (!fs.existsSync(JSON_ABI_DIR)) {
    fs.mkdirSync(JSON_ABI_DIR, { recursive: true });
  }

  for (const contractName of contracts) {
    try {
      // コントラクトのアーティファクトを取得
      const artifact = await artifacts.readArtifact(contractName);

      // JSON形式で出力（コントラクト名と同じファイル名で）
      fs.writeFileSync(
        path.join(JSON_ABI_DIR, `${contractName}.json`),
        JSON.stringify(artifact.abi, null, 2)
      );

      console.log(`Generated ABI for ${contractName}`);
    } catch (error) {
      console.error(`Failed to generate ABI for ${contractName}:`, error);
      process.exit(1);
    }
  }

  console.log("ABI files exported successfully!");
}

exportAbi().catch((error) => {
  console.error("Failed to export ABIs:", error);
  process.exit(1);
});
