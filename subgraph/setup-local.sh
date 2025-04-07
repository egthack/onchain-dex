#!/bin/bash
set -e

# コマンドラインオプションの解析
RESET=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --reset) RESET=true ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

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
sed -i '' "s/\${tradingVaultAddress}/$TRADING_VAULT_ADDRESS/g" subgraph.local.yml.tmp
sed -i '' "s/\${matchingEngineAddress}/$MATCHING_ENGINE_ADDRESS/g" subgraph.local.yml.tmp
sed -i '' "s/rise-sepolia/localhost/g" subgraph.local.yml.tmp
sed -i '' "s/startBlock: [0-9]*/startBlock: $START_BLOCK/g" subgraph.local.yml.tmp

# TradingVaultとMatchingEngineのアドレスを置換
# 各データソースのアドレスを置換
awk -v tv="$TRADING_VAULT_ADDRESS" -v me="$MATCHING_ENGINE_ADDRESS" '
{
  if ($0 ~ /name: TradingVault/ && !tv_found) {
    tv_found = 1;
    print $0;
  } else if ($0 ~ /name: MatchingEngine/ && !me_found) {
    me_found = 1;
    print $0;
  } else if (tv_found && $0 ~ /address:/ && !tv_replaced) {
    tv_replaced = 1;
    print "      address: \"" tv "\"";
  } else if (me_found && $0 ~ /address:/ && !me_replaced) {
    me_replaced = 1;
    print "      address: \"" me "\"";
  } else {
    print $0;
  }
}' subgraph.local.yml.tmp >subgraph.local.yml.tmp2
mv subgraph.local.yml.tmp2 subgraph.local.yml.tmp

# デバッグ用に置換後の内容を表示
echo "アドレスの置換結果を確認:"
grep -A 3 "name: TradingVault" subgraph.local.yml.tmp
grep -A 3 "name: MatchingEngine" subgraph.local.yml.tmp
mv subgraph.local.yml.tmp subgraph.local.yml

echo "subgraph.local.ymlを生成しました"

# Docker compose up -d を実行
echo "Docker compose up -d を実行しています..."

# データをリセットする場合
if [ "$RESET" = true ]; then
    echo "サブグラフのデータをリセットしています..."
    
    # 既存のコンテナを停止して削除
    docker compose down -v
    
    # Dockerボリュームを削除
    docker volume rm subgraph_postgres-data || true
    docker volume rm subgraph_ipfs-data || true
    
    # dataディレクトリの中身を削除
    if [ -d "./data" ]; then
        echo "dataディレクトリの中身を削除しています..."
        rm -rf ./data/*
    fi
    
    echo "サブグラフのデータをリセットしました"
fi

docker compose up -d

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

# Graph Nodeが起動しているか確認
echo "Graph Nodeの起動を確認しています..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:8020/ >/dev/null; then
        echo "Graph Nodeが起動しています"
        break
    fi
    echo "Graph Nodeの起動を待っています... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "エラー: Graph Nodeが起動していません"
    echo "docker-compose up -d を実行して、サービスが起動するのを待ってから再試行してください"
    exit 1
fi

# サブグラフのコードを生成
echo "サブグラフのコードを生成しています..."
graph codegen subgraph.local.yml

# サブグラフをビルド
echo "サブグラフをビルドしています..."
graph build subgraph.local.yml

# 既存のサブグラフを削除（エラーは無視）
echo "既存のサブグラフを削除しています..."
graph remove --node http://localhost:8020/ clob-dex/local 2>/dev/null || true

# サブグラフを作成
echo "サブグラフを作成しています..."
graph create --node http://localhost:8020/ clob-dex/local

# 少し待機してサブグラフの作成が完了するのを待つ
sleep 3

# サブグラフをデプロイ
echo "サブグラフをデプロイしています..."
graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 clob-dex/local subgraph.local.yml --version-label 1.0.0

echo "セットアップが完了しました"
echo "GraphQLエンドポイント: http://localhost:8000/subgraphs/name/clob-dex/local"
echo ""
echo "使用方法:"
echo "  --reset  サブグラフのデータをリセットします"
echo ""
echo "例: ./setup-local.sh --reset"
