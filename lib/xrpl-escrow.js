/**
 * XRPL condition-based escrow.
 * Donor creates escrow with Condition; we hold Fulfillment.
 * Creator releases funds after milestone by submitting EscrowFinish.
 */

import { connectClient } from "./xrpl";

const RIPPLE_EPOCH = 946684800;

/** Generate PREIMAGE-SHA256 condition + fulfillment. Returns { conditionHex, fulfillmentHex }. */
export function generateConditionFulfillment() {
  const { PreimageSha256 } = require("five-bells-condition");
  const crypto = require("crypto");
  const preimage = crypto.randomBytes(32);
  const fulfillment = new PreimageSha256();
  fulfillment.setPreimage(preimage);
  const fulfillmentHex = fulfillment.serializeBinary().toString("hex").toUpperCase();
  const conditionHex = fulfillment.getConditionBinary().toString("hex").toUpperCase();
  return { conditionHex, fulfillmentHex };
}

/**
 * Finish a conditional escrow (release funds to Destination).
 * Uses treasury wallet to sign EscrowFinish. Fee is higher for fulfillment.
 */
export async function finishConditionalEscrow(owner, offerSequence, conditionHex, fulfillmentHex) {
  const { Client, Wallet } = await import("xrpl");
  const secret = process.env.XRPL_TREASURY_SECRET;
  if (!secret) throw new Error("XRPL_TREASURY_SECRET not set");
  const WSS =
    (process.env.NEXT_PUBLIC_XRPL_NETWORK || "testnet") === "devnet"
      ? "wss://s.devnet.rippletest.net:51233"
      : "wss://s.altnet.rippletest.net:51233";
  const wallet = Wallet.fromSeed(secret);
  const client = new Client(WSS);
  await client.connect();
  try {
    const tx = {
      TransactionType: "EscrowFinish",
      Account: wallet.address,
      Owner: owner,
      OfferSequence: Number(offerSequence),
      Condition: conditionHex,
      Fulfillment: fulfillmentHex,
    };
    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    return { hash: result.result.hash, success: result.result.validated };
  } finally {
    await client.disconnect();
  }
}

/** Convert Unix timestamp to Ripple time (seconds since Ripple Epoch). */
export function unixToRippleTime(unixSec) {
  return Math.floor(Number(unixSec)) - RIPPLE_EPOCH;
}
