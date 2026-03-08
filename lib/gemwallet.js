/**
 * GemWallet integration for ProofFund.
 * Use connect, sendPayment, and submitTransaction for XRPL operations.
 */

import { getAddress, isInstalled, sendPayment, submitTransaction } from "@gemwallet/api";
import { memoForCampaign, getTreasuryAddress } from "./xrpl";

const XRP_TO_DROPS = 1_000_000;
const RIPPLE_EPOCH = 946684800;
export const RLUSD_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

function toHex(str) {
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function isGemWalletInstalled() {
  // Retry a few times - extension content script may need time to inject on localhost
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await isInstalled();
      if (res?.result?.isInstalled === true) return true;
    } catch (_) {}
    if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

/**
 * Connect GemWallet and return the connected address.
 * Tries getAddress() directly - works even when isInstalled() has false negatives (e.g. localhost).
 */
export async function connectGemWallet() {
  try {
    const res = await getAddress();
    if (res?.type === "reject" || !res?.result?.address) {
      throw new Error(res?.error?.message || "GemWallet rejected or no address returned");
    }
    return res.result.address;
  } catch (err) {
    if (err?.message?.includes("GemWallet")) throw err;
    throw new Error("GemWallet not detected. Install from gemwallet.app and ensure the extension is enabled.");
  }
}

/**
 * Send XRP payment via GemWallet.
 * @param {number} amountXrp
 * @param {string} destination
 * @param {number} [destinationTag]
 * @param {string} [memoHex]
 */
export async function sendXrpViaGemWallet(amountXrp, destination, destinationTag, memoHex) {
  const amountDrops = String(Math.round(Number(amountXrp) * XRP_TO_DROPS));
  const memos = memoHex
    ? [
        {
          memo: {
            memoType: toHex("campaignId"),
            memoData: memoHex,
          },
        },
      ]
    : undefined;
  const res = await sendPayment({
    amount: amountDrops,
    destination,
    destinationTag: destinationTag != null ? Number(destinationTag) : undefined,
    memos,
  });
  if (res?.type === "reject") {
    throw new Error(res?.error?.message || "GemWallet payment rejected");
  }
  if (!res?.result?.hash) {
    throw new Error("No transaction hash returned");
  }
  return { hash: res.result.hash };
}

/**
 * Send RLUSD (IssuedCurrency) payment via GemWallet submitTransaction.
 * @param {string} account - Connected wallet address (from getAddress)
 */
export async function sendRlusdViaGemWallet(account, amountRlusd, destinationTag, campaignId) {
  const treasury = getTreasuryAddress();
  if (!treasury) throw new Error("NEXT_PUBLIC_XRPL_TREASURY_ADDRESS not set");
  const memoHex = memoForCampaign(String(campaignId));
  const tx = {
    TransactionType: "Payment",
    Account: account,
    Destination: treasury,
    DestinationTag: destinationTag != null ? Number(destinationTag) : undefined,
    Amount: {
      currency: "USD",
      value: String(Number(amountRlusd)),
      issuer: RLUSD_ISSUER,
    },
    Memos: [
      {
        Memo: {
          MemoType: toHex("campaignId"),
          MemoData: memoHex,
        },
      },
    ],
  };
  const res = await submitTransaction({ transaction: tx });
  if (res?.type === "reject") {
    throw new Error(res?.error?.message || "GemWallet RLUSD payment rejected");
  }
  if (!res?.result?.hash) {
    throw new Error("No transaction hash returned");
  }
  return { hash: res.result.hash };
}

/**
 * Create XRP Escrow via GemWallet submitTransaction.
 * @param {string} account - Connected wallet address
 */
export async function createEscrowViaGemWallet(account, amountXrp, destination, finishAfterUnix, campaignId) {
  const amountDrops = String(Math.round(Number(amountXrp) * XRP_TO_DROPS));
  const finishAfterRipple = Math.floor(Number(finishAfterUnix)) - RIPPLE_EPOCH;
  const cancelAfterRipple = finishAfterRipple + 30 * 24 * 60 * 60;
  const tx = {
    TransactionType: "EscrowCreate",
    Account: account,
    Amount: amountDrops,
    Destination: destination,
    FinishAfter: finishAfterRipple,
    CancelAfter: cancelAfterRipple,
  };
  if (campaignId != null) {
    tx.Memos = [
      {
        Memo: {
          MemoType: toHex("campaignId"),
          MemoData: memoForCampaign(String(campaignId)),
        },
      },
    ];
  }
  const res = await submitTransaction({ transaction: tx });
  if (res?.type === "reject") {
    throw new Error(res?.error?.message || "GemWallet escrow rejected");
  }
  if (!res?.result?.hash) {
    throw new Error("No transaction hash returned");
  }
  return { hash: res.result.hash };
}

/**
 * Create condition-based XRP escrow via GemWallet.
 * Donor locks XRP until fulfillment is provided (when milestone is approved).
 * @param {string} account - Connected wallet address
 * @param {number} amountXrp
 * @param {string} destination - Creator XRPL address
 * @param {string} conditionHex - From /api/xrpl/escrow-condition
 * @param {number} cancelAfterRipple - Ripple time (seconds since Ripple Epoch)
 * @param {string} campaignId - For memo
 */
export async function createConditionalEscrowViaGemWallet(
  account,
  amountXrp,
  destination,
  conditionHex,
  cancelAfterRipple,
  campaignId
) {
  const amountDrops = String(Math.round(Number(amountXrp) * XRP_TO_DROPS));
  const tx = {
    TransactionType: "EscrowCreate",
    Account: account,
    Amount: amountDrops,
    Destination: destination,
    Condition: conditionHex,
    CancelAfter: Number(cancelAfterRipple),
  };
  if (campaignId != null) {
    tx.Memos = [
      {
        Memo: {
          MemoType: toHex("campaignId"),
          MemoData: memoForCampaign(String(campaignId)),
        },
      },
    ];
  }
  const res = await submitTransaction({ transaction: tx });
  if (res?.type === "reject") {
    throw new Error(res?.error?.message || "GemWallet conditional escrow rejected");
  }
  if (!res?.result?.hash) {
    throw new Error("No transaction hash returned");
  }
  return { hash: res.result.hash };
}
