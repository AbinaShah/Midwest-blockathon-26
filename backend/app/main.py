"""
ProofFund - Backend API: fraud detection, document verification, cost validation.
"""
import os
import tempfile
import shutil
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .document_requirements import get_required_documents, validate_document_types, CAMPAIGN_TYPES
from .fraud_detection import compute_fraud_score, FRAUD_THRESHOLD
from .cost_validation import scrape_estimated_costs, llm_validate_cost

load_dotenv()

app = FastAPI(
    title="ProofFund API",
    description="Fraud detection, document verification, and cost validation for decentralized crowdfunding",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local dev (localhost, 127.0.0.1, LAN IPs)
    allow_credentials=False,  # Must be False when allow_origins is "*"
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ProofFund"}


@app.get("/campaign-types")
def campaign_types():
    return {"campaign_types": CAMPAIGN_TYPES}


@app.get("/required-documents/{campaign_type}")
def required_docs(campaign_type: str):
    return {"campaign_type": campaign_type, "required_documents": get_required_documents(campaign_type)}


@app.post("/verify-documents")
async def verify_documents(
    campaign_type: str = Form("other"),
    document_labels: Optional[str] = Form(None),  # JSON array of labels per file
    files: Optional[list[UploadFile]] = File(default=None),
):
    """
    Upload documents for fraud detection. Runs multi-model pipeline + mock Reality Defender / SiteEngine.
    Returns fraud_score (0-1), flagged (bool), and fraud_score_0_100 for on-chain storage.
    Files are optional; without files, returns fraud_score 0 and runs document-type validation only.
    """
    file_list = files or []
    labels = []
    if document_labels:
        import json
        try:
            labels = json.loads(document_labels)
        except Exception:
            pass
    ok, missing = validate_document_types(campaign_type, labels)
    tmp_dir = Path(tempfile.mkdtemp())
    paths = []
    try:
        for i, uf in enumerate(file_list):
            path = tmp_dir / (uf.filename or f"file_{i}")
            path.write_bytes(await uf.read())
            paths.append(path)
        result = compute_fraud_score(paths)
        result["document_types_ok"] = ok
        result["missing_document_types"] = missing
        return result
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/validate-cost")
async def validate_cost(
    description: str = Form(...),
    location: str = Form(...),
    requested_amount: float = Form(...),
    campaign_type: str = Form("other"),
):
    """
    Scrape estimated costs (stub) and run LLM validation. Returns estimated_real_cost, reasoning, confidence, flag_for_review.
    """
    estimates = scrape_estimated_costs(location, campaign_type)
    out = llm_validate_cost(
        description=description,
        location=location,
        requested_amount=requested_amount,
        campaign_type=campaign_type,
        estimated_low=estimates["estimated_low"],
        estimated_high=estimates["estimated_high"],
    )
    out["price_estimates"] = estimates
    return out


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
