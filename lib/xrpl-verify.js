/**
 * XRPL transaction verification for donation registration.
 * Fetches tx from ledger and validates Payment to treasury with memo.
 */

const XRPL_NETWORK = process.env.NEXT_PUBLIC_XRPL_NETWORK || "testnet";
const WSS =
  XRPL_NETWORK === "devnet"
    ? "wss://s.devnet.rippletest.net:51233"
    : "wss://s.altnet.rippletest.net:51233";

function hexToUtf8(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Verify a payment tx on XRPL.
 * @param {string} txHash - Ledger transaction hash
 * @param {string} expectedDestination - Expected Destination address (treasury)
 * @param {string} expectedAmountDrops - Expected amount in drops (for native XRP)
 * @param {string} memoContainsCampaignId - Campaign id that memo should contain (e.g. "cid:123")
 * @returns {Promise<{valid: boolean, donorAddress?: string}>}
 */
export async function verifyPaymentTx(
  txHash,
  expectedDestination,
  expectedAmountDrops,
  memoContainsCampaignId
) {
  const { Client } = await import("xrpl");
  const client = new Client(WSS);
  await client.connect();
  try {
    const resp = await client.request({
      command: "tx",
      transaction: txHash,
    });
    const tx = resp.result;

    if (tx.validated !== true) {
      return { valid: false, reason: "Transaction not validated" };
    }
    if (tx.TransactionType !== "Payment") {
      return { valid: false, reason: "Not a Payment transaction" };
    }
    if (tx.Destination !== expectedDestination) {
      return { valid: false, reason: "Destination mismatch" };
    }

    // Native XRP: Amount is string of drops. Issued currency: { currency, value, issuer }
    const amount = tx.Amount;
    const txDrops = typeof amount === "string" ? amount : null;
    if (txDrops !== null) {
      if (expectedAmountDrops && txDrops !== expectedAmountDrops) {
        return { valid: false, reason: "Amount mismatch" };
      }
    } else if (typeof amount === "object" && amount.currency) {
      // RLUSD / issued currency - skip drops check; API provides amountXrp
      if (!expectedAmountDrops) {
        // ok
      }
    } else {
      return { valid: false, reason: "Unsupported amount type" };
    }

    const memos = tx.Memos || [];
    let memoOk = !memoContainsCampaignId;
    for (const m of memos) {
      const memo = m.Memo;
      if (!memo || !memo.MemoData) continue;
      try {
        const data = hexToUtf8(memo.MemoData);
        const needle =
          memoContainsCampaignId.startsWith("cid:")
            ? memoContainsCampaignId
            : `cid:${memoContainsCampaignId}`;
        if (data === needle || data.includes(memoContainsCampaignId)) {
          memoOk = true;
          break;
        }
      } catch (_) {}
    }
    if (!memoOk) {
      return { valid: false, reason: "Memo does not contain campaign id" };
    }

    return { valid: true, donorAddress: tx.Account };
  } finally {
    await client.disconnect();
  }
}
