/**
 * Mint VerifiedCampaignNFT on XRPL when campaign passes fraud check.
 * NFT metadata: campaign_id, verification_score, ipfs_hash, timestamp.
 * Mints to treasury; proof lives on-chain. Creator can claim later if desired.
 */

const WSS =
  (process.env.NEXT_PUBLIC_XRPL_NETWORK || "testnet") === "devnet"
    ? "wss://s.devnet.rippletest.net:51233"
    : "wss://s.altnet.rippletest.net:51233";

/** Taxon for VerifiedCampaign NFTs */
const VERIFIED_CAMPAIGN_TAXON = 1;

/**
 * Mint VerifiedCampaignNFT. Mints to treasury (no Destination) for reliable extraction.
 * @param {string} _creatorAddress - Unused; mint goes to treasury
 * @param {object} metadata - { campaignId, verificationScore, ipfsHash, timestamp }
 * @param {string} metadataCid - IPFS CID for full metadata JSON
 * @returns {Promise<{ hash: string, nftId?: string }>}
 */
export async function mintVerifiedCampaignNFT(_creatorAddress, metadata, metadataCid) {
  const { Client, Wallet, convertStringToHex, getNFTokenID } = await import("xrpl");
  const secret = process.env.XRPL_TREASURY_SECRET;
  if (!secret) throw new Error("XRPL_TREASURY_SECRET not set");

  const uri = metadataCid
    ? `https://gateway.pinata.cloud/ipfs/${metadataCid}`
    : `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;

  const client = new Client(WSS);
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(secret);
    const uriHex = convertStringToHex(uri.slice(0, 256));

    const tx = {
      TransactionType: "NFTokenMint",
      Account: wallet.address,
      NFTokenTaxon: VERIFIED_CAMPAIGN_TAXON,
      URI: uriHex,
      Flags: 8, // tfTransferable
      TransferFee: 0,
    };

    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    let nftId;
    try {
      nftId = getNFTokenID(result.result.meta);
    } catch (_) {
      nftId = result.result.meta?.nftoken_id;
    }
    return { hash: result.result.hash, nftId };
  } finally {
    await client.disconnect();
  }
}
