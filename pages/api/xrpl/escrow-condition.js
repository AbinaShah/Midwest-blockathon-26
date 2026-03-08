/**
 * POST /api/xrpl/escrow-condition
 * Generate condition+fulfillment for condition-based escrow.
 * Donor uses conditionHex in EscrowCreate; we hold fulfillment for EscrowFinish on release.
 * Body: { campaignId, milestoneId, amountXrp } - for tracking
 * Returns: { conditionHex, cancelAfterRipple }
 */

import { generateConditionFulfillment, unixToRippleTime } from "../../../../lib/xrpl-escrow";
import { getCampaignById } from "../../../../lib/xrpl-store";
import fs from "fs";
import path from "path";

const PENDING_PATH = path.join(process.cwd(), "data", "pending-escrow-conditions.json");

function readPending() {
  try {
    if (fs.existsSync(PENDING_PATH)) {
      return JSON.parse(fs.readFileSync(PENDING_PATH, "utf8"));
    }
  } catch (_) {}
  return [];
}

function writePending(list) {
  const dir = path.dirname(PENDING_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PENDING_PATH, JSON.stringify(list, null, 2), "utf8");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { campaignId, milestoneId } = req.body || {};
  const campaign = getCampaignById(campaignId);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  const creatorAddr = campaign.creatorXrplAddress || campaign.creatorWalletAddress;
  if (!creatorAddr) return res.status(400).json({ error: "Campaign has no creator XRPL address" });

  const { conditionHex, fulfillmentHex } = generateConditionFulfillment();
  const deadline = Number(campaign.deadline) || Math.floor(Date.now() / 1000) + 90 * 24 * 3600;
  const cancelAfterRipple = unixToRippleTime(deadline) + 30 * 24 * 60 * 60;

  const pending = readPending();
  pending.push({
    conditionHex,
    fulfillmentHex,
    campaignId: String(campaignId),
    milestoneId: String(milestoneId),
    createdAt: new Date().toISOString(),
  });
  writePending(pending);

  return res.status(200).json({
    conditionHex,
    cancelAfterRipple,
    destination: creatorAddr,
  });
}
