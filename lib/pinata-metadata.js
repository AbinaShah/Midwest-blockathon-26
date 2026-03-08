/**
 * Pinata content-addressed campaign metadata for ProofFund.
 * Upload campaign + verification payload as JSON; only the IPFS CID is stored on-chain.
 */

const path = typeof require !== "undefined" ? require("path") : null;
if (typeof process !== "undefined" && !process.env.NEXT_PUBLIC_PINATA_JWT && !process.env.PINATA_JWT && path) {
  try {
    require("dotenv").config({ path: path.join(process.cwd(), "backend", ".env") });
  } catch (_) {}
}

const PINATA_JWT =
  typeof process !== "undefined"
    ? process.env.PINATA_JWT || process.env.NEXT_PUBLIC_PINATA_JWT
    : "";

/**
 * Upload file to Pinata; returns IPFS CID. Server-side use (e.g. API routes).
 * @param {Buffer|Blob|File} file - File content
 * @param {string} filename - Optional filename
 */
export async function pinFileToPinata(file, filename = "file") {
  if (!PINATA_JWT) throw new Error("PINATA_JWT or NEXT_PUBLIC_PINATA_JWT not set");
  const buffer = Buffer.isBuffer(file) ? file : Buffer.from(file instanceof Blob ? await file.arrayBuffer() : file);
  const FormDataPkg = require("form-data");
  const axios = require("axios");
  const form = new FormDataPkg();
  form.append("file", buffer, filename);
  const { data } = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${PINATA_JWT}` },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return data.IpfsHash;
}

/**
 * Upload JSON payload to Pinata; returns IPFS CID (content identifier).
 */
export async function pinJsonToPinata(payload) {
  if (!PINATA_JWT) throw new Error("NEXT_PUBLIC_PINATA_JWT not set");
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata pinJSON: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.IpfsHash;
}

/**
 * Build and pin campaign metadata (content-addressed). Returns CID.
 * Used after campaign creation + verification so donors and OpenClaw can resolve by CID.
 */
export async function pinCampaignMetadata({
  campaignId,
  title,
  description,
  location,
  campaignType,
  fundingGoalEth,
  deadline,
  fraudScore,
  isVerified,
  documentHashes = [],
  costValidation = {},
  creatorXrplAddress = null,
}) {
  const payload = {
    version: "1",
    campaignId,
    title,
    description,
    location: location || "",
    campaignType: campaignType || "other",
    fundingGoalEth,
    deadline,
    fraudScore: fraudScore ?? 0,
    isVerified: !!isVerified,
    documentHashes,
    costValidation,
    creatorXrplAddress: creatorXrplAddress || undefined,
    pinnedAt: new Date().toISOString(),
  };
  return pinJsonToPinata(payload);
}

/**
 * Fetch campaign metadata from Pinata gateway and parse creatorXrplAddress.
 */
export async function fetchCampaignMetadata(cid) {
  if (!cid) return null;
  try {
    const url = campaignMetadataUrl(cid);
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Resolve campaign metadata from Pinata (gateway). Returns JSON or null.
 */
export function campaignMetadataUrl(cid) {
  if (!cid) return null;
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

/**
 * Build and pin NFT metadata for VerifiedCampaign (name, description, image).
 * NFT viewers (Bithomp etc.) use the "image" field - use ipfs:// and PNG for best support.
 */
export async function pinNftMetadata({ campaignId, title, verificationScore, metadataCid, imageCid }) {
  let imageCidFinal = imageCid;
  if (!imageCidFinal) {
    try {
      const sharp = (await import("sharp")).default;
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="24" fill="#0284CF"/><circle cx="100" cy="85" r="35" fill="none" stroke="white" stroke-width="8"/><path d="M70 85 L95 115 L135 65" fill="none" stroke="white" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><text x="100" y="165" fill="white" font-family="sans-serif" font-size="20" text-anchor="middle">Verified</text></svg>');
      const png = await sharp(svg).png().toBuffer();
      imageCidFinal = await pinFileToPinata(png, "verified-badge.png");
    } catch (_) {
      try {
        imageCidFinal = await pinFileToPinata(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="24" fill="#0284CF"/><circle cx="100" cy="85" r="35" fill="none" stroke="white" stroke-width="8"/><path d="M70 85 L95 115 L135 65" fill="none" stroke="white" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>'), "verified-badge.svg");
      } catch (_) {}
    }
  }
  const image = imageCidFinal ? `ipfs://${imageCidFinal}` : "";
  const payload = {
    name: `ProofFund Verified #${campaignId}`,
    description: title
      ? `${title} — AI-verified campaign (score: ${verificationScore}%). Full metadata: https://gateway.pinata.cloud/ipfs/${metadataCid}`
      : `AI-verified campaign #${campaignId}. Verification score: ${verificationScore}%. Metadata: https://gateway.pinata.cloud/ipfs/${metadataCid}`,
    ...(image && { image, image_url: image }),
    campaign_id: campaignId,
    verification_score: verificationScore,
    metadata_cid: metadataCid,
  };
  return pinJsonToPinata(payload);
}

/**
 * OpenClaw: open Pinata Agents with optional context (campaign IPFS link).
 */
export function openClawUrl(campaignMetadataCid) {
  const base = "https://agents.pinata.cloud";
  if (campaignMetadataCid) {
    const context = campaignMetadataUrl(campaignMetadataCid);
    return `${base}?context=${encodeURIComponent(context)}`;
  }
  return base;
}
