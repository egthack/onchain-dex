import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main(): Promise<void> {


    // 最新のデプロイメント情報を取得する関数
    function getLatestDeployment(network: string): {
        tokens: Record<string, string>;
        trading: Record<string, string>;
    } {
        const deploymentPath = path.join(__dirname, "../../deployments", network);
        const files = fs
            .readdirSync(deploymentPath)
            .filter((f) => f.startsWith(`deployment-${network}`))
            .sort((a, b) => {
                const timeA = parseInt(a.split("-").pop()?.replace(".json", "") || "0");
                const timeB = parseInt(b.split("-").pop()?.replace(".json", "") || "0");
                return timeB - timeA;
            });

        if (files.length === 0) {
            throw new Error(`No deployment found for network: ${network}`);
        }

        const deployment = JSON.parse(
            fs.readFileSync(path.join(deploymentPath, files[0]), "utf8")
        );
        return deployment.contracts;
    }

    const deployments = getLatestDeployment("riseSepolia");
    const matchingEngineAddress: string = deployments.trading.matchingEngine;

    // MatchingEngineコントラクトのインスタンスを取得
    const MatchingEngine = await ethers.getContractFactory("MatchingEngine");
    const matchingEngine = MatchingEngine.attach(matchingEngineAddress) as any;

    // 次に発行される注文IDを取得（存在する注文は 0 ～ nextOrderId - 1）
    const nextOrderId = await matchingEngine.nextOrderId();
    console.log(`Next Order ID: ${nextOrderId.toString()}`);

    // 各注文の詳細を取得して表示する
    for (let i = 0; i < Number(nextOrderId); i++) {
        try {
            const order = await matchingEngine.getOrder(i);
            console.log("--------------------------------------------------");
            console.log(`Order ID: ${i}`);
            console.log(`User: ${order.user}`);
            console.log(`Base Token: ${order.base}`);
            console.log(`Quote Token: ${order.quote}`);
            console.log(`Price (内部数値): ${order.price.toString()}`);
            console.log(`Amount (内部数値): ${order.amount.toString()}`);
            console.log(`Side: ${order.side.toString()}`); // 0: Buy, 1: Sell とする想定
            console.log(`Active: ${order.active}`);
            console.log(`Timestamp: ${order.timestamp.toString()}`);
        } catch (error) {
            console.error(`Order ${i} の取得に失敗しました`, error);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("main エラー:", error);
        process.exit(1);
    });
