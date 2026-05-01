# ProofFund

**Full-stack decentralized crowdfunding (XRPL-first)** — transparent, milestone-based fund distribution with AI fraud detection. Uses XRP Ledger for payments/escrows, Pinata for IPFS storage, and Gemini for fraud analysis.

## Code tour (start here)

If you only have 10 minutes, these files show the core logic (and make for good interview discussion):

- **XRPL payments + verification**: `lib/xrpl.js`, `lib/xrpl-verify.js`
- **XRPL-native campaign storage + API**: `lib/xrpl-store.js`, `pages/api/xrpl/**`
- **Pinata IPFS pinning**: `lib/pinata-metadata.js`
- **AI backend (FastAPI)**: `backend/app/main.py`, `backend/app/fraud_detection.py`, `backend/app/cost_validation.py`
- **Frontend UX**: `pages/index.js`, `pages/xrpl.js`
- **Optional EVM contract mode** (Hackathon version): `contracts/CrowdfundingPlatform.sol`, `scripts/deploy.js`

## Two modes (so the README doesn’t feel contradictory)

- **XRPL-native mode (recommended demo)**: Visit `/xrpl`. No MetaMask; campaigns are stored in `data/xrpl-campaigns.json` and metadata/proofs are pinned to IPFS via Pinata.
- **EVM contract mode (optional)**: The repo also contains a Hardhat + Solidity contract used for milestone governance + on-chain metadata CID storage in the hackathon build.

---

## Hackathon alignment (all three tracks)

### XRPL (primary blockchain)

- **Donations:** XRP or RLUSD to treasury with memo + DestinationTag. All on-chain.
- **Escrow:** Donors can lock XRP with `EscrowCreate`; auto-releases to creator at deadline.
- **Release:** Backend sends XRP from treasury after votes approve + identity verification.

### 3. Pinata Builder Track

