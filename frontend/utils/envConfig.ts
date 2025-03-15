import defaultEnv from '../env.json';
import localhostEnv from '../env.localhost.json';

// Define the type for environment configuration
export interface EnvConfig {
  NETWORK: string;
  NEXT_PUBLIC_RPC_URL: string;
  NEXT_PUBLIC_CHAIN_ID: number;
  NEXT_PUBLIC_BLOCK_EXPLORER: string;
  NEXT_PUBLIC_VAULT_ADDRESS: string;
  NEXT_PUBLIC_WETH_ADDRESS: string;
  NEXT_PUBLIC_USDC_ADDRESS: string;
  NEXT_PUBLIC_WBTC_ADDRESS: string;
  NEXT_PUBLIC_POL_ADDRESS: string;
  NEXT_PUBLIC_FAUCET_ADDRESS: string;
  NEXT_PUBLIC_SUBGRAPH_URL: string;
  [key: string]: any;
}

// In production, always use Rise Sepolia regardless of settings
let useRiseSepolia = process.env.NEXT_PUBLIC_USE_RISESEPOLIA === 'true';

// Required environment variables for Rise Sepolia
const requiredRiseSepoliaEnvVars = [
  'NEXT_PUBLIC_RISE_SEPOLIA_RPC_URL',
  'NEXT_PUBLIC_RISE_SEPOLIA_CHAIN_ID',
  'NEXT_PUBLIC_RISE_SEPOLIA_BLOCK_EXPLORER'
];

// Always require NEXT_PUBLIC_SUBGRAPH_URL
if (!process.env.NEXT_PUBLIC_SUBGRAPH_URL) {  
  throw new Error('Critical environment variable missing: NEXT_PUBLIC_SUBGRAPH_URL');
}

// Verify that required environment variables are set for Rise Sepolia
if (useRiseSepolia) {
  const missingVars = requiredRiseSepoliaEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Critical environment variables missing for Rise Sepolia: ${missingVars.join(', ')}`);
  }
}

// Select the appropriate configuration
let envConfig: EnvConfig;

if (useRiseSepolia) {
  // Use Rise Sepolia config
  envConfig = {
    ...defaultEnv,
    NETWORK: 'risesepolia',
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RISE_SEPOLIA_RPC_URL,
    NEXT_PUBLIC_CHAIN_ID: Number(process.env.NEXT_PUBLIC_RISE_SEPOLIA_CHAIN_ID),
    NEXT_PUBLIC_BLOCK_EXPLORER: process.env.NEXT_PUBLIC_RISE_SEPOLIA_BLOCK_EXPLORER,
    NEXT_PUBLIC_SUBGRAPH_URL: process.env.NEXT_PUBLIC_SUBGRAPH_URL
  } as EnvConfig;
} else {
  // Default to localhost config for local development
  envConfig = {
    ...localhostEnv,
    NETWORK: 'localhost',
    NEXT_PUBLIC_RPC_URL: 'http://localhost:8545',
    NEXT_PUBLIC_CHAIN_ID: 31337,
    NEXT_PUBLIC_BLOCK_EXPLORER: '',
    NEXT_PUBLIC_SUBGRAPH_URL: process.env.NEXT_PUBLIC_SUBGRAPH_URL
  } as EnvConfig;
}

// Log the active configuration in development
if (process.env.NODE_ENV === 'development') {
  console.log(`[ENV CONFIG] Active network: ${envConfig.NETWORK}`);
  console.log(`[ENV CONFIG] RPC URL: ${envConfig.NEXT_PUBLIC_RPC_URL}`);
  console.log(`[ENV CONFIG] Chain ID: ${envConfig.NEXT_PUBLIC_CHAIN_ID}`);
  console.log(`[ENV CONFIG] Subgraph URL: ${envConfig.NEXT_PUBLIC_SUBGRAPH_URL}`);
}

export default envConfig; 