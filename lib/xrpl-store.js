/**
 * Simple JSON file store for XRPL campaigns.
 * Data persisted at data/xrpl-campaigns.json
 */

import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "xrpl-campaigns.json");

function ensureDataDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readStore() {
  ensureDataDir();
  if (!fs.existsSync(DATA_PATH)) {
    return { campaigns: [], conditionEscrows: [] };
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const data = JSON.parse(raw);
    return { campaigns: data.campaigns || [], conditionEscrows: data.conditionEscrows || [] };
  } catch {
    return { campaigns: [], conditionEscrows: [] };
  }
}

function writeStore(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function getAllCampaigns() {
  return readStore().campaigns;
}

export function getCampaignById(id) {
  const campaigns = readStore().campaigns;
  return campaigns.find((c) => String(c.id) === String(id));
}

export function createCampaign(campaign) {
  const store = readStore();
  const id =
    store.campaigns.length > 0
      ? String(Math.max(...store.campaigns.map((c) => Number(c.id))) + 1)
      : "1";
  const c = {
    id,
    creatorWalletAddress: campaign.creatorXrplAddress || campaign.creatorWalletAddress || "",
    creatorXrplAddress: campaign.creatorXrplAddress || campaign.creatorWalletAddress || "",
    title: campaign.title || "",
    description: campaign.description || "",
    location: campaign.location || "Global",
    category: campaign.category || "other",
    fundingGoal: Number(campaign.goalXrp) || 0,
    goalXrp: Number(campaign.goalXrp) || 0,
    totalRaised: 0,
    totalRaisedXrp: 0,
    deadline: campaign.deadline || "",
    verificationStatus: campaign.verificationStatus || "pending",
    fraudProbability: campaign.fraudProbability ?? 0,
    fraudReasoning: campaign.fraudReasoning || "",
    imageCid: campaign.imageCid || "",
    metadataCid: campaign.metadataCid || "",
    documentCids: campaign.documentCids || [],
    verifiedNftTokenId: campaign.verifiedNftTokenId || "",
    identityVerification: campaign.identityVerification || { status: "pending", govIdCid: "", selfieCid: "" },
    costValidation: campaign.costValidation || {},
    transactionHistory: campaign.transactionHistory || [],
    milestones: (campaign.milestones || []).map((m, i) => ({
      id: String(i + 1),
      milestoneId: String(i + 1),
      description: m.description || "",
      requiredAmount: Number(m.amountXrp) || 0,
      amountXrp: Number(m.amountXrp) || 0,
      proofHash: "",
      proofCid: "",
      approvalVotes: 0,
      rejectedVotes: 0,
      votesFor: 0,
      votesAgainst: 0,
      fundsReleased: false,
    })),
    donors: [],
  };
  store.campaigns.push(c);
  writeStore(store);
  return c;
}

export function setVerifiedNft(campaignId, nftTokenId) {
  return updateCampaign(campaignId, (c) => ({ ...c, verifiedNftTokenId: nftTokenId || "" }));
}

export function updateCampaign(id, updater) {
  const store = readStore();
  const idx = store.campaigns.findIndex((c) => String(c.id) === String(id));
  if (idx < 0) return null;
  store.campaigns[idx] = updater(store.campaigns[idx]);
  writeStore(store);
  return store.campaigns[idx];
}

export function deleteCampaign(id) {
  const store = readStore();
  const idx = store.campaigns.findIndex((c) => String(c.id) === String(id));
  if (idx < 0) return false;
  store.campaigns.splice(idx, 1);
  writeStore(store);
  return true;
}

export function addDonor(campaignId, donor) {
  return updateCampaign(campaignId, (c) => {
    const donors = c.donors || [];
    const existing = donors.find((d) => d.address === donor.address);
    if (existing) {
      existing.amountXrp = (existing.amountXrp || 0) + (donor.amountXrp || 0);
      if (donor.txHash) existing.txHash = donor.txHash;
    } else {
      donors.push({
        address: donor.address,
        amountXrp: donor.amountXrp || 0,
        txHash: donor.txHash || "",
      });
    }
    const totalRaisedXrp = donors.reduce((s, d) => s + (d.amountXrp || 0), 0);
    return { ...c, donors, totalRaisedXrp };
  });
}

export function addVote(campaignId, milestoneId, donorAddress, approve) {
  return updateCampaign(campaignId, (c) => {
    const donor = (c.donors || []).find((d) => d.address === donorAddress);
    if (!donor) return c;
    const weight = donor.amountXrp || 0;
    const milestones = (c.milestones || []).map((m) => {
      if (String(m.id) !== String(milestoneId)) return m;
      const votesFor = (m.votesFor || 0) + (approve ? weight : 0);
      const votesAgainst = (m.votesAgainst || 0) + (approve ? 0 : weight);
      return {
        ...m,
        votesFor,
        votesAgainst,
        approvalVotes: votesFor,
        rejectedVotes: votesAgainst,
      };
    });
    return { ...c, milestones };
  });
}

export function setMilestoneProof(campaignId, milestoneId, proofCid) {
  return updateCampaign(campaignId, (c) => {
    const milestones = (c.milestones || []).map((m) => {
      if (String(m.id) !== String(milestoneId)) return m;
      return { ...m, proofCid: proofCid || "", proofHash: proofCid || "" };
    });
    return { ...c, milestones };
  });
}

export function setMilestoneFundsReleased(campaignId, milestoneId) {
  return updateCampaign(campaignId, (c) => {
    const milestones = (c.milestones || []).map((m) => {
      if (String(m.id) !== String(milestoneId)) return m;
      return { ...m, fundsReleased: true };
    });
    return { ...c, milestones };
  });
}

export function addTransactionToHistory(campaignId, tx) {
  return updateCampaign(campaignId, (c) => {
    const history = c.transactionHistory || [];
    history.push({ ...tx, timestamp: new Date().toISOString() });
    return { ...c, transactionHistory: history };
  });
}

export function setVerificationStatus(campaignId, status, fraudData = {}) {
  return updateCampaign(campaignId, (c) => ({
    ...c,
    verificationStatus: status,
    fraudProbability: fraudData.fraudProbability ?? c.fraudProbability,
    fraudReasoning: fraudData.fraudReasoning ?? c.fraudReasoning,
  }));
}

export function setIdentityVerification(campaignId, data) {
  return updateCampaign(campaignId, (c) => ({
    ...c,
    identityVerification: {
      ...(c.identityVerification || {}),
      ...data,
    },
  }));
}

// Condition-based escrows (donor locks XRP; creator releases after milestone)
export function addConditionEscrow(entry) {
  const store = readStore();
  store.conditionEscrows = store.conditionEscrows || [];
  store.conditionEscrows.push({ ...entry, createdAt: new Date().toISOString() });
  writeStore(store);
  return entry;
}

export function getConditionEscrowsByMilestone(campaignId, milestoneId) {
  const store = readStore();
  return (store.conditionEscrows || []).filter(
    (e) => String(e.campaignId) === String(campaignId) && String(e.milestoneId) === String(milestoneId) && !e.finished
  );
}

export function markConditionEscrowFinished(owner, offerSequence) {
  const store = readStore();
  const escrows = store.conditionEscrows || [];
  const idx = escrows.findIndex((e) => e.owner === owner && String(e.offerSequence) === String(offerSequence));
  if (idx >= 0) {
    escrows[idx].finished = true;
    escrows[idx].finishedAt = new Date().toISOString();
    writeStore(store);
  }
}