- **Content-addressed storage:** Campaign metadata (title, description, verification result, cost validation) is pinned as JSON via Pinata; only the IPFS CID is stored on-chain. Milestone proofs (images, receipts) are pinned via Pinata; CIDs stored in contract. **Reliability, transparency, ownership** of user-generated content.
- **OpenClaw (agentic AI):** [agents.pinata.cloud](https://agents.pinata.cloud) — one-click hosted OpenClaw. For campaigns with metadata CID, the app links to OpenClaw with the campaign's IPFS URL as context. Ask questions about campaigns using content-addressed data.
- **CLAW-BLOCKATHON:** Use code **CLAW-BLOCKATHON** at Pinata checkout for **one month free** on a paid plan.

---

## Core concept

- **XRPL-first** — XRPL-native mode works without MetaMask
- **Milestone-based release** — donor-weighted voting; funds released only after proof + approval
- **AI fraud detection** — Gemini analyzes documents (manipulation, relevance, AI-generated)
- **Cost validation** — Gemini + location/category to flag unrealistic amounts
- **Identity verification** — gov ID, selfie, bank details before withdrawal
- **Decentralized storage** — Pinata for metadata, images, proofs

---

## Tech stack

| Layer | Stack |
|-------|--------|
| **Frontend** | Next.js, TailwindCSS, xrpl.js |
| **Blockchain** | XRPL Testnet/Devnet (primary) + optional EVM (Hardhat/Solidity) |
| **Storage** | Pinata (IPFS) for metadata, images, proofs |
| **AI** | Gemini API for fraud detection + cost validation |
| **Backend** | Python FastAPI (verify-documents, validate-cost) |

---

## Project structure

```
├── contracts/
│   └── CrowdfundingPlatform.sol   # Escrow, milestones, voting, fraudScore, isVerified, metadataHash
├── scripts/
│   └── deploy.js
├── data/
│   └── xrpl-campaigns.json        # XRPL-native campaign store
├── lib/
│   ├── xrpl.js                    # XRPL Testnet/Devnet: treasury payment, memo, sendXrpFromTreasury
│   ├── xrpl-verify.js             # verifyPaymentTx: validate donation tx on XRPL
│   ├── xrpl-store.js              # JSON file store for XRPL campaigns
│   └── pinata-metadata.js         # Pin campaign JSON to Pinata; pinFileToPinata
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI: /verify-documents, /validate-cost
│   │   ├── fraud_detection.py     # Multi-model + mock Reality Defender / SiteEngine
│   │   ├── cost_validation.py     # Scraper stub + LLM validation
│   │   └── document_requirements.py
│   └── requirements.txt
├── pages/
│   ├── index.js                   # Main app: campaigns, create, XRPL donate, OpenClaw link
│   ├── xrpl.js                    # XRPL-native UI (no MetaMask, paste-secret wallet)
│   └── api/
│       ├── set-verification.js    # On-chain setCampaignVerification (verifier)
│       └── xrpl/
│           ├── campaigns/         # GET list, POST create
│           └── campaigns/[id]/    # GET, POST donate, milestones/[mid]/vote|proof|release
├── styles/
│   └── globals.css
├── hardhat.config.js
├── tailwind.config.js
└── package.json
```

---

## Setup

## Quickstart (minimal, interview-friendly)

This is the smallest path to run something locally without deploying contracts.

### 1) Install dependencies

```bash
npm install
```

### 2) Configure env

```bash
cp .env.local.example .env.local
```

Fill in at least:

- `NEXT_PUBLIC_PINATA_JWT`
- `NEXT_PUBLIC_XRPL_TREASURY_ADDRESS`
- `NEXT_PUBLIC_XRPL_NETWORK` (leave as `testnet` unless you know you need `devnet`)
- `NEXT_PUBLIC_AI_API_URL` (keep default if you’ll run the backend)

### 3) Run the backend (AI fraud + cost validation)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4) Run the frontend

```bash
cd ..
npm run dev
```

Open `http://localhost:3000` and use the **XRPL-native** experience at `/xrpl`.

### 1. Install and compile

```bash
npm install
npx hardhat compile
```

After any contract change (e.g. `metadataHash`, `setCampaignMetadataHash`), run `npx hardhat compile` again so the frontend artifact stays in sync.

### 2. Environment

**Root `.env` (Hardhat + deploy):**

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology/
PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=...
POLYGONSCAN_API_KEY=...
```

**`.env.local` (Next.js frontend):** Copy from `.env.local.example` and fill in:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...   # After deploy
NEXT_PUBLIC_PINATA_JWT=...           # REQUIRED — get at https://app.pinata.cloud/ → Developers → API Keys
NEXT_PUBLIC_AI_API_URL=http://localhost:8000
# XRPL (required for XRP/RLUSD/Escrow donations)
NEXT_PUBLIC_XRPL_TREASURY_ADDRESS=r...  # Get at https://xrpl.org/xrp-testnet-faucet.html
NEXT_PUBLIC_XRPL_NETWORK=testnet        # or devnet
```

**Pinata & XRPL:** Campaign creation requires Pinata. XRPL is required for XRP/RLUSD/Escrow donations. The Create tab shows status: "Pinata configured" / "XRPL treasury set".

**Verifier (on-chain fraud score):** set in `.env.local` so the API route can call `setCampaignVerification`:

```env
VERIFIER_PRIVATE_KEY=0x...   # Same as deployer or designated verifier wallet)
```

**Backend (AI - fraud detection + cost validation):** in `backend/.env`:

```env
# Gemini (preferred) - for fraud detection on documents + location-aware cost validation
GEMINI_API_KEY=...   # Get from https://aistudio.google.com/apikey

# OpenAI (fallback for cost validation only)
OPENAI_API_KEY=sk-...
```

### 3. Deploy contract

```bash
npx hardhat run scripts/deploy.js --network sepolia
# or
npx hardhat run scripts/deploy.js --network polygon
```

Copy the deployed address into `NEXT_PUBLIC_CONTRACT_ADDRESS`.

### 4. Run AI backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or from root: `npm run backend`.

### 5. Run frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Connect MetaMask (same network as deploy).

---

## Demo flow

1. **Connect wallet** — MetaMask on Sepolia or Polygon testnet.
2. **Create campaign** — Fill title, description, location, campaign type. Upload documents. Click **Verify with AI**; backend runs fraud detection and cost validation. Click **Create campaign on‑chain**; frontend optionally calls `/api/set-verification` and then **pins campaign metadata JSON to Pinata** and calls `setCampaignMetadataHash(campaignId, cid)` so data is content-addressed.
3. **Donate (ETH/MATIC)** — Select campaign, enter amount, confirm tx. Donor receives tier NFT.
4. **Donate with XRP/RLUSD/Escrow (XRPL)** — On campaign detail: (a) **XRP → Treasury** — direct payment with memo; (b) **RLUSD** — stablecoin payment (get RLUSD at tryrlusd.com); (c) **XRP Escrow** — lock XRP until deadline, auto-release to creator (creator must set XRPL address when creating campaign).
5. **Pinata & OpenClaw** — On campaign detail, **Pinata Builder Track** section: View metadata (IPFS), Ask OpenClaw about this campaign. Use **CLAW-BLOCKATHON** for one month free.
6. **Milestone proof** — Creator uploads proof file → pinned to Pinata (IPFS) → `submitMilestoneProof(campaignId, milestoneId, ipfsHash)`.
7. **Vote** — Donors call `voteMilestone(campaignId, milestoneId, approve)`; weight = contribution.
8. **Release funds** — Creator calls `releaseFunds(campaignId, milestoneId)` when votes approve.
9. **Refund** — If deadline passed and goal not met, donors call `refundDonors(campaignId)` to claim back.

---

## Smart contract (summary)

- **createCampaign(title, description, location, fundingGoal, deadline, milestoneDescriptions, milestoneAmounts)** — creates campaign; verification and metadata hash set later.
- **setCampaignVerification(campaignId, fraudScore, isVerified)** — callable only by `verifier`.
- **setCampaignMetadataHash(campaignId, ipfsCid)** — creator or verifier; stores Pinata IPFS CID for content-addressed campaign metadata.
- **donate(campaignId)** — payable; records donor, mints tier NFT.
- **submitMilestoneProof(campaignId, milestoneId, ipfsHash)** — creator only.
- **voteMilestone(campaignId, milestoneId, approve)** — donors only; weight = contribution.
- **releaseFunds(campaignId, milestoneId)** — creator; requires majority approval and proof.
- **refundDonors(campaignId)** — per-donor refund if goal not met after deadline.

---

## AI backend API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/campaign-types` | GET | List campaign types (medical, disaster, education, other) |
| `/required-documents/{type}` | GET | Required document types for campaign type |
| `/verify-documents` | POST | Form: `campaign_type`, `files[]`. Returns `fraud_score`, `flagged`, `fraud_score_0_100`, `details` |
| `/validate-cost` | POST | Form: `description`, `location`, `requested_amount`, `campaign_type`. Returns `estimated_real_cost`, `reasoning`, `confidence_score`, `flag_for_review` |

---

## Transparency dashboard

The **Transparency & analytics** tab shows:

- Total funds raised / released / locked
- Campaign count and verified count
- **Fraud verification status** table (per-campaign fraud score and verified flag from chain)
- Top donors
- Recent on-chain transaction hashes with explorer links

---

## XRPL (Testnet / Devnet)

- **Treasury:** Set `NEXT_PUBLIC_XRPL_TREASURY_ADDRESS` to an XRPL account (e.g. [XRPL Testnet Faucet](https://xrpl.org/xrp-testnet-faucet.html)). XRP and RLUSD donations go to this address with memo(campaignId).
- **Donate with XRP:** On campaign detail, use the “Donate with XRP” section. Uses `sendXrpPaymentFromWallet` in `lib/xrpl.js`.
- **Donate with RLUSD:** IssuedCurrency Payment to treasury. Issuer `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV`. Get testnet RLUSD at [tryrlusd.com](https://tryrlusd.com).
- **Donate with XRP Escrow:** `EscrowCreate` — locks XRP until campaign deadline, auto-releases to creator's XRPL address. Creator sets XRPL address when creating campaign.
- **Network:** `NEXT_PUBLIC_XRPL_NETWORK=testnet` (default) or `devnet`; `lib/xrpl.js` uses the corresponding public WebSocket URL.

---

## XRPL-Native Mode (no MetaMask)

Visit `/xrpl` for an XRPL-only crowdfunding experience. **No MetaMask required** — use paste-secret for your XRPL wallet. Data stored in `data/xrpl-campaigns.json` and Pinata.

### Setup for XRPL-native

**`.env.local`:**

```env
NEXT_PUBLIC_PINATA_JWT=...              # Pin campaign metadata + proofs to IPFS
NEXT_PUBLIC_XRPL_TREASURY_ADDRESS=r...  # Treasury receives donations
NEXT_PUBLIC_XRPL_NETWORK=testnet        # or devnet

# Server-side: treasury secret for milestone payouts (Release)
XRPL_TREASURY_SECRET=s...               # Same account as NEXT_PUBLIC_XRPL_TREASURY_ADDRESS
```

- **NEXT_PUBLIC_XRPL_TREASURY_ADDRESS** — Donations (XRP/RLUSD) go here with memo(campaignId).
- **XRPL_TREASURY_SECRET** — Server-side only. Used when donors approve a milestone; backend sends XRP from treasury to the creator.

### Features

- **Create campaign** — Pins metadata to Pinata, stores in `data/xrpl-campaigns.json`
- **Donate** — XRP, RLUSD, or XRP Escrow (paste secret, send tx, then register via API)
- **Vote** — Donors vote on milestones; only donors can vote
- **Submit proof** — Upload file to Pinata, stores proof CID
- **Release** — Backend sends XRP from treasury to creator when votes approve

---

## Pinata and OpenClaw (Builder Track)

- **Content-addressed storage:** Campaign metadata (title, description, verification, cost validation, `creatorXrplAddress`) is pinned as JSON via Pinata; only the IPFS CID is stored on-chain (`campaignMetadataHash`). Milestone proofs (images, receipts) are pinned to Pinata; CIDs stored in contract. **Reliability, transparency, ownership** of user-generated content.
- **OpenClaw:** [agents.pinata.cloud](https://agents.pinata.cloud) is a one-click hosted OpenClaw instance. For campaigns that have a metadata CID, the app shows **“Ask OpenClaw about this campaign”** linking to the agent with the campaign’s IPFS URL as context. OpenClaw requires a paid plan; use code **CLAW-BLOCKATHON** at checkout for **one month free**.

---

## Optional: real fraud APIs and LLM

- **Reality Defender / SiteEngine:** replace the mock functions in `backend/app/fraud_detection.py` with real API calls using your keys.
- **OpenAI:** set `OPENAI_API_KEY` in `backend/.env`; `cost_validation.py` will use it for LLM cost validation.
- **Web scraper:** extend `scrape_estimated_costs()` in `backend/app/cost_validation.py` with BeautifulSoup/Scrapy to fetch real price data by location and campaign type.

---

## GitHub and hackathon submission

- Keep the repo **public on GitHub** with a **clear README** (this file) so judges can clone and run a testable MVP.
- **Run locally:** `npm install` → `npx hardhat compile` → set `.env.local` (and optionally `.env` for deploy) → `npm run dev`; optionally run the AI backend and set an XRPL treasury address for full flows.
- **Testnet/Devnet:** Contract on Sepolia or Polygon Amoy; XRPL donations on XRPL Testnet or Devnet. No mainnet keys in the repo.

---

## License

MIT.
