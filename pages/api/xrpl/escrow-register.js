/**
 * POST /api/xrpl/escrow-register
 * Register a condition escrow after donor creates it. Fetches tx from ledger, stores fulfillment.
 * Body: { txHash, campaignId, milestoneId }
 */

import { addConditionEscrow, addDonor, addTransactionToHistory } from "../../../../lib/xrpl-store";
import { connectClient } from "../../../../lib/xrpl";
import fs from "fs";
import path from "path";

const PENDING_PATH = path.join(process.cwd(), "data", "pending-escrow-conditions.json");

function readPending() {
  try {
    if (fs.existsSync(PENDING_PATH)) {
      return JSON.parse(fs.readFileSync(PENDING_PATH, "utf8"));
    }
  } catch (_) {}
  return [];
}

function writePending(list) {
  const dir = path.dirname(PENDING_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PENDING_PATH, JSON.stringify(list, null, 2), "utf8");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { txHash, campaignId, milestoneId } = req.body || {};
  if (!txHash) return res.status(400).json({ error: "txHash required" });

  const client = await connectClient();
  try {
    const txResult = await client.request({
      command: "tx",
      transaction: txHash,
    });
    const tx = txResult.result;
    if (!tx || tx.TransactionType !== "EscrowCreate") {
      return res.status(400).json({ error: "Not a valid EscrowCreate transaction" });
    }
    const conditionHex = tx.Condition;
    if (!conditionHex) return res.status(400).json({ error: "Escrow has no Condition" });

    const owner = tx.Account;
    const offerSequence = tx.Sequence;
    const amountDrops = tx.Amount || "0";

    const pending = readPending();
    const idx = pending.findIndex(
      (p) =>
        p.conditionHex === conditionHex &&
        (!campaignId || p.campaignId === String(campaignId)) &&
        (!milestoneId || p.milestoneId === String(milestoneId))
    );
    if (idx < 0) {
      return res.status(404).json({ error: "No matching pending condition found. Create escrow-condition first." });
    }
    const { fulfillmentHex, campaignId: cid, milestoneId: mid } = pending[idx];
    pending.splice(idx, 1);
    writePending(pending);

    addConditionEscrow({
      owner,
      offerSequence,
      conditionHex,
      fulfillmentHex,
      campaignId: cid,
      milestoneId: mid,
      txHash,
      amountDrops,
    });

    const amountXrp = Number(amountDrops) / 1_000_000;
    addDonor(cid, { address: owner, amountXrp, txHash });
    addTransactionToHistory(cid, { type: "donation_escrow_condition", donorAddress: owner, amountXrp, txHash, milestoneId: mid });

    return res.status(200).json({
      success: true,
      message: "Escrow registered. Funds will release when milestone is approved.",
    });
  } catch (e) {
    console.error("escrow-register failed", e);
    return res.status(500).json({ error: e?.message || "Failed to register escrow" });
  } finally {
    client.disconnect();
  }
}
