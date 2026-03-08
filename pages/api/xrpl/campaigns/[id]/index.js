/**
 * GET /api/xrpl/campaigns/[id] - get one campaign
 */

import { getCampaignById } from "../../../../../lib/xrpl-store";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { id } = req.query;
  const campaign = getCampaignById(id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  return res.status(200).json(campaign);
}
