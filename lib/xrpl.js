/**
 * XRP Ledger integration for ProofFund (Testnet/Devnet).
 * Donate with XRP: payments to treasury with memo(campaignId).
 * Supports GemWallet or manual wallet (test secret) for demo.
 */

const XRPL_NETWORK = process.env.NEXT_PUBLIC_XRPL_NETWORK || "testnet";
const WSS = XRPL_NETWORK === "devnet"
  ? "wss://s.devnet.rippletest.net:51233"
  : "wss://s.altnet.rippletest.net:51233";

/**
 * Get treasury (destination) address from env. Required for XRPL donations.
 */
export function getTreasuryAddress() {
  return process.env.NEXT_PUBLIC_XRPL_TREASURY_ADDRESS || "";
}

function toHex(str) {
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Encode campaign id as memo (XRPL memo format). Memo data must be hex.
 */
export function memoForCampaign(campaignId) {
  return toHex(`cid:${campaignId}`);
}

/**
 * Connect to XRPL and return client (caller must disconnect).
 */
export async function connectClient() {
  const { Client } = await import("xrpl");
  const client = new Client(WSS);
  await client.connect();
  return client;
}

/**
 * Send XRP payment from wallet (wallet from seed) to treasury with memo + DestinationTag.
 * DestinationTag = campaignId for campaign-specific routing (per spec).
 */
export async function sendXrpPaymentFromWallet(wallet, amountXrp, campaignId) {
  const { Client } = await import("xrpl");
  const treasury = getTreasuryAddress();
  if (!treasury) throw new Error("NEXT_PUBLIC_XRPL_TREASURY_ADDRESS not set");
  const client = new Client(WSS);
  await client.connect();
  try {
    const memoHex = memoForCampaign(campaignId);
    const amountDrops = String(Math.round(Number(amountXrp) * XRP_TO_DROPS));
    const campaignIdNum = parseInt(String(campaignId), 10) || 0;
    const tx = {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: treasury,
      DestinationTag: campaignIdNum > 0 ? campaignIdNum : undefined,
      Amount: amountDrops,
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("campaignId", "utf8").toString("hex").toUpperCase(),
            MemoData: memoHex,
          },
        },
      ],
    };
    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    return { hash: result.result.hash, success: result.result.validated };
  } finally {
    await client.disconnect();
  }
}

/** 1 XRP = 1e6 drops */
const XRP_TO_DROPS = 1_000_000;

/** Ripple Epoch: Jan 1, 2000 00:00 UTC. XRPL timestamps are seconds since this. */
const RIPPLE_EPOCH = 946684800;

/** RLUSD on XRPL Testnet — issuer per Ripple docs. Currency code USD. */
export const RLUSD_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

/**
 * Create XRPL native Escrow: locks XRP until FinishAfter, then releases to Destination.
 * Used for time-based escrow donations — funds release to creator at campaign deadline.
 * @param {object} wallet - xrpl Wallet
 * @param {number} amountXrp - XRP amount
 * @param {string} destination - XRPL address to receive funds (e.g. creator's XRPL address)
 * @param {number} finishAfterUnix - Unix timestamp when escrow can be released
 * @param {number} campaignId - For memo (optional tracking)
 */
export async function createXrpEscrow(wallet, amountXrp, destination, finishAfterUnix, campaignId) {
  const { Client } = await import("xrpl");
  const client = new Client(WSS);
  await client.connect();
  try {
    const amountDrops = String(Math.round(Number(amountXrp) * XRP_TO_DROPS));
    const finishAfterRipple = Math.floor(Number(finishAfterUnix)) - RIPPLE_EPOCH;
    const cancelAfterRipple = finishAfterRipple + 30 * 24 * 60 * 60; // 30 days after finish

    const tx = {
      TransactionType: "EscrowCreate",
      Account: wallet.address,
      Amount: amountDrops,
      Destination: destination,
      FinishAfter: finishAfterRipple,
      CancelAfter: cancelAfterRipple,
    };
    if (campaignId != null) {
      tx.Memos = [
        {
          Memo: {
            MemoType: Buffer.from("campaignId", "utf8").toString("hex").toUpperCase(),
            MemoData: memoForCampaign(String(campaignId)),
          },
        },
      ];
    }
    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    return { hash: result.result.hash, success: result.result.validated };
  } finally {
    await client.disconnect();
  }
}

