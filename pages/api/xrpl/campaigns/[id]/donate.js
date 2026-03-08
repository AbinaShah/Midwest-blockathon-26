/**
 * POST /api/xrpl/campaigns/[id]/donate - register donation
 * Body: { txHash, amountXrp, donorAddress }
 * Verifies tx on XRPL then adds to donors.
 */

import { getCampaignById, addDonor, addTransactionToHistory } from "../../../../../lib/xrpl-store";
import { getTreasuryAddress } from "../../../../../lib/xrpl";
import { verifyPaymentTx } from "../../../../../lib/xrpl-verify";

const XRP_TO_DROPS = 1_000_000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { id } = req.query;
  const { txHash, amountXrp, donorAddress } = req.body || {};

  if (!txHash || !donorAddress) {
    return res.status(400).json({ error: "Missing txHash or donorAddress" });
  }

  const campaign = getCampaignById(id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const treasury = getTreasuryAddress();
  if (!treasury) {
    return res.status(500).json({ error: "NEXT_PUBLIC_XRPL_TREASURY_ADDRESS not set" });
  }

  const amount = Number(amountXrp) || 0;
  const expectedDrops = amount > 0 ? String(Math.round(amount * XRP_TO_DROPS)) : null;

  let result;
  try {
    result = await verifyPaymentTx(
      txHash,
      treasury,
      expectedDrops,
      `cid:${id}`
    );
  } catch (e) {
    console.error("verifyPaymentTx failed", e);
    return res.status(500).json({ error: "Failed to verify transaction: " + (e?.message || "unknown") });
  }

  if (!result.valid) {
    return res.status(400).json({
      error: "Transaction verification failed: " + (result.reason || "invalid"),
    });
  }

  if (result.donorAddress && result.donorAddress !== donorAddress) {
    return res.status(400).json({
      error: "donorAddress does not match transaction sender",
    });
  }

  const amountToStore = amount > 0 ? amount : (result.amountXrp || 0);
  if (amountToStore <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const alreadyRegistered = (campaign.donors || []).some((d) => d.txHash === txHash);
  if (alreadyRegistered) {
    return res.status(400).json({ error: "Transaction already registered" });
  }

  addDonor(id, {
    address: donorAddress,
    amountXrp: amountToStore,
    txHash,
  });
  addTransactionToHistory(id, {
    type: "donation",
    donorAddress,
    amountXrp: amountToStore,
    txHash,
  });

  const updated = getCampaignById(id);
  return res.status(200).json(updated);
}
