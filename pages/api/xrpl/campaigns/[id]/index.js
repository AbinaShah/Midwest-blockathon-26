/**
 * GET /api/xrpl/campaigns/[id] - get one campaign
 * DELETE /api/xrpl/campaigns/[id] - delete campaign (creator only, no donations)
 */

import { getCampaignById, deleteCampaign } from "../../../../../lib/xrpl-store";

export default async function handler(req, res) {
  const { id } = req.query;
  const campaign = getCampaignById(id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (req.method === "GET") {
    return res.status(200).json(campaign);
  }

  if (req.method === "DELETE") {
    const creatorAddr = req.body?.creatorAddress || req.query?.creatorAddress || "";
    const campaignCreator = campaign.creatorXrplAddress || campaign.creatorWalletAddress || "";
    if (!creatorAddr || creatorAddr.trim() !== campaignCreator.trim()) {
      return res.status(403).json({ error: "Only the campaign creator can delete it" });
    }
    const totalRaised = campaign.totalRaisedXrp || campaign.totalRaised || 0;
    if (totalRaised > 0) {
      return res.status(400).json({ error: "Cannot delete a campaign that has received donations" });
    }
    const ok = deleteCampaign(id);
    if (!ok) return res.status(500).json({ error: "Delete failed" });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
