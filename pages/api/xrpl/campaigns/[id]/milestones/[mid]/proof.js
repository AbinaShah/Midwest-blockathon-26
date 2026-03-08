/**
 * POST /api/xrpl/campaigns/[id]/milestones/[mid]/proof - upload file to Pinata, store proofCid
 * Body: JSON { fileBase64, filename } - client reads file, base64 encodes, sends as JSON.
 */

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

import { getCampaignById, setMilestoneProof } from "../../../../../../../lib/xrpl-store";
import { pinFileToPinata } from "../../../../../../../lib/pinata-metadata";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { id, mid } = req.query;

  const campaign = getCampaignById(id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const { fileBase64, filename = "proof" } = req.body || {};
  if (!fileBase64) {
    return res.status(400).json({
      error: "Missing fileBase64. Send JSON: { fileBase64: string, filename?: string }",
    });
  }

  let proofCid;
  try {
    const fileBuffer = Buffer.from(fileBase64, "base64");
    proofCid = await pinFileToPinata(fileBuffer, filename);
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Pinata upload failed: " + (e?.message || "unknown") });
  }

  const updated = setMilestoneProof(id, mid, proofCid);
  return res.status(200).json(updated);
}
