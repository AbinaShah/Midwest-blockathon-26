/**
 * POST /api/xrpl/campaigns/[id]/milestones/[mid]/vote - record vote
 * Body: { donorAddress, approve }
 * Verifies donor is in donors.
 */

import { getCampaignById, addVote } from "../../../../../../../lib/xrpl-store";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { id, mid } = req.query;
  const { donorAddress, approve } = req.body || {};

  if (!donorAddress || typeof approve !== "boolean") {
    return res.status(400).json({ error: "Missing donorAddress or approve" });
  }

  const campaign = getCampaignById(id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const donor = (campaign.donors || []).find((d) => d.address === donorAddress);
  if (!donor) {
    return res.status(403).json({ error: "Address is not a donor for this campaign" });
  }

  const updated = addVote(id, mid, donorAddress, approve);
  return res.status(200).json(updated);
}
