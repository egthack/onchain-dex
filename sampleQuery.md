# DEX GraphQL クエリサンプル集

このドキュメントでは、DEX アプリケーションで使用できる GraphQL クエリのサンプルを提供します。

## 基本的なクエリ

### 全ての注文を取得

```graphql
query GetAllOrders {
  orders {
    id
    side
    price
    amount
    user {
      id
    }
    baseToken {
      symbol
    }
    quoteToken {
      symbol
    }
  }
}
```

### 特定のトークンペアの注文を取得

```graphql
query GetOrdersByPair($baseToken: String!, $quoteToken: String!) {
  orders(where: { baseToken: $baseToken, quoteToken: $quoteToken }) {
    id
    side
    price
    amount
    user {
      id
    }
    status
    createdAt
  }
}
```

変数:

```json
{
  "baseToken": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  "quoteToken": "0x9a9f2ccfde556a7e9ff0848998aa4a0cfd8863ae"
}
```

## オーダーブック関連クエリ

### 買い注文（Bids）を価格の高い順に取得

```graphql
query GetBids($baseToken: String!, $quoteToken: String!, $limit: Int!) {
  orders(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      side: 0
      status: "OPEN"
    }
    orderBy: price
    orderDirection: desc
    first: $limit
  ) {
    id
    price
    amount
    user {
      id
    }
    createdAt
  }
}
```

変数:

```json
{
  "baseToken": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  "quoteToken": "0x9a9f2ccfde556a7e9ff0848998aa4a0cfd8863ae",
  "limit": 10
}
```

### 売り注文（Asks）を価格の低い順に取得

```graphql
query GetAsks($baseToken: String!, $quoteToken: String!, $limit: Int!) {
  orders(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      side: 1
      status: "OPEN"
    }
    orderBy: price
    orderDirection: asc
    first: $limit
  ) {
    id
    price
    amount
    user {
      id
    }
    createdAt
  }
}
```

変数:

```json
{
  "baseToken": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  "quoteToken": "0x9a9f2ccfde556a7e9ff0848998aa4a0cfd8863ae",
  "limit": 10
}
```

### 完全なオーダーブックを取得（買い注文と売り注文を一度に）

```graphql
query GetOrderBook($baseToken: String!, $quoteToken: String!, $limit: Int!) {
  bids: orders(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      side: 0
      status: "OPEN"
    }
    orderBy: price
    orderDirection: desc
    first: $limit
  ) {
    id
    price
    amount
    side
  }

  asks: orders(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      side: 1
      status: "OPEN"
    }
    orderBy: price
    orderDirection: asc
    first: $limit
  ) {
    id
    price
    amount
    side
  }
}
```

## 市場データ関連クエリ

### 全ての取引ペアの最新情報を取得

```graphql
query GetAllPairs {
  lastTrades {
    id
    baseToken {
      id
      symbol
      decimals
    }
    quoteToken {
      id
      symbol
      decimals
    }
    lastPrice
    lastAmount
    lastTimestamp
    priceChangePercent
    highPrice24h
    lowPrice24h
    volume24h
    quoteVolume24h
  }
}
```

### 特定のペアの最新取引情報を取得

```graphql
query GetPairInfo($baseToken: String!, $quoteToken: String!) {
  lastTrades(where: { baseToken: $baseToken, quoteToken: $quoteToken }) {
    lastPrice
    lastAmount
    lastTimestamp
    priceChangePercent
    highPrice24h
    lowPrice24h
    volume24h
    quoteVolume24h
  }
}
```

## ユーザー関連クエリ

### ユーザーの残高情報を取得

```graphql
query GetUserBalances($userId: String!) {
  user(id: $userId) {
    id
    balances {
      token {
        id
        symbol
        decimals
      }
      amount
    }
    totalDeposited
    totalWithdrawn
  }
}
```

変数:

```json
{
  "userId": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
}
```

### ユーザーの注文履歴を取得

```graphql
query GetUserOrders($userId: String!) {
  user(id: $userId) {
    orders {
      id
      baseToken {
        symbol
      }
      quoteToken {
        symbol
      }
      side
      amount
      price
      status
      createdAt
      filledAt
      cancelledAt
    }
  }
}
```

### ユーザーの入出金履歴を取得

```graphql
query GetUserTransactions($userId: String!) {
  deposits: deposits(
    where: { user: $userId }
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    token {
      symbol
    }
    amount
    timestamp
    transaction
  }

  withdrawals: withdrawals(
    where: { user: $userId }
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    token {
      symbol
    }
    amount
    timestamp
    transaction
  }
}
```

