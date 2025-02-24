# RiseX Frontend

Next.js based frontend for the RiseX decentralized trading platform.

## Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```

## Deployment with AWS Amplify

1. Fork or clone this repository
2. Connect your repository to AWS Amplify
3. Configure environment variables in Amplify Console:
   - Go to App settings > Environment variables
   - Add all variables from `.env.example`
   - Update the values according to your environment

### Build Settings

The build settings are automatically configured by `amplify.yml` in the root directory:

- Build command: `npm run build`
- Output directory: `.next`
- Node.js version: 18 (recommended)

### Environment Variables

Required environment variables for production:

```bash
NEXT_PUBLIC_RISE_SEPOLIA_RPC_URL=<your-rpc-url>
NEXT_PUBLIC_RISE_SEPOLIA_CHAIN_ID=<chain-id>
NEXT_PUBLIC_RISE_SEPOLIA_BLOCK_EXPLORER=<explorer-url>
NEXT_PUBLIC_ENABLE_TESTNETS=true
```

## Features

- Wallet Connection (MetaMask)
- Automatic Network Switching
- Trading Interface
- Order Book
- Trade History
- Dark Theme

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
