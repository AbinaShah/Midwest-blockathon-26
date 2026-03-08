import { useEffect, useState } from "react";
import Link from "next/link";
import {
  sendXrpPaymentFromWallet,
  createXrpEscrow,
  sendRlusdPaymentFromWallet,
  walletFromSeed,
  explorerTxUrl,
  explorerBaseUrl,
  getTreasuryAddress,
  getXrplNetwork,
} from "../lib/xrpl";
import {
  isGemWalletInstalled,
  connectGemWallet,
  sendXrpViaGemWallet,
  sendRlusdViaGemWallet,
  createEscrowViaGemWallet,
  createConditionalEscrowViaGemWallet,
} from "../lib/gemwallet";

const XRP_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
});

function shorten(addr, chars = 4) {
  if (!addr) return "";
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === "string" ? result.split(",")[1] : "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function XrplPage() {
  const [walletSecret, setWalletSecret] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [gemWalletInstalled, setGemWalletInstalled] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [view, setView] = useState("list"); // list | detail | create | transparency
  const [identityFiles, setIdentityFiles] = useState({ govId: null, selfie: null, bank: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  // Create form
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    location: "",
    category: "other",
    goalXrp: "",
    deadline: "",
    creatorXrplAddress: "",
    milestones: [{ description: "", amountXrp: "" }],
  });
  const [createDocFiles, setCreateDocFiles] = useState([]);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [costValidation, setCostValidation] = useState(null);
  const [imageFile, setImageFile] = useState(null);

  // Donate
  const [donateAmount, setDonateAmount] = useState("");
  const [donateMode, setDonateMode] = useState("xrp"); // xrp | rlusd | escrow (condition-based, release when milestone approved)
  const [donateEscrowMilestone, setDonateEscrowMilestone] = useState("");

  // Vote
  const [selectedMilestone, setSelectedMilestone] = useState("");
  const [voteApprove, setVoteApprove] = useState(true);

  // Proof
  const [proofFile, setProofFile] = useState(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/xrpl/campaigns");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch campaigns", e);
      setCampaigns([]);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    const check = () => isGemWalletInstalled().then(setGemWalletInstalled);
    if (typeof window !== "undefined") {
      if (document.readyState === "complete") {
        setTimeout(check, 500);
      } else {
        window.addEventListener("load", () => setTimeout(check, 500));
        return () => window.removeEventListener("load", check);
      }
    }
  }, []);

  useEffect(() => {
    if (walletSecret && walletSecret.length >= 25) {
      walletFromSeed(walletSecret)
        .then((w) => setWalletAddress(w.address))
        .catch(() => setWalletAddress(""));
    }
    // When secret is cleared, keep walletAddress (may be from GemWallet)
  }, [walletSecret]);

  const handleConnectGemWallet = async () => {
    setConnectingWallet(true);
    setError("");
    try {
      // Ensure extension is detected first (sets window.gemWallet for getAddress to work)
      const installed = await isGemWalletInstalled();
      if (!installed) {
        throw new Error("GemWallet not detected. Refresh the page, ensure the extension is enabled, then try again.");
      }
      const addr = await connectGemWallet();
      setWalletAddress(addr);
      setWalletSecret("");
      setSuccessMsg("GemWallet connected!");
    } catch (err) {
      setError(err?.message || "Failed to connect GemWallet");
    } finally {
      setConnectingWallet(false);
    }
  };

  const handleDisconnectWallet = () => {
    setWalletAddress("");
    setWalletSecret("");
    setSuccessMsg("");
  };

  const isWalletConnected = !!walletAddress;

  // Role-based visibility: creator vs donor
  const creatorAddr = selectedCampaign?.creatorXrplAddress || selectedCampaign?.creatorWalletAddress || "";
  const isCreator = isWalletConnected && creatorAddr && walletAddress === creatorAddr;
  const isDonor = isWalletConnected && (selectedCampaign?.donors || []).some((d) => d.address === walletAddress);

  const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8000";
  const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || "";

  const handleVerifyWithAI = async () => {
    if (!createForm.title || !createForm.description || !createForm.goalXrp) {
      setError("Fill title, description, and goal first.");
      return;
    }
    setVerifying(true);
    setVerificationResult(null);
    setCostValidation(null);
    try {
      const formData = new FormData();
      formData.append("campaign_type", createForm.category);
      (createDocFiles || []).forEach((f) => formData.append("files", f));
      const verifyRes = await fetch(`${AI_API_URL}/verify-documents`, { method: "POST", body: formData });
      const fraudData = verifyRes.ok
        ? await verifyRes.json()
        : { fraud_score: 0, flagged: false, source: "unavailable" };
      setVerificationResult(fraudData);
      const costRes = await fetch(`${AI_API_URL}/validate-cost`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          description: createForm.description,
          location: createForm.location || "Global",
          requested_amount: String(parseFloat(createForm.goalXrp || "0") * 2),
          campaign_type: createForm.category,
        }),
      });
      if (costRes.ok) setCostValidation(await costRes.json());
    } catch (err) {
      setError("AI backend unavailable. Run: npm run backend");
    } finally {
      setVerifying(false);
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    setError("");
    const validMilestones = createForm.milestones.filter((m) => m.description && m.amountXrp);
    if (validMilestones.length === 0) {
      setError("Add at least one milestone with description and XRP amount.");
      return;
    }
    setLoading(true);
    try {
      let imageCid = "";
      if (imageFile && PINATA_JWT) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
          method: "POST",
          headers: { Authorization: `Bearer ${PINATA_JWT}` },
          body: fd,
        });
        if (r.ok) {
          const j = await r.json();
          imageCid = j.IpfsHash || "";
        }
      }
      const documentCids = [];
      if (PINATA_JWT && createDocFiles?.length) {
        for (let i = 0; i < createDocFiles.length; i++) {
          const f = createDocFiles[i];
          if (!f) continue;
          const fd = new FormData();
          fd.append("file", f);
          try {
            const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
              method: "POST",
              headers: { Authorization: `Bearer ${PINATA_JWT}` },
              body: fd,
            });
            if (r.ok) {
              const j = await r.json();
              documentCids.push({ filename: f.name || `doc-${i}`, cid: j.IpfsHash });
            }
          } catch (_) {}
        }
      }
      const res = await fetch("/api/xrpl/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorXrplAddress: createForm.creatorXrplAddress.trim() || walletAddress,
          title: createForm.title,
          description: createForm.description,
          location: createForm.location || "Global",
          category: createForm.category || "other",
          goalXrp: Number(createForm.goalXrp),
          deadline: new Date(createForm.deadline).getTime() / 1000,
          imageCid,
          documentCids,
          milestones: createForm.milestones
            .filter((m) => m.description && m.amountXrp)
            .map((m) => ({ description: m.description, amountXrp: Number(m.amountXrp) })),
          verificationResult,
          costValidation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setSuccessMsg("Campaign created!");
      setCreateForm({
        title: "",
        description: "",
        location: "",
        category: "other",
        goalXrp: "",
        deadline: "",
        creatorXrplAddress: "",
        milestones: [{ description: "", amountXrp: "" }],
      });
      setVerificationResult(null);
      setCostValidation(null);
      setImageFile(null);
      fetchCampaigns();
      setView("list");
    } catch (err) {
      setError(err?.message || "Create failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDonate = async () => {
    if (!selectedCampaign || !walletAddress || !donateAmount) {
      setError("Connect wallet and enter amount.");
      return;
    }
    const amt = Number(donateAmount);
    if (amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError("");
    setTxHash(null);
    setLoading(true);
    try {
      let hash;
      const treasury = getTreasuryAddress();
      const campaignIdNum = parseInt(String(selectedCampaign.id), 10) || 0;
      const memoHex = (await import("../lib/xrpl")).memoForCampaign(selectedCampaign.id);

      if (donateMode === "escrow") {
        if (!donateEscrowMilestone) {
          throw new Error("Select which milestone this donation supports. Funds will release to the creator when that milestone is approved.");
        }
        if (!gemWalletInstalled || walletSecret) {
          throw new Error("Escrow requires GemWallet (no secret fallback).");
        }
        const condRes = await fetch("/api/xrpl/escrow-condition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: selectedCampaign.id,
            milestoneId: donateEscrowMilestone,
          }),
        });
        const condData = await condRes.json().catch(() => ({}));
        if (!condRes.ok) throw new Error(condData.error || "Failed to get escrow condition");
        const creatorAddr = selectedCampaign.creatorXrplAddress || selectedCampaign.creatorWalletAddress;
        if (!creatorAddr) throw new Error("Campaign has no creator XRPL address.");
        const r = await createConditionalEscrowViaGemWallet(
          walletAddress,
          amt,
          creatorAddr,
          condData.conditionHex,
          condData.cancelAfterRipple,
          selectedCampaign.id
        );
        hash = r.hash;
        const regRes = await fetch("/api/xrpl/escrow-register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txHash: hash,
            campaignId: selectedCampaign.id,
            milestoneId: donateEscrowMilestone,
          }),
        });
        const regData = await regRes.json().catch(() => ({}));
        if (!regRes.ok) throw new Error(regData.error || "Failed to register escrow");
      } else if (gemWalletInstalled && !walletSecret) {
        if (donateMode === "xrp") {
          const r = await sendXrpViaGemWallet(amt, treasury, campaignIdNum, memoHex);
          hash = r.hash;
        } else if (donateMode === "rlusd") {
          const r = await sendRlusdViaGemWallet(walletAddress, amt, campaignIdNum, selectedCampaign.id);
          hash = r.hash;
        } else {
          const creatorAddr = selectedCampaign.creatorXrplAddress || selectedCampaign.creatorWalletAddress;
          if (!creatorAddr) throw new Error("Campaign has no creator XRPL address for escrow.");
          const deadlineTs = Number(selectedCampaign.deadline) || Math.floor(Date.now() / 1000) + 86400 * 30;
          const r = await createEscrowViaGemWallet(walletAddress, amt, creatorAddr, deadlineTs, selectedCampaign.id);
          hash = r.hash;
        }
      } else if (walletSecret && walletSecret.length >= 25) {
        const wallet = await walletFromSeed(walletSecret);
        if (donateMode === "xrp") {
          const r = await sendXrpPaymentFromWallet(wallet, amt, selectedCampaign.id);
          hash = r.hash;
        } else if (donateMode === "rlusd") {
          const r = await sendRlusdPaymentFromWallet(wallet, amt, selectedCampaign.id);
          hash = r.hash;
        } else {
          const creatorAddr = selectedCampaign.creatorXrplAddress || selectedCampaign.creatorWalletAddress;
          if (!creatorAddr) throw new Error("Campaign has no creator XRPL address for escrow.");
          const deadlineTs = Number(selectedCampaign.deadline) || Math.floor(Date.now() / 1000) + 86400 * 30;
          const r = await createXrpEscrow(wallet, amt, creatorAddr, deadlineTs, selectedCampaign.id);
          hash = r.hash;
        }
      } else {
        throw new Error("Connect GemWallet or paste wallet secret to donate.");
      }
      setTxHash(hash);

      if (donateMode !== "escrow") {
        const res = await fetch(`/api/xrpl/campaigns/${selectedCampaign.id}/donate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txHash: hash,
            amountXrp: donateMode === "rlusd" ? amt : amt,
            donorAddress: walletAddress,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Register donation failed");
      }
        setSuccessMsg(donateMode === "escrow" ? "Escrow created! Funds will release to the creator when this milestone is approved (proof + votes + identity)." : "Donation registered!");
      setDonateAmount("");
      if (selectedCampaign) {
        const detail = await fetch(`/api/xrpl/campaigns/${selectedCampaign.id}`).then((r) => r.json());
        setSelectedCampaign(detail);
      }
      fetchCampaigns();
    } catch (err) {
      setError(err?.message || "Donate failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async () => {
    if (!selectedCampaign || !walletAddress || !selectedMilestone) {
      setError("Select campaign, connect wallet, and choose a milestone.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/xrpl/campaigns/${selectedCampaign.id}/milestones/${selectedMilestone}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ donorAddress: walletAddress, approve: voteApprove }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vote failed");
      setSuccessMsg("Vote recorded!");
      const detail = await fetch(`/api/xrpl/campaigns/${selectedCampaign.id}`).then((r) => r.json());
      setSelectedCampaign(detail);
    } catch (err) {
      setError(err?.message || "Vote failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitProof = async () => {
    if (!selectedCampaign || !selectedMilestone || !proofFile) {
      setError("Select campaign, milestone, and a file.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const fileBase64 = await fileToBase64(proofFile);
      const res = await fetch(
        `/api/xrpl/campaigns/${selectedCampaign.id}/milestones/${selectedMilestone}/proof`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64, filename: proofFile.name }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Proof upload failed (${res.status})`);
      setSuccessMsg("Proof submitted! Documents saved to IPFS.");
      setProofFile(null);
      setError("");
      const detail = await fetch(`/api/xrpl/campaigns/${selectedCampaign.id}`).then((r) => r.json());
      setSelectedCampaign(detail);
      fetchCampaigns();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err?.message || "Proof upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async () => {
    if (!selectedCampaign || !selectedMilestone) {
      setError("Select campaign and milestone.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/xrpl/campaigns/${selectedCampaign.id}/milestones/${selectedMilestone}/release`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Release failed");
      setSuccessMsg("Funds released! " + (data.txHash ? `Tx: ${data.txHash}` : ""));
      const detail = await fetch(`/api/xrpl/campaigns/${selectedCampaign.id}`).then((r) => r.json());
      setSelectedCampaign(detail);
      fetchCampaigns();
    } catch (err) {
      setError(err?.message || "Release failed");
    } finally {
      setLoading(false);
    }
  };

  const addMilestoneField = () => {
    setCreateForm((prev) => ({
      ...prev,
      milestones: [...prev.milestones, { description: "", amountXrp: "" }],
    }));
  };

  const updateMilestone = (idx, field, value) => {
    setCreateForm((prev) => {
      const m = [...prev.milestones];
      m[idx] = { ...m[idx], [field]: value };
      return { ...prev, milestones: m };
    });
  };

  return (
    <div className="app-shell">
      <header className="navbar">
        <Link href="/" className="navbar-logo" style={{ textDecoration: "none", color: "inherit" }}>
          ProofFund
        </Link>
        <nav className="navbar-nav">
          <button type="button" className="nav-link" onClick={() => { setView("list"); setSelectedCampaign(null); }}>
            Explore
          </button>
          <button type="button" className="nav-link" onClick={() => setView("create")}>
            Create campaign
          </button>
          <button type="button" className="nav-link" onClick={() => setView("transparency")}>
            Transparency
          </button>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {walletAddress ? (
            <>
              <span className="wallet-badge"><span className="wallet-dot" /> {shorten(walletAddress)}</span>
              <button type="button" className="btn-outline-sm" onClick={handleDisconnectWallet}>Disconnect</button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="wallet-button"
                onClick={handleConnectGemWallet}
                disabled={connectingWallet}
              >
                {connectingWallet ? "Connecting…" : "Connect GemWallet"}
              </button>
              <a
                href="https://gemwallet.app"
                target="_blank"
                rel="noreferrer"
                className="btn-outline-sm"
                style={{ fontSize: "0.85rem" }}
              >
                Install
              </a>
            </>
          )}
        </div>
      </header>

      <section className="hero">
        <h1 className="hero-title">ProofFund</h1>
        <a href="#" onClick={(e) => { e.preventDefault(); setView("transparency"); }} className="hero-blockchain-badge">
          🔗 All transactions verified on XRPL blockchain
        </a>
        <p className="hero-subtitle">
          Decentralized crowdfunding on XRPL. Create campaigns, donate with XRP or RLUSD,
          AI fraud detection, milestone-based release. Connect with GemWallet.
        </p>
        {!walletAddress && (
          <p className="hero-hint">Connect your GemWallet above to donate or vote on campaigns.</p>
        )}
      </section>

      <main className="app-main">
        {(error || successMsg) && (
          <div
            id="alert-banner"
            role="alert"
            className="alert-banner"
            style={{
              marginBottom: "1rem",
              padding: "1rem 1.25rem",
              borderRadius: 10,
              background: error ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
              color: error ? "#b91c1c" : "#15803d",
              fontWeight: 500,
              border: `1px solid ${error ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <span>{error || successMsg}</span>
            <button
              type="button"
              onClick={() => { setError(""); setSuccessMsg(""); }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "1.25rem",
                lineHeight: 1,
                opacity: 0.7,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {view === "list" && !selectedCampaign && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 className="section-title">XRPL campaigns</h2>
              <button
                type="button"
                className="btn-primary btn-primary-filled"
                onClick={() => setView("create")}
              >
                Create campaign
              </button>
            </div>
            {campaigns.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">💧</div>
                <div className="empty-state-title">No XRPL campaigns yet</div>
                <div className="empty-state-desc">Create one to get started.</div>
                <button
                  type="button"
                  className="btn-primary btn-primary-filled"
                  style={{ marginTop: "1rem" }}
                  onClick={() => setView("create")}
                >
                  Create campaign
                </button>
              </div>
            ) : (
              <div className="campaign-grid">
                {campaigns.map((c) => {
                  const progress = c.goalXrp > 0 ? (c.totalRaisedXrp / c.goalXrp) * 100 : 0;
                  const deadline = new Date(Number(c.deadline) * 1000);
                  return (
                    <div
                      key={c.id}
                      className="campaign-card"
                      onClick={() => {
                        setSelectedCampaign(c);
                        setView("detail");
                      }}
                    >
                      <div
                        className="campaign-card-image"
                        style={c.imageCid ? { backgroundImage: `url(https://gateway.pinata.cloud/ipfs/${c.imageCid})`, backgroundSize: "cover" } : {}}
                      >
                        {!c.imageCid && <span>💧</span>}
                        <span className="campaign-card-xrpl-badge">On XRPL</span>
                        {c.verificationStatus === "approved" && (
                          <span className="campaign-card-xrpl-badge" style={{ background: "var(--success)", right: "0.5rem", top: "0.5rem" }}>✓ Verified</span>
                        )}
                      </div>
                      <div className="campaign-card-body">
                        <h3 className="campaign-card-title">{c.title}</h3>
                        <p className="campaign-card-desc">{c.description}</p>
                        <div className="campaign-card-progress">
                          <div
                            className="campaign-card-progress-bar"
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                        <div className="campaign-card-meta">
                          <span className="raised">
                            {XRP_FORMAT.format(c.totalRaisedXrp || 0)} XRP raised
                          </span>
                          <span>{deadline.toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {view === "detail" && selectedCampaign && (
          <div className="campaign-detail" style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 340px", gap: "2rem", alignItems: "start" }}>
            <div className="campaign-detail-main card">
              <button
                type="button"
                className="back-link"
                onClick={() => { setSelectedCampaign(null); setView("list"); }}
              >
                ← Back to campaigns
              </button>
              <div
                className="campaign-detail-hero"
                style={{
                  height: 200,
                  background: selectedCampaign.imageCid
                    ? `url(https://gateway.pinata.cloud/ipfs/${selectedCampaign.imageCid}) center/cover`
                    : "linear-gradient(135deg, #e6f7ef 0%, #bae6fd 100%)",
                  borderRadius: 12,
                  marginBottom: "1.5rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "3rem",
                }}
              >
                {!selectedCampaign.imageCid && "💧"}
              </div>
              <h1 className="campaign-detail-title">{selectedCampaign.title}</h1>
              <div className="campaign-meta-row">
                {selectedCampaign.location && <span className="campaign-location">{selectedCampaign.location}</span>}
                {selectedCampaign.category && <span className="badge">{selectedCampaign.category}</span>}
              </div>
              <p className="campaign-desc">{selectedCampaign.description}</p>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-label">Raised</div>
                  <div className="stat-value brand">
                    {XRP_FORMAT.format(selectedCampaign.totalRaisedXrp || 0)} XRP
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Goal</div>
                  <div className="stat-value">
                    {XRP_FORMAT.format(selectedCampaign.goalXrp || 0)} XRP
                  </div>
                </div>
                <div className="stat-card full-width">
                  <div className="stat-label">Progress</div>
                  <div className="progress-track">
                    <div
                      className="progress-bar"
                      style={{ width: `${Math.min(100, (selectedCampaign.totalRaisedXrp || 0) / (selectedCampaign.goalXrp || 1) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {(selectedCampaign.verificationStatus === "approved" || selectedCampaign.metadataCid) && (
                <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  {selectedCampaign.verificationStatus === "approved" && (
                    <span className="badge pill-success">✓ AI Verified</span>
                  )}
                  {selectedCampaign.verifiedNftTokenId ? (
                    <a
                      href={`${getXrplNetwork() === "devnet" ? "https://devnet.xrpl.org" : "https://test.bithomp.com"}/nft/${selectedCampaign.verifiedNftTokenId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="doc-link"
                    >
                      VerifiedCampaign NFT ↗
                    </a>
                  ) : selectedCampaign.verificationStatus === "approved" && isCreator && (
                    <button
                      type="button"
                      className="btn-outline-sm"
                      disabled={loading}
                      onClick={async () => {
                        setLoading(true);
                        setError("");
                        try {
                          const r = await fetch(`/api/xrpl/campaigns/${selectedCampaign.id}/mint-nft`, { method: "POST" });
                          const d = await r.json().catch(() => ({}));
                          if (!r.ok) throw new Error(d.error || "Mint failed");
                          setSuccessMsg("VerifiedCampaign NFT minted!");
                          const detail = await fetch(`/api/xrpl/campaigns/${selectedCampaign.id}`).then((res) => res.json());
                          setSelectedCampaign(detail);
                          fetchCampaigns();
                        } catch (err) {
                          setError(err?.message || "Mint failed");
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Mint verified NFT
                    </button>
                  )}
                  {selectedCampaign.metadataCid && (
                    <a
                      href={`https://gateway.pinata.cloud/ipfs/${selectedCampaign.metadataCid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="doc-link"
                    >
                      View metadata & fraud analysis ↗
                    </a>
                  )}
                </div>
              )}
              {(selectedCampaign.documentCids?.length > 0) && (
                <>
                  <div className="divider" />
                  <div className="card-title" style={{ marginBottom: "0.5rem" }}>Verification documents (IPFS)</div>
                  <div className="doc-links">
                    {selectedCampaign.documentCids.map((doc, i) => (
                      <a key={i} href={`https://gateway.pinata.cloud/ipfs/${doc.cid}`} target="_blank" rel="noreferrer" className="doc-link">
                        View {doc.filename || `Document ${i + 1}`} ↗
                      </a>
                    ))}
                  </div>
                </>
              )}

              {isDonor && !isCreator && (
                <>
                  <div className="divider" />
                  <div className="role-section">
                    <div className="role-badge donor">Donor</div>
                    <div className="card-title">Vote on milestones</div>
                    <p className="small-helper" style={{ marginBottom: "0.5rem" }}>As a donor, you can approve or reject the creator&apos;s proof for each milestone.</p>
                    <select
                      className="select"
                      value={selectedMilestone}
                      onChange={(e) => setSelectedMilestone(e.target.value)}
                      style={{ marginBottom: "0.5rem" }}
                    >
                      <option value="">Select milestone</option>
                      {(selectedCampaign.milestones || []).map((m) => (
                        <option key={m.id} value={m.id}>
                          #{m.id} — {m.description} ({m.amountXrp} XRP)
                        </option>
                      ))}
                    </select>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <button
                        type="button"
                        className="primary-button"
                        style={{
                          background: voteApprove ? "var(--brand)" : "transparent",
                          border: voteApprove ? "none" : "1px solid var(--border)",
                        }}
                        onClick={() => setVoteApprove(true)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        style={{
                          background: !voteApprove ? "#ef4444" : "transparent",
                          color: !voteApprove ? "white" : "inherit",
                          border: !voteApprove ? "none" : "1px solid var(--border)",
                        }}
                        onClick={() => setVoteApprove(false)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={handleVote}
                        disabled={loading || !selectedMilestone || !walletAddress}
                      >
                        Cast vote
                      </button>
                    </div>
                  </div>
                </>
              )}

              {isCreator && (
                <>
                  <div className="divider" />
                  <div className="role-section">
                    <div className="role-badge creator">Creator</div>
                    <div className="card-title" style={{ marginBottom: "0.5rem" }}>Submit proof</div>
              <input
                type="file"
                className="input"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                style={{ marginBottom: "0.5rem" }}
              />
              <button
                type="button"
                className="primary-button"
                onClick={handleSubmitProof}
                disabled={loading || !proofFile || !selectedMilestone}
              >
                Upload to IPFS & save
              </button>

              <div className="divider" style={{ marginTop: "1rem" }} />
              <div className="card-title" style={{ marginBottom: "0.5rem" }}>Identity verification (required before release)</div>
              {(selectedCampaign.identityVerification?.status === "verified" ? (
                <div>
                  <div className="badge pill-success" style={{ marginBottom: "0.5rem" }}>✓ Verified</div>
                  <div className="doc-links">
                    {selectedCampaign.identityVerification?.govIdCid && (
                      <a href={`https://gateway.pinata.cloud/ipfs/${selectedCampaign.identityVerification.govIdCid}`} target="_blank" rel="noreferrer" className="doc-link">View Gov ID ↗</a>
                    )}
                    {selectedCampaign.identityVerification?.selfieCid && (
                      <a href={`https://gateway.pinata.cloud/ipfs/${selectedCampaign.identityVerification.selfieCid}`} target="_blank" rel="noreferrer" className="doc-link">View Selfie ↗</a>
                    )}
                    {selectedCampaign.identityVerification?.bankDetailsCid && (
                      <a href={`https://gateway.pinata.cloud/ipfs/${selectedCampaign.identityVerification.bankDetailsCid}`} target="_blank" rel="noreferrer" className="doc-link">View Bank Details ↗</a>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="input-group">
                    <label className="input-label">Government ID</label>
                    <input type="file" accept="image/*,.pdf" className="input" onChange={(e) => setIdentityFiles((p) => ({ ...p, govId: e.target.files?.[0] }))} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Selfie</label>
                    <input type="file" accept="image/*" className="input" onChange={(e) => setIdentityFiles((p) => ({ ...p, selfie: e.target.files?.[0] }))} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Bank details (optional)</label>
                    <input type="file" accept="image/*,.pdf" className="input" onChange={(e) => setIdentityFiles((p) => ({ ...p, bank: e.target.files?.[0] }))} />
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={loading || !identityFiles.govId || !identityFiles.selfie}
                    onClick={async () => {
                      if (!identityFiles.govId || !identityFiles.selfie) return;
                      const jwt = process.env.NEXT_PUBLIC_PINATA_JWT || "";
                      if (!jwt) {
                        setError("Pinata JWT not configured. Add NEXT_PUBLIC_PINATA_JWT to .env.local");
                        return;
                      }
                      setLoading(true);
                      setError("");
                      try {
                        const pinFile = async (file, name) => {
                          const fd = new FormData();
                          fd.append("file", file, file.name || name);
                          const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
                            method: "POST",
                            headers: { Authorization: `Bearer ${jwt}` },
                            body: fd,
                          });
                          if (!r.ok) {
                            const err = await r.json().catch(() => ({}));
                            throw new Error(err.error || `Pinata upload failed: ${r.status}`);
                          }
                          const j = await r.json();
                          return j.IpfsHash;
                        };
                        const [govIdCid, selfieCid] = await Promise.all([
                          pinFile(identityFiles.govId, "gov-id"),
                          pinFile(identityFiles.selfie, "selfie"),
                        ]);
                        let bankDetailsCid = "";
                        if (identityFiles.bank) {
                          bankDetailsCid = await pinFile(identityFiles.bank, "bank-details");
                        }
                        const res = await fetch(`/api/xrpl/campaigns/${selectedCampaign.id}/identity`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ govIdCid, selfieCid, bankDetailsCid: bankDetailsCid || undefined }),
                        });
                        const idData = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(idData.error || `Identity save failed (${res.status})`);
                        setSuccessMsg("Identity submitted! Documents saved to IPFS.");
                        setError("");
                        setIdentityFiles({ govId: null, selfie: null, bank: null });
                        const d = await fetch(`/api/xrpl/campaigns/${selectedCampaign.id}`).then((r) => r.json());
                        setSelectedCampaign(d);
                        fetchCampaigns();
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      } catch (err) {
                        setError(err?.message || "Identity upload failed");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Submit identity
                  </button>
                </div>
              ))}

              <div className="divider" />
              <div className="card-title" style={{ marginBottom: "0.5rem" }}>Release funds</div>
              <button
                type="button"
                className="primary-button"
                onClick={handleRelease}
                disabled={loading || !selectedMilestone || selectedCampaign.identityVerification?.status !== "verified"}
              >
                Release milestone to creator
              </button>
              <div className="small-helper">
                Requires: identity verified, proof submitted, votes approve. Backend sends XRP from treasury.
              </div>
                  </div>
                </>
              )}

              {!isCreator && !isDonor && isWalletConnected && (
                <p className="muted" style={{ marginTop: "1rem" }}>
                  Donate to this campaign to become a donor and vote on milestone proofs.
                </p>
              )}

              <div className="divider" />
              <div className="card-title" style={{ marginBottom: "0.5rem" }}>Milestones</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Votes</th>
                    <th>Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedCampaign.milestones || []).map((m) => (
                    <tr key={m.id}>
                      <td>{m.id}</td>
                      <td>{m.description}</td>
                      <td>{XRP_FORMAT.format(m.amountXrp)} XRP</td>
                      <td>
                        <span className="pill pill-success">+{m.votesFor || 0}</span>{" "}
                        <span className="pill pill-danger">-{m.votesAgainst || 0}</span>
                      </td>
                      <td>
                        {m.proofCid ? (
                          <a
                            href={`https://gateway.pinata.cloud/ipfs/${m.proofCid}`}
                            target="_blank"
                            rel="noreferrer"
                            className="badge"
                          >
                            View
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="card-title" style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>Donors</div>
              {(!selectedCampaign.donors || selectedCampaign.donors.length === 0) && (
                <div className="muted">No donors yet.</div>
              )}
              {selectedCampaign.donors?.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCampaign.donors.map((d) => (
                      <tr key={d.address}>
                        <td>{shorten(d.address, 5)}</td>
                        <td>{XRP_FORMAT.format(d.amountXrp)} XRP</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <aside className="donate-sidebar card">
              <div className="donate-sidebar-title">Donate</div>
              {isCreator && (
                <p className="donate-creator-note">You&apos;re the creator. Share this page for others to donate.</p>
              )}
              <div className="donate-stat">
                <span className="donate-stat-value">{XRP_FORMAT.format(selectedCampaign.totalRaisedXrp || 0)} XRP</span>
                <span className="donate-stat-label">raised of {XRP_FORMAT.format(selectedCampaign.goalXrp || 0)} XRP</span>
              </div>
              {!isCreator && (
                <>
                  <div className="donate-mode-tabs">
                    {["xrp", "rlusd", "escrow"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`donate-mode-tab ${donateMode === m ? "active" : ""}`}
                        onClick={() => setDonateMode(m)}
                      >
                        {m === "xrp" ? "XRP" : m === "rlusd" ? "RLUSD" : "Escrow"}
                      </button>
                    ))}
                  </div>
                  {donateMode === "escrow" && (
                    <>
                      <p className="small-helper" style={{ marginBottom: "0.5rem", color: "var(--muted)" }}>
                        Escrow: Your XRP locks on-chain until the creator releases it after this milestone is approved (proof + votes + identity).
                      </p>
                      <select
                        className="select"
                        value={donateEscrowMilestone}
                        onChange={(e) => setDonateEscrowMilestone(e.target.value)}
                        style={{ width: "100%", marginBottom: "0.5rem" }}
                      >
                        <option value="">Which milestone does this support?</option>
                        {(selectedCampaign.milestones || []).map((m) => (
                          <option key={m.id} value={m.id}>
                            #{m.id} — {m.description} ({m.amountXrp} XRP)
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <input
                    className="donate-amount-input"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder={donateMode === "rlusd" ? "Amount (RLUSD)" : "Amount (XRP)"}
                    value={donateAmount}
                    onChange={(e) => setDonateAmount(e.target.value)}
                  />
                  <button
                    type="button"
                    className="donate-button"
                    onClick={handleDonate}
                    disabled={
                      loading ||
                      !walletAddress ||
                      !donateAmount ||
                      (donateMode !== "escrow" && !getTreasuryAddress()) ||
                      (donateMode === "escrow" && !donateEscrowMilestone)
                    }
                    title={
                      donateMode === "escrow"
                        ? "Escrow: funds lock until creator releases after milestone approval"
                        : !getTreasuryAddress()
                        ? "Set NEXT_PUBLIC_XRPL_TREASURY_ADDRESS"
                        : ""
                    }
                  >
                    {loading ? "Processing…" : "Donate now"}
                  </button>
                  {!walletAddress && (
                    <p className="donate-hint">Connect GemWallet above to donate</p>
                  )}
                </>
              )}
              {txHash && (
                <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="donate-tx-link">
                  View transaction ↗
                </a>
              )}
            </aside>
          </div>
        )}

        {view === "transparency" && (
          <div className="card" style={{ maxWidth: 800 }}>
            <h2 className="section-title">Transparency dashboard</h2>

            <div className="blockchain-proof">
              <div className="blockchain-proof-header">
                <span className="blockchain-badge">🔗 Blockchain verified</span>
                <span className="blockchain-network">{getXrplNetwork() === "devnet" ? "XRPL Devnet" : "XRPL Testnet"}</span>
              </div>
              <p className="blockchain-proof-desc">All donations and releases are recorded on the XRP Ledger. Every transaction can be verified on-chain.</p>
              <div className="blockchain-proof-links">
                <a href={explorerBaseUrl()} target="_blank" rel="noreferrer" className="blockchain-link">
                  Open XRPL Explorer →
                </a>
                {getTreasuryAddress() && (
                  <a href={`${explorerBaseUrl()}/accounts/${getTreasuryAddress()}`} target="_blank" rel="noreferrer" className="blockchain-link">
                    View treasury address
                  </a>
                )}
              </div>
            </div>

            <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
              <div className="stat-card">
                <div className="stat-label">Total campaigns</div>
                <div className="stat-value">{campaigns.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total raised (XRP)</div>
                <div className="stat-value">
                  {XRP_FORMAT.format(campaigns.reduce((s, c) => s + (c.totalRaisedXrp || 0), 0))}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Verified campaigns</div>
                <div className="stat-value">
                  {campaigns.filter((c) => c.verificationStatus === "approved").length}
                </div>
              </div>
            </div>
            <div className="card-title" style={{ marginBottom: "0.5rem" }}>Campaign fraud status</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Fraud score</th>
                  <th>Raised</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td><span className={`badge ${c.verificationStatus === "approved" ? "pill-success" : "pill-warning"}`}>{c.verificationStatus || "pending"}</span></td>
                    <td>{(c.fraudProbability ?? 0) * 100}%</td>
                    <td>{XRP_FORMAT.format(c.totalRaisedXrp || 0)} XRP</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-title" style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>On-chain transactions</div>
            <p className="muted" style={{ marginBottom: "0.75rem" }}>Every donation is recorded on the XRP Ledger.</p>
            <Link href="/transaction-history" className="primary-button">
              View full transaction history →
            </Link>
          </div>
        )}

        {view === "create" && (
          <form className="card" onSubmit={handleCreateCampaign} style={{ maxWidth: 600 }}>
            <h2 className="section-title">Create campaign</h2>
            <div className="input-group">
              <label className="input-label">Campaign image</label>
              <input
                type="file"
                accept="image/*"
                className="input"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Title</label>
              <input
                className="input"
                value={createForm.title}
                onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Description</label>
              <textarea
                className="textarea"
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                required
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="input-group">
                <label className="input-label">Location</label>
                <input
                  className="input"
                  placeholder="e.g. New York, USA"
                  value={createForm.location}
                  onChange={(e) => setCreateForm((p) => ({ ...p, location: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Category</label>
                <select
                  className="input"
                  value={createForm.category}
                  onChange={(e) => setCreateForm((p) => ({ ...p, category: e.target.value }))}
                >
                  <option value="medical">Medical</option>
                  <option value="education">Education</option>
                  <option value="disaster">Disaster</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Goal (XRP)</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.1"
                value={createForm.goalXrp}
                onChange={(e) => setCreateForm((p) => ({ ...p, goalXrp: e.target.value }))}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Deadline</label>
              <input
                className="input"
                type="datetime-local"
                value={createForm.deadline}
                onChange={(e) => setCreateForm((p) => ({ ...p, deadline: e.target.value }))}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Proof documents (for AI fraud check)</label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                className="input"
                onChange={(e) => setCreateDocFiles(Array.from(e.target.files || []))}
              />
              <button type="button" className="primary-button" onClick={handleVerifyWithAI} disabled={verifying} style={{ marginTop: "0.5rem" }}>
                {verifying ? "Verifying…" : "Verify with AI (Gemini)"}
              </button>
              {verificationResult && (
                <div className="verification-result" style={{ marginTop: "0.5rem", padding: "0.75rem", background: "#f8fafc", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <strong>Fraud score:</strong>
                    <span>{Math.round((verificationResult.fraud_score_0_100 ?? verificationResult.fraud_score * 100) || 0)}/100</span>
                  </div>
                  <div style={{ marginBottom: "0.25rem" }}>
                    {verificationResult.flagged ? (
                      <span className="badge pill-danger">⚠ Flagged (high risk)</span>
                    ) : (verificationResult.fraud_score_0_100 ?? verificationResult.fraud_score * 100) >= 30 ? (
                      <span className="badge pill-warning">⚠ Caution (moderate risk)</span>
                    ) : (
                      <span className="badge pill-success">✓ Low risk</span>
                    )}
                  </div>
                  <div className="small-helper" style={{ marginTop: "0.5rem" }}>
                    {verificationResult.source === "unavailable"
                      ? "AI backend not running — no real analysis. Run: npm run backend"
                      : verificationResult.source === "gemini"
                        ? "Analyzed by Gemini AI"
                        : "Analyzed with demo/mock models (set GEMINI_API_KEY for real AI)"}
                  </div>
                  {costValidation?.flag_for_review && <div style={{ marginTop: "0.5rem" }} className="badge pill-warning">⚠ Cost flagged for review</div>}
                </div>
              )}
            </div>
            <div className="input-group">
              <label className="input-label">Your XRPL address (for escrow / payouts)</label>
              <input
                className="input"
                placeholder={walletAddress ? shorten(walletAddress) : "r... or connect GemWallet"}
                value={createForm.creatorXrplAddress || walletAddress || ""}
                onChange={(e) => setCreateForm((p) => ({ ...p, creatorXrplAddress: e.target.value }))}
              />
              {walletAddress && !createForm.creatorXrplAddress && (
                <p className="small-helper">Using your connected wallet address</p>
              )}
            </div>
            <div className="card-title" style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>Milestones</div>
            {createForm.milestones.map((m, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem", marginBottom: "0.5rem" }}>
                <input
                  className="input"
                  placeholder="Description"
                  value={m.description}
                  onChange={(e) => updateMilestone(i, "description", e.target.value)}
                  style={{ marginBottom: "0.5rem" }}
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="XRP"
                  value={m.amountXrp}
                  onChange={(e) => updateMilestone(i, "amountXrp", e.target.value)}
                />
              </div>
            ))}
            <button type="button" className="primary-button" onClick={addMilestoneField} style={{ marginBottom: "1rem" }}>
              Add milestone
            </button>
            <button type="submit" className="primary-button" disabled={loading}>
              Create (pins to Pinata)
            </button>
          </form>
        )}
      </main>

      <footer className="footer">
        <span>ProofFund — XRPL • Pinata • Gemini. All transactions on-chain.</span>
      </footer>
    </div>
  );
}