## 取引履歴関連クエリ

### 最近の取引履歴を取得

```graphql
query GetRecentTrades($baseToken: String!, $quoteToken: String!, $limit: Int!) {
  trades(
    where: { baseToken: $baseToken, quoteToken: $quoteToken }
    orderBy: timestamp
    orderDirection: desc
    first: $limit
  ) {
    id
    price
    amount
    side
    timestamp
    isMarketOrder
    transaction
  }
}
```

### 特定のユーザーの取引履歴を取得

```graphql
query GetUserTrades($userId: String!) {
  trades(
    where: {
      or: [
        { makerOrder_: { user: $userId } }
        { takerOrder_: { user: $userId } }
      ]
    }
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    baseToken {
      symbol
    }
    quoteToken {
      symbol
    }
    price
    amount
    side
    timestamp
    isMarketOrder
  }
}
```

## 複合クエリ

### ダッシュボード用の総合情報

```graphql
query GetDashboardInfo {
  # 取引ペア情報
  lastTrades {
    baseToken {
      symbol
    }
    quoteToken {
      symbol
    }
    lastPrice
    priceChangePercent
    volume24h
  }

  # 最近の取引
  recentTrades: trades(orderBy: timestamp, orderDirection: desc, first: 5) {
    baseToken {
      symbol
    }
    quoteToken {
      symbol
    }
    price
    amount
    side
    timestamp
  }

  # トークン情報
  tokens {
    id
    symbol
    decimals
    totalVolume
  }
}
```

### 特定のペアの詳細情報

```graphql
query GetPairDetails($baseToken: String!, $quoteToken: String!) {
  # ペア情報
  pairInfo: lastTrades(
    where: { baseToken: $baseToken, quoteToken: $quoteToken }
  ) {
    lastPrice
    priceChangePercent
    highPrice24h
    lowPrice24h
    volume24h
    quoteVolume24h
  }

  # 買い注文
  bids: orders(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      side: 0
      status: "OPEN"
    }
    orderBy: price
    orderDirection: desc
    first: 5
  ) {
    price
    amount
  }

  # 売り注文
  asks: orders(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      side: 1
      status: "OPEN"
    }
    orderBy: price
    orderDirection: asc
    first: 5
  ) {
    price
    amount
  }

  # 最近の取引
  trades: trades(
    where: { baseToken: $baseToken, quoteToken: $quoteToken }
    orderBy: timestamp
    orderDirection: desc
    first: 10
  ) {
    price
    amount
    side
    timestamp
    isMarketOrder
  }
}
```

## 実用的なクエリ例

### 価格集約されたオーダーブック

```graphql
query GetAggregatedOrderBook(
  $baseToken: String!
  $quoteToken: String!
  $limit: Int!
) {
  # このクエリはクライアント側で集約処理が必要です
  bids: orders(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      side: 0
      status: "OPEN"
    }
    orderBy: price
    orderDirection: desc
    first: $limit
  ) {
    price
    amount
  }

  asks: orders(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      side: 1
      status: "OPEN"
    }
    orderBy: price
    orderDirection: asc
    first: $limit
  ) {
    price
    amount
  }
}
```

### 時間範囲を指定した取引履歴

```graphql
query GetTradesInTimeRange(
  $baseToken: String!
  $quoteToken: String!
  $startTime: BigInt!
  $endTime: BigInt!
) {
  trades(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      timestamp_gte: $startTime
      timestamp_lte: $endTime
    }
    orderBy: timestamp
    orderDirection: asc
  ) {
    price
    amount
    timestamp
  }
}
```

変数:

```json
{
  "baseToken": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  "quoteToken": "0x9a9f2ccfde556a7e9ff0848998aa4a0cfd8863ae",
  "startTime": "1646092800",
  "endTime": "1646179200"
}
```

### 特定の価格範囲の注文を取得

```graphql
query GetOrdersInPriceRange(
  $baseToken: String!
  $quoteToken: String!
  $minPrice: BigInt!
  $maxPrice: BigInt!
) {
  orders(
    where: {
      baseToken: $baseToken
      quoteToken: $quoteToken
      price_gte: $minPrice
      price_lte: $maxPrice
      status: "OPEN"
    }
    orderBy: price
    orderDirection: asc
  ) {
    id
    side
    price
    amount
    user {
      id
    }
  }
}
```
