import { useEffect, useState } from "react";
import Link from "next/link";
import { explorerTxUrl, explorerBaseUrl, getTreasuryAddress, getXrplNetwork } from "../lib/xrpl";

const XRP_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
});

function shorten(addr, chars = 4) {
  if (!addr) return "";
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export default function TransactionHistoryPage() {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    fetch("/api/xrpl/campaigns")
      .then((r) => r.json())
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => setCampaigns([]));
  }, []);

  const transactions = campaigns.flatMap((c) =>
    (c.donors || []).map((d) => ({ ...d, campaign: c.title }))
  );

  return (
    <div className="app-shell">
      <header className="navbar">
        <Link href="/" className="navbar-logo" style={{ textDecoration: "none", color: "inherit" }}>
          ProofFund
        </Link>
        <nav className="navbar-nav">
          <Link href="/" className="nav-link">
            Explore
          </Link>
          <Link href="/" className="nav-link" onClick={() => {}}>
            Create campaign
          </Link>
          <Link href="/" className="nav-link">
            Transparency
          </Link>
        </nav>
      </header>

      <main className="app-main">
        <div className="card" style={{ maxWidth: 900 }}>
          <Link href="/" className="back-link" style={{ marginBottom: "1rem", display: "inline-block" }}>
            ← Back
          </Link>
          <h1 className="section-title">Transaction history</h1>
          <p className="muted" style={{ marginBottom: "1.5rem" }}>
            Every donation is a verified transaction on the XRP Ledger. Click &quot;View on XRPL&quot; to see proof on the blockchain.
          </p>

          <div className="blockchain-proof" style={{ marginBottom: "1.5rem" }}>
            <div className="blockchain-proof-header">
              <span className="blockchain-badge">🔗 {getXrplNetwork() === "devnet" ? "XRPL Devnet" : "XRPL Testnet"}</span>
            </div>
            <div className="blockchain-proof-links" style={{ marginTop: "0.5rem" }}>
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

          {transactions.length === 0 ? (
            <p className="muted">No on-chain transactions yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Donor</th>
                  <th>Amount</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((d, i) => (
                  <tr key={i}>
                    <td>{d.campaign}</td>
                    <td>{shorten(d.address, 5)}</td>
                    <td>{XRP_FORMAT.format(d.amountXrp)} XRP</td>
                    <td>
                      {d.txHash ? (
                        <a href={explorerTxUrl(d.txHash)} target="_blank" rel="noreferrer" className="blockchain-tx-link">
                          View on XRPL ↗
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
