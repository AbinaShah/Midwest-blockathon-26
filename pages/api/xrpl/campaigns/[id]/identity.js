/**
 * POST /api/xrpl/campaigns/[id]/identity
 * Submit identity verification (gov ID, selfie, bank details) before withdrawal.
 * Accepts either:
 *   - { govIdCid, selfieCid, bankDetailsCid? } - client uploaded to Pinata first
 *   - { govIdBase64, govIdFilename, selfieBase64, selfieFilename, bankBase64?, bankFilename? } - server pins
 */

export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

import { getCampaignById, setIdentityVerification } from "../../../../../lib/xrpl-store";
import { pinFileToPinata } from "../../../../../lib/pinata-metadata";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { id } = req.query;
  const campaign = getCampaignById(id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  try {
    const body = req.body || {};
    let govIdCid, selfieCid, bankDetailsCid = "";

    if (body.govIdCid && body.selfieCid) {
      govIdCid = body.govIdCid;
      selfieCid = body.selfieCid;
      bankDetailsCid = body.bankDetailsCid || "";
    } else if (body.govIdBase64 && body.selfieBase64) {
      const govBuf = Buffer.from(body.govIdBase64, "base64");
      const selfieBuf = Buffer.from(body.selfieBase64, "base64");
      govIdCid = await pinFileToPinata(govBuf, body.govIdFilename || "gov-id");
      selfieCid = await pinFileToPinata(selfieBuf, body.selfieFilename || "selfie");
      if (body.bankBase64) {
        const bankBuf = Buffer.from(body.bankBase64, "base64");
        bankDetailsCid = await pinFileToPinata(bankBuf, body.bankFilename || "bank-details");
      }
    } else {
      return res.status(400).json({ error: "Provide govIdCid+selfieCid (client upload) or govIdBase64+selfieBase64 (server upload)" });
    }

    setIdentityVerification(id, {
      govIdCid,
      selfieCid,
      bankDetailsCid: bankDetailsCid || undefined,
      status: "verified",
      verifiedAt: new Date().toISOString(),
    });
    return res.status(200).json({ success: true, message: "Identity verification submitted" });
  } catch (e) {
    console.error("Identity verification failed", e);
    return res.status(500).json({ error: e?.message || "Upload failed" });
  }
}
