import defaultEnv from '../env.json';
import localhostEnv from '../env.localhost.json';

// Determine if we're running in a localhost environment
const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Merge the environment configurations, with localhost taking precedence when in localhost environment
const envConfig = {
  ...defaultEnv,
  ...(isLocalhost ? localhostEnv : {}),
  // Always set the subgraph URL for localhost
  ...(isLocalhost ? { NEXT_PUBLIC_SUBGRAPH_URL: 'http://localhost:8000/subgraphs/name/clob-dex/local' } : {})
};

export default envConfig; 