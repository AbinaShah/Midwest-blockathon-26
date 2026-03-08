/**
 * ProofFund: set campaign verification on-chain (fraud score & isVerified).
 * Callable by backend or frontend after AI verification. Uses VERIFIER_PRIVATE_KEY.
 */
import { ethers } from "ethers";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const VERIFIER_PRIVATE_KEY = process.env.VERIFIER_PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || process.env.SEPOLIA_RPC_URL;

const MIN_ABI = [
  "function setCampaignVerification(uint256 campaignId, uint256 _fraudScore, bool _isVerified) external",
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!CONTRACT_ADDRESS || !VERIFIER_PRIVATE_KEY) {
    return res.status(500).json({ error: "Verifier not configured (CONTRACT_ADDRESS, VERIFIER_PRIVATE_KEY)" });
  }
  const { campaignId, fraudScore, isVerified } = req.body || {};
  if (typeof campaignId !== "number" || typeof isVerified !== "boolean") {
    return res.status(400).json({ error: "Missing campaignId or isVerified" });
  }
  const score = Math.min(100, Math.max(0, Number(fraudScore) || 0));
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL || "https://sepolia.infura.io/v3/84842078b09946638c03157f83405213");
    const wallet = new ethers.Wallet(VERIFIER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, MIN_ABI, wallet);
    const tx = await contract.setCampaignVerification(campaignId, score, isVerified);
    await tx.wait();
    return res.status(200).json({ success: true, txHash: tx.hash });
  } catch (e) {
    console.error("setCampaignVerification failed", e);
    return res.status(500).json({ error: e?.shortMessage || e?.message || "Transaction failed" });
  }
}