/**
 * Send RLUSD (IssuedCurrency) payment to treasury with memo.
 * Donor must have a trust line to RLUSD issuer and hold RLUSD (get from tryrlusd.com).
 */
export async function sendRlusdPaymentFromWallet(wallet, amountRlusd, campaignId) {
  const { Client } = await import("xrpl");
  const treasury = getTreasuryAddress();
  if (!treasury) throw new Error("NEXT_PUBLIC_XRPL_TREASURY_ADDRESS not set");
  const client = new Client(WSS);
  await client.connect();
  try {
    const amount = {
      currency: "USD",
      value: String(Number(amountRlusd)),
      issuer: RLUSD_ISSUER,
    };
    const memoHex = memoForCampaign(String(campaignId));
    const campaignIdNum = parseInt(String(campaignId), 10) || 0;
    const tx = {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: treasury,
      DestinationTag: campaignIdNum > 0 ? campaignIdNum : undefined,
      Amount: amount,
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("campaignId", "utf8").toString("hex").toUpperCase(),
            MemoData: memoHex,
          },
        },
      ],
    };
    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    return { hash: result.result.hash, success: result.result.validated };
  } finally {
    await client.disconnect();
  }
}

/**
 * Build payment params for use with GemWallet or other browser wallet.
 * Returns { destination, amount (drops), memoHex } so the wallet can build the tx.
 */
export function buildPaymentParams(amountXrp, campaignId) {
  const treasury = getTreasuryAddress();
  if (!treasury) throw new Error("NEXT_PUBLIC_XRPL_TREASURY_ADDRESS not set");
  return {
    destination: treasury,
    amountDrops: String(Math.round(Number(amountXrp) * XRP_TO_DROPS)),
    amountXrp: Number(amountXrp),
    memoHex: memoForCampaign(campaignId),
    memoTypeHex: toHex("campaignId"),
  };
}

/**
 * Get current XRPL network name (testnet, devnet).
 */
export function getXrplNetwork() {
  return process.env.NEXT_PUBLIC_XRPL_NETWORK || "testnet";
}

/**
 * Get XRPL explorer base URL for the current network.
 */
export function explorerBaseUrl() {
  const net = getXrplNetwork();
  return net === "devnet" ? "https://devnet.xrpl.org" : "https://testnet.xrpl.org";
}

/**
 * Get explorer URL for a transaction hash.
 */
export function explorerTxUrl(hash) {
  if (XRPL_NETWORK === "devnet") {
    return `https://devnet.xrpl.org/transactions/${hash}`;
  }
  return `https://testnet.xrpl.org/transactions/${hash}`;
}

/**
 * Create wallet from seed (testnet/devnet only - never use mainnet secret in frontend).
 */
export async function walletFromSeed(secret) {
  const { Wallet } = await import("xrpl");
  return Wallet.fromSeed(secret.trim());
}

/**
 * Send XRP from treasury to a destination. Server-side only.
 * Uses XRPL_TREASURY_SECRET from env. Used for milestone release payouts.
 */
export async function sendXrpFromTreasury(destination, amountDrops) {
  const secret = process.env.XRPL_TREASURY_SECRET;
  if (!secret) throw new Error("XRPL_TREASURY_SECRET not set");
  const { Client } = await import("xrpl");
  const wallet = await walletFromSeed(secret);
  const client = new Client(WSS);
  await client.connect();
  try {
    const tx = {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: destination,
      Amount: String(amountDrops),
    };
    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    return { hash: result.result.hash, success: result.result.validated };
  } finally {
    await client.disconnect();
  }
}
