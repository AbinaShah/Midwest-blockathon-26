/** @type {import('next').NextConfig} */
// Load backend/.env so Pinata, XRPL vars are available to API routes
require("dotenv").config({ path: require("path").join(__dirname, "backend/.env") });

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_PINATA_JWT: process.env.NEXT_PUBLIC_PINATA_JWT,
    NEXT_PUBLIC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    NEXT_PUBLIC_XRPL_TREASURY_ADDRESS: process.env.NEXT_PUBLIC_XRPL_TREASURY_ADDRESS,
    NEXT_PUBLIC_XRPL_NETWORK: process.env.NEXT_PUBLIC_XRPL_NETWORK,
    NEXT_PUBLIC_ALCHEMY_RPC_URL: process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL,
    NEXT_PUBLIC_AI_API_URL: process.env.NEXT_PUBLIC_AI_API_URL,
  }
};

module.exports = nextConfig;

