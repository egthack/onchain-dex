#!/bin/bash
set -e

# 最新のデプロイメント情報を取得
LATEST_DEPLOYMENT=$(find ../deployments/localhost -name "deployment-localhost-*.json" | sort -r | head -n 1)

if [ -z "$LATEST_DEPLOYMENT" ]; then
    echo "エラー: localhostのデプロイメント情報が見つかりません"
    exit 1
fi

echo "最新のデプロイメント情報を使用: $LATEST_DEPLOYMENT"

# デプロイメント情報からアドレスを取得
TRADING_VAULT_ADDRESS=$(cat $LATEST_DEPLOYMENT | jq -r '.contracts.trading.tradingVault')
MATCHING_ENGINE_ADDRESS=$(cat $LATEST_DEPLOYMENT | jq -r '.contracts.trading.matchingEngine')
START_BLOCK=$(cat $LATEST_DEPLOYMENT | jq -r '.blockNumber')

echo "TradingVault: $TRADING_VAULT_ADDRESS"
echo "MatchingEngine: $MATCHING_ENGINE_ADDRESS"
echo "StartBlock: $START_BLOCK"

# subgraph.local.ymlを生成
cat subgraph.yml >subgraph.local.yml.tmp
sed -i '' "s/0x66f037F629728d0cc721955805D345aC6D5c3b8b/$TRADING_VAULT_ADDRESS/g" subgraph.local.yml.tmp
sed -i '' "s/0x9332713Fe3BBbC89A1C0B9E231D258901A98c258/$MATCHING_ENGINE_ADDRESS/g" subgraph.local.yml.tmp
sed -i '' "s/5705570/$START_BLOCK/g" subgraph.local.yml.tmp
sed -i '' "s/rise-sepolia/localhost/g" subgraph.local.yml.tmp
mv subgraph.local.yml.tmp subgraph.local.yml

echo "subgraph.local.ymlを生成しました"

# IPFSサービスが起動しているか確認
echo "IPFSサービスの起動を確認しています..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:5001/api/v0/version >/dev/null; then
        echo "IPFSサービスが起動しています"
        break
    fi
    echo "IPFSサービスの起動を待っています... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "エラー: IPFSサービスが起動していません"
    echo "docker-compose up -d を実行して、サービスが起動するのを待ってから再試行してください"
    exit 1
fi

# サブグラフのコードを生成
echo "サブグラフのコードを生成しています..."
graph codegen subgraph.local.yml

# サブグラフをビルド
echo "サブグラフをビルドしています..."
graph build subgraph.local.yml

# サブグラフを作成
echo "サブグラフを作成しています..."
graph create --node http://localhost:8020/ clob-dex/local || true

# サブグラフをデプロイ
echo "サブグラフをデプロイしています..."
graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 clob-dex/local subgraph.local.yml --version-label 1.0.0

echo "セットアップが完了しました"
echo "GraphQLエンドポイント: http://localhost:8000/subgraphs/name/clob-dex/local"
