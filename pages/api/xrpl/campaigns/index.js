/**
 * GET /api/xrpl/campaigns - list all campaigns
 * POST /api/xrpl/campaigns - create campaign (pins to Pinata, saves to store)
 * Accepts: location, category, imageCid, verificationResult, costValidation
 */

import { getAllCampaigns, createCampaign, setVerifiedNft } from "../../../../lib/xrpl-store";
import { pinJsonToPinata, pinNftMetadata } from "../../../../lib/pinata-metadata";
import { mintVerifiedCampaignNFT } from "../../../../lib/xrpl-nft";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const campaigns = getAllCampaigns();
    return res.status(200).json(campaigns);
  }

  if (req.method === "POST") {
    const {
      creatorXrplAddress,
      title,
      description,
      location,
      category,
      goalXrp,
      deadline,
      milestones,
      imageCid,
      documentCids,
      verificationResult,
      costValidation,
    } = req.body || {};

    if (!title || !description || !goalXrp || !deadline || !milestones?.length) {
      return res.status(400).json({
        error: "Missing required fields: title, description, goalXrp, deadline, milestones",
      });
    }

    const fraudProbability = verificationResult?.fraud_score ?? verificationResult?.fraud_score_0_100 / 100 ?? 0;
    const verificationStatus =
      verificationResult?.flagged ? "flagged" : fraudProbability > 0.5 ? "pending_review" : "approved";

    let metadataCid = "";
    try {
      const payload = {
        version: "2",
        creatorXrplAddress: creatorXrplAddress || "",
        title,
        description,
        location: location || "Global",
        category: category || "other",
        goalXrp: Number(goalXrp),
        deadline,
        milestones: (milestones || []).map((m) => ({
          description: m.description,
          amountXrp: Number(m.amountXrp) || 0,
        })),
        documentCids: Array.isArray(documentCids) ? documentCids : [],
        fraudProbability,
        verificationStatus,
        verificationResult: verificationResult || {},
        fraudAnalysis: Array.isArray(verificationResult?.details) ? verificationResult.details : verificationResult?.details || "",
        costValidation: costValidation || {},
        pinnedAt: new Date().toISOString(),
      };
      metadataCid = await pinJsonToPinata(payload);
    } catch (e) {
      console.error("Pinata pin failed", e);
      return res.status(500).json({
        error: "Failed to pin metadata to Pinata. Set NEXT_PUBLIC_PINATA_JWT.",
      });
    }

    const campaign = createCampaign({
      creatorXrplAddress: creatorXrplAddress || "",
      title,
      description,
      location: location || "Global",
      category: category || "other",
      goalXrp: Number(goalXrp),
      deadline,
      milestones: milestones || [],
      metadataCid,
      imageCid: imageCid || "",
      documentCids: Array.isArray(documentCids) ? documentCids : [],
      verificationStatus,
      fraudProbability,
      fraudReasoning: verificationResult?.details || "",
      costValidation: costValidation || {},
    });

    if (verificationStatus === "approved" && (creatorXrplAddress || campaign.creatorXrplAddress)) {
      try {
        const creatorAddr = creatorXrplAddress || campaign.creatorXrplAddress;
        const verificationScore = Math.round((1 - fraudProbability) * 100);
        const nftMetadataCid = await pinNftMetadata({
          campaignId: campaign.id,
          title,
          verificationScore,
          metadataCid,
          imageCid: imageCid || "",
        });
        const { nftId } = await mintVerifiedCampaignNFT(creatorAddr, {}, nftMetadataCid);
        if (nftId) setVerifiedNft(campaign.id, nftId);
      } catch (e) {
        console.error("Mint VerifiedCampaignNFT failed", e);
      }
    }

    const final = getAllCampaigns().find((c) => String(c.id) === String(campaign.id));
    return res.status(201).json(final || campaign);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
