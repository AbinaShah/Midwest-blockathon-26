/**
 * POST /api/xrpl/campaigns/[id]/mint-nft
 * Mint VerifiedCampaignNFT for an existing verified campaign that doesn't have one.
 */

import { getCampaignById, setVerifiedNft } from "../../../../../lib/xrpl-store";
import { pinNftMetadata } from "../../../../../lib/pinata-metadata";
import { mintVerifiedCampaignNFT } from "../../../../../lib/xrpl-nft";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { id } = req.query;
  const campaign = getCampaignById(id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign.verificationStatus !== "approved") {
    return res.status(400).json({ error: "Campaign must be verified first" });
  }
  if (campaign.verifiedNftTokenId) {
    return res.status(400).json({ error: "Campaign already has a VerifiedCampaign NFT", nftId: campaign.verifiedNftTokenId });
  }
  const creatorAddr = campaign.creatorXrplAddress || campaign.creatorWalletAddress;
  if (!creatorAddr) return res.status(400).json({ error: "Campaign has no creator XRPL address" });

  try {
    const verificationScore = Math.round((1 - (campaign.fraudProbability || 0)) * 100);
    const nftMetadataCid = await pinNftMetadata({
      campaignId: campaign.id,
      title: campaign.title,
      verificationScore,
      metadataCid: campaign.metadataCid || "",
      imageCid: campaign.imageCid || "",
    });
    const { hash, nftId } = await mintVerifiedCampaignNFT(creatorAddr, {}, nftMetadataCid);
    if (nftId) setVerifiedNft(id, nftId);
    return res.status(200).json({ success: true, txHash: hash, nftId });
  } catch (e) {
    console.error("Mint NFT failed", e);
    return res.status(500).json({ error: e?.message || "Mint failed" });
  }
}
