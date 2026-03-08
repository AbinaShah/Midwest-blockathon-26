# ProofFund — Hackathon Submission

## Inspiration

This project was inspired by a real situation involving a close friend.

A friend of ours had to raise money urgently for a medical emergency. They started a crowdfunding campaign hoping to get help quickly. The campaign actually began receiving donations faster than expected, but that unexpectedly created another problem.

Because the funding grew so quickly, the platform's fraud detection systems flagged the campaign as suspicious. The platform temporarily paused donations and required additional document verification. What should have been immediate help turned into days of waiting for manual verification, while the medical situation remained urgent.

Traditional platforms try to prevent fraud, but they rely heavily on manual reviews, which can slow down legitimate campaigns. In emergency situations, even a short delay can make a big difference.

This experience made us ask: *Can we design a system where campaigns are automatically verified and donors can trust them instantly?*

That question led us to build ProofFund.

---

## What it does

- **AI-powered verification** — Campaigns are analyzed by Gemini AI for fraud detection (document manipulation, AI-generated content) and cost validation, enabling faster trust without manual review.
- **Milestone-based funding** — Donors vote on milestone proofs; funds release only after approval, proof submission, and identity verification.
- **XRPL-native** — All donations, escrow, and releases happen on the XRP Ledger. Donors can use XRP, RLUSD, or condition-based escrow.
- **VerifiedCampaign NFT** — Campaigns that pass fraud checks receive an on-chain NFT badge as cryptographic proof.
- **Content-addressed storage** — Metadata and proofs are stored on IPFS via Pinata for transparency and permanence.

---

## How we built it

- **Frontend:** Next.js, React, TailwindCSS, GemWallet for XRPL connection.
- **Backend:** Python FastAPI for fraud detection and cost validation using Gemini API and scikit-learn.
- **Blockchain:** XRPL (xrpl.js) for payments, native escrow (condition-based and time-based), and NFT minting.
- **Storage:** Pinata (IPFS) for campaign metadata, images, verification docs, and milestone proofs.
- **Smart contracts:** Solidity (CrowdfundingPlatform.sol) for Ethereum/Polygon as optional deployment; XRPL is the primary chain.

---

## Challenges we ran into

- **Identity upload failures** — Server-side Pinata uploads from API routes initially failed; we switched to client-side uploads (like campaign images) and now pass CIDs to the API.
- **NFT display on Bithomp** — NFT metadata needed `ipfs://` format and PNG images (not SVG) for Bithomp to render the verified badge correctly.
- **Escrow UX confusion** — Donors were unsure about "time" vs "condition" escrow; we simplified to a single Escrow option with clear explanation.
- **XRPL vs smart contracts** — XRPL doesn't have EVM-style smart contracts; we used native EscrowCreate/EscrowFinish and condition+fulfillment for milestone-based release.

---

## Accomplishments that we're proud of

- **End-to-end XRPL integration** — Donations, escrow, milestone release, and VerifiedCampaign NFTs all on XRPL.
- **Condition-based escrow** — Donors lock XRP with a crypto-condition; funds release only when the creator triggers release after milestone approval.
- **AI fraud detection** — Automatic document verification and cost validation to reduce manual review delays.
- **Proof-of-verification on-chain** — VerifiedCampaign NFT mints when a campaign passes fraud check, giving donors visible trust signals.

---

## What we learned

- XRPL's native escrow (Condition + Fulfillment) is powerful for conditional release without smart contracts.
- NFT metadata standards (name, description, image, ipfs://) matter for explorer compatibility.
- Client-side Pinata uploads are more reliable than server-side in Next.js for larger files.
- Simplifying donor-facing options (one Escrow flow) improves UX over multiple technical variants.

---

## What's next for ProofFund

- Mainnet deployment and treasury management improvements.
- Multi-signature or DAO-based approval for milestone release in high-value campaigns.
- Integration with more XRPL wallets and mobile support.
- Expanded AI models for fraud detection and real-time cost validation.
