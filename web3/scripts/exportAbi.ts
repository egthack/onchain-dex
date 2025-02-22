import fs from "fs";
import path from "path";
import { artifacts } from "hardhat";

// 出力先ディレクトリ
const ABI_DIR = path.join(__dirname, "../../ponder/abis");

// 出力したいコントラクトの一覧
const contracts = [
  "MatchingEngine",
  "TradingVault",
  "MockERC20", // テスト用のトークンも含める
] as const;

// ABIファイルを作成
async function exportAbi(): Promise<void> {
  // 出力先ディレクトリがない場合は作成
  if (!fs.existsSync(ABI_DIR)) {
    fs.mkdirSync(ABI_DIR, { recursive: true });
  }

  for (const contractName of contracts) {
    try {
      // コントラクトのアーティファクトを取得
      const artifact = await artifacts.readArtifact(contractName);

      // TypeScript用のインターフェースを生成
      const interfaceName = `I${contractName}`;
      const abiContent = `import type { Abi } from 'viem'

export const ${contractName}ABI = ${JSON.stringify(
        artifact.abi,
        null,
        2
      )} as const satisfies Abi;

export type ${interfaceName} = typeof ${contractName}ABI;
`;

      fs.writeFileSync(
        path.join(ABI_DIR, `${contractName.toLowerCase()}.ts`),
        abiContent
      );

      console.log(`Generated ABI for ${contractName}`);
    } catch (error) {
      console.error(`Failed to generate ABI for ${contractName}:`, error);
      process.exit(1);
    }
  }

  // index.tsファイルを生成
  const indexContent = contracts
    .map((name) => `export * from './${name.toLowerCase()}';`)
    .join("\n");

  fs.writeFileSync(path.join(ABI_DIR, "index.ts"), indexContent + "\n");

  console.log("ABI files exported successfully!");
}

exportAbi().catch((error) => {
  console.error("Failed to export ABIs:", error);
  process.exit(1);
});
