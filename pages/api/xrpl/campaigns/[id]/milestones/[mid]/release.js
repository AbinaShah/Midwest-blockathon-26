/**
 * POST /api/xrpl/campaigns/[id]/milestones/[mid]/release
 * 1) Finishes any condition-based escrows for this milestone (funds release to creator on-chain).
 * 2) Sends remaining milestone amount from treasury to creator.
 * Requires: votes approve, proof submitted, identity verification (per spec).
 */

import {
  getCampaignById,
  getConditionEscrowsByMilestone,
  markConditionEscrowFinished,
  setMilestoneFundsReleased,
  addTransactionToHistory,
} from "../../../../../../../lib/xrpl-store";
import { sendXrpFromTreasury } from "../../../../../../../lib/xrpl";
import { finishConditionalEscrow } from "../../../../../../../lib/xrpl-escrow";

const XRP_TO_DROPS = 1_000_000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { id, mid } = req.query;

  const campaign = getCampaignById(id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const creatorAddr = campaign.creatorXrplAddress || campaign.creatorWalletAddress;
  if (!creatorAddr) {
    return res.status(400).json({ error: "Campaign has no creator XRPL address" });
  }

  const milestone = (campaign.milestones || []).find((m) => String(m.id) === String(mid));
  if (!milestone) {
    return res.status(404).json({ error: "Milestone not found" });
  }

  if (milestone.fundsReleased) {
    return res.status(400).json({ error: "Funds already released for this milestone" });
  }

  if (!milestone.proofCid && !milestone.proofHash) {
    return res.status(400).json({ error: "Milestone proof must be submitted before release" });
  }

  const votesFor = milestone.votesFor || milestone.approvalVotes || 0;
  const votesAgainst = milestone.votesAgainst || milestone.rejectedVotes || 0;
  if (votesFor <= votesAgainst) {
    return res.status(400).json({
      error: "Votes must approve (votesFor > votesAgainst) to release",
    });
  }

  // Identity verification required before withdrawal (per spec)
  const idVer = campaign.identityVerification || {};
  if (idVer.status !== "verified") {
    return res.status(400).json({
      error: "Identity verification required before withdrawal. Submit gov ID, selfie, and bank details.",
    });
  }

  const amountXrp = Number(milestone.amountXrp) || Number(milestone.requiredAmount) || 0;
  if (amountXrp <= 0) {
    return res.status(400).json({ error: "Invalid milestone amount" });
  }

  const hashes = [];

  try {
    // 1. Finish condition-based escrows (donor-locked XRP releases to creator)
    const conditionEscrows = getConditionEscrowsByMilestone(id, mid);
    let amountFromEscrows = 0;
    for (const escrow of conditionEscrows) {
      try {
        const { hash, success } = await finishConditionalEscrow(
          escrow.owner,
          escrow.offerSequence,
          escrow.conditionHex,
          escrow.fulfillmentHex
        );
        if (success) {
          hashes.push(hash);
          markConditionEscrowFinished(escrow.owner, escrow.offerSequence);
          amountFromEscrows += Number(escrow.amountDrops || 0) / XRP_TO_DROPS;
        }
      } catch (e) {
        console.error("EscrowFinish failed for", escrow.owner, e);
      }
    }

    // 2. Send remainder from treasury
    const amountFromTreasury = Math.max(0, amountXrp - amountFromEscrows);
    if (amountFromTreasury > 0) {
      const amountDrops = String(Math.round(amountFromTreasury * XRP_TO_DROPS));
      const { hash, success } = await sendXrpFromTreasury(creatorAddr, amountDrops);
      if (!success) {
        return res.status(500).json({ error: "Treasury payment submitted but not validated yet" });
      }
      hashes.push(hash);
    }

    setMilestoneFundsReleased(id, mid);
    addTransactionToHistory(id, {
      type: "milestone_release",
      milestoneId: mid,
      txHash: hashes[0] || "",
      txHashes: hashes,
      amountXrp,
    });
    return res.status(200).json({
      success: true,
      txHash: hashes[0],
      txHashes: hashes,
      message: hashes.length > 1
        ? `${hashes.length} releases completed (escrow + treasury)`
        : "XRP released to creator",
    });
  } catch (e) {
    console.error("Release failed", e);
    return res.status(500).json({
      error: (e?.message || "Release failed") + ". Ensure XRPL_TREASURY_SECRET is set.",
    });
  }
}
