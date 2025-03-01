# RiseX – Full On-Chain CLOB DEX on the RISE Blockchain

<img width="1920" alt="image" src="https://github.com/user-attachments/assets/e0653fcf-1b63-47a1-abf2-49e1d7b0d56a" />

> **TL;DR:** RiseX is a high-performance, fully on-chain Central Limit Order Book DEX that delivers CEX-like speed with complete DeFi transparency by leveraging RISE's modular blockchain architecture and Celestia's data availability layer.

**[Live Demo Available Here](https://feature-mammothon-submit.d20nbutm7dylce.amplifyapp.com/)**

## 1. Problem & Solution

### The Problem We're Solving

Traditional DEXs face a critical dilemma:

- ❌ **AMMs** sacrifice price efficiency and market depth
- ❌ **Off-chain order books** compromise transparency and trustlessness
- ❌ **On-chain order books** (until now) have been too slow and expensive for a viable trading experience

Traders need a solution that delivers **both performance AND transparency** without compromise.

### Our Innovative Solution

**RiseX** solves this fundamental challenge by building a fully on-chain CLOB DEX on **RISE**, a next-generation modular blockchain specifically engineered for high-throughput applications:

- ✅ **100% On-Chain Execution** – Every order, cancellation, and trade is executed and recorded on-chain
- ✅ **High Performance** – RISE's architecture enables **100k+ TPS** and **<10ms** block times
- ✅ **Modular Architecture** – Execution layer (RISE) is optimized for trading throughput, while data layer (Celestia) ensures transaction data availability
- ✅ **Complete Transparency** – All order book data is publicly verifiable and auditable
- ✅ **Centralized-Exchange Experience** – Fast order placement and execution with limit & market orders

The result is a DEX that offers the **speed and user experience of a centralized exchange** with the **trustlessness and transparency of DeFi**.

## 2. RISE & Modular Architecture Technologies

RiseX's breakthrough performance is made possible by RISE's **modular blockchain architecture**, which separates key blockchain functions for optimal performance:

### 🔹 Execution Layer (RISE)

- **Parallel EVM Execution:** Processes transactions in parallel via a Parallel EVM (pEVM) engine
- **Continuous Block Production:** Ensures sub-second block finality for near-instant trades
- **Optimized for Trading:** Smart contract execution environment specifically tuned for high-volume transaction processing

### 🔹 Data Availability Layer (Celestia)

- **Modular Data Storage:** Transaction data is published to Celestia rather than stored on the execution layer
- **Scalable Verification:** Anyone can verify the complete order book and trade history
- **Decentralized Security:** Ensures that all order data is immutably available for verification

### 🔹 Consensus Layer (Based Sequencing)

- **Ethereum Alignment:** Leverages Ethereum L1's validators for transaction ordering
- **Decentralized Sequencing:** No single sequencer – anyone can permissionlessly propose blocks
- **Censorship Resistance:** Inherits Ethereum's security for fair and unbiased order execution

**This modular approach delivers the best of both worlds:** The execution layer (RISE) handles the performance-demanding trading logic, while the data layer (Celestia) ensures transparency and data integrity.

## 3. Key Features of RiseX

RiseX is a feature-rich spot trading DEX with a robust on-chain order book and exchange logic:

### Trading Engine

- ⚡ **Fully On-Chain Order Book** – Implemented using efficient Red-Black Tree data structures (O(log n) operations)
- 💱 **Spot Trading Focus** – Clean, efficient trading of token pairs (e.g., WETH/USDC, WBTC/USDC)
- 🔄 **Instant Settlement** – All trades are settled immediately on-chain

### Order Types

- 📊 **Limit Orders** – Set your price, rest in the order book until filled
- 🚀 **Market Orders** – Execute immediately at best available price
- 🔍 **Partial Fills** – Orders can be partially executed with remainder staying on the book

### Exchange Features

- 🏦 **Vault-Based Fund Management** – Non-custodial yet seamless trading experience
- 💰 **Maker-Taker Fee Model** – Incentivizes liquidity provision with lower fees for makers
- 📱 **Real-Time UI Updates** – Order book and trades update in real-time via Goldsky subgraph indexing

## 4. Quick Start Guide

Want to try RiseX immediately? Follow these simple steps:

1. Visit our **[Live Demo](https://feature-mammothon-submit.d20nbutm7dylce.amplifyapp.com/)**
2. Connect your MetaMask wallet to RISE Sepolia testnet
3. Use the built-in Faucet to get test tokens
4. Deposit a test token in the Vault
5. Start trading with market and limit orders!

## 5. Setup & Deployment Guide

For developers who want to set up the full project locally or deploy their own instance:

### Prerequisites

- **Node.js & Package Manager:** Install Node.js and npm/yarn
- **RISE Testnet ETH:** Obtain test ETH on RISE's Sepolia testnet
- **Goldsky Account:** (Optional) For subgraph deployment

### 5.1 Smart Contract Deployment to RISE

```bash
# 1. Clone repository and install dependencies
git clone https://github.com/egthack/onchain-dex.git
cd onchain-dex/web3
npm install

# 2. Configure environment variables
# Create .env with PRIVATE_KEY, SEPOLIA_URL(RPC Node) and RISE_SEPOLIA_URL(RPC Node)

# 3. Compile contracts
npx hardhat compile

# 4. Deploy to RISE testnet
npx hardhat run scripts/deployDemo.ts --network riseSepolia
```

The deployment script will output the addresses of the core contracts that you'll need for the next steps.

### 5.2 Subgraph Deployment with Goldsky

```bash
# 1. Export ABI
cd web3
npx hardhat run scripts/exportAbi.ts --network riseSepolia

# 2. Navigate to subgraph directory
cd ../subgraphRiseSepolia/1.0.0

# 3. Update subgraph.yaml with your contract addresses(See the file under ../../deployments/riseSepolia/)

# 4. Build subgraph
npm run codegen
npm run build

# 4. Deploy via Goldsky
goldsky subgraph deploy <subgraph-name>/<version> --path .
```

This will index all orders, trades, and other events from the DEX contracts.

### 5.3 Frontend Setup & Running

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Copy environment variables and set
cp .env.example .env

# 4. Start development server
npm run dev
```

Visit http://localhost:3000 to access your local instance.

## 6. Architecture & Order Flow

RiseX's modular architecture can be understood as layers working together:

```
┌────────────────────────┐
│  Frontend dApp         │ User interface, order placement
├────────────────────────┤
│  Goldsky Subgraph      │ Real-time data indexing and queries
├────────────────────────┤
│  RISE (Execution)      │ Order matching, settlement, state updates
├────────────────────────┤
│  Ethereum (Sequencing) │ Transaction ordering and consensus
├────────────────────────┤
│  Celestia (Data)       │ Data availability and integrity
└────────────────────────┘
```

**Order flow:**

1. User places an order → stored on-chain in order book (sorted Red-Black Tree)
2. Matching engine checks compatibility with existing orders
3. If match found → order executed, balances updated in vault
4. If partially filled → remainder stays in order book
5. All transactions published to Celestia for data availability

This modular approach means each component can be improved or scaled independently, optimizing for both performance and decentralization.

## 7. Why This Matters

RiseX demonstrates the power of modular blockchain architectures for high-performance DeFi applications:

- **For Traders:** Get the speed of centralized exchanges with the security of DeFi
- **For Developers:** See how modular design enables previously impossible on-chain applications
- **For the Ecosystem:** A glimpse of the future where scaling solutions enable new categories of DApps

By building RiseX on RISE and Celestia, we've created a solution that finally resolves the performance vs. transparency dilemma that has limited DEX adoption.

## 8. Try Our Demo 🎉

**[Live Demo URL](https://feature-mammothon-submit.d20nbutm7dylce.amplifyapp.com/)**

Experience the full trading flow on RISE testnet:

- Connect your wallet (MetaMask configured to RISE)
- Mint test tokens from our faucet
- Place and cancel orders
- Watch them execute in real-time, fully on-chain!

---

_We believe RiseX demonstrates a compelling use-case of RISE's modular blockchain tech by delivering a true on-chain order book exchange. By solving the performance hurdles and preserving transparency, it highlights how modular L2s and DA layers like Celestia can unlock new DeFi innovations. We invite you to explore the code, test the demo, and imagine the future of high-performance DeFi built on modular stacks!_ 🚀
