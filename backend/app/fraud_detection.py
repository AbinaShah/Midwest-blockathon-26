"""
Multi-model fraud scoring + document authenticity.
Uses Gemini for real AI analysis when GEMINI_API_KEY is set; falls back to mock/sklearn demo.
"""
import os
import hashlib
import re
from typing import Optional

import numpy as np
from pathlib import Path

# Optional: Gemini for real fraud detection
try:
    import google.generativeai as genai
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

# Optional: sklearn models (trained on synthetic features for demo)
try:
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

# Fraud threshold: above this, flag for additional verification
FRAUD_THRESHOLD = 0.5

# MIME types Gemini supports for document analysis
GEMINI_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
GEMINI_DOC_TYPES = {"application/pdf"} | GEMINI_IMAGE_TYPES


def _file_features(file_path: Path, file_size: int, content_hash: str) -> np.ndarray:
    """Build a simple feature vector from file metadata (demo)."""
    # In production: image hashes, EXIF, document parsing, etc.
    size_norm = min(file_size / (1024 * 1024), 10.0)  # cap at 10
    hash_int = int(content_hash[:8], 16) % 10000 / 10000.0
    return np.array([[size_norm, hash_int, len(content_hash) % 100 / 100.0]])


def _mock_reality_defender(file_path: Path) -> float:
    """Mock Reality Defender API: returns fake probability of manipulation (0-1)."""
    # With real API: POST to Reality Defender, get score
    # For demo: deterministic from path + size
    size = file_path.stat().st_size if file_path.exists() else 0
    seed = hashlib.sha256(str(file_path).encode()).hexdigest()
    return (int(seed[:8], 16) % 100) / 100.0


def _mock_siteengine(file_path: Path) -> float:
    """Mock SiteEngine document verification: returns fake forgery probability (0-1)."""
    seed = hashlib.sha256(str(file_path).encode()).hexdigest()
    return (int(seed[8:16], 16) % 100) / 100.0


def _sklearn_fraud_score(features: np.ndarray) -> float:
    """Multi-model pipeline: RF, LR, GB average."""
    if not HAS_SKLEARN:
        return 0.3  # default low risk
    # Demo: random-ish but deterministic from features
    rng = np.random.default_rng(int(features[0, 0] * 1000 + features[0, 1] * 10000))
    m1 = rng.random()
    m2 = rng.random()
    m3 = rng.random()
    return float((m1 + m2 + m3) / 3.0)


def _mime_for_path(fp: Path) -> str:
    """Guess MIME type from file extension."""
    ext = fp.suffix.lower()
    mimes = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
             ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf"}
    return mimes.get(ext, "application/octet-stream")


def _gemini_fraud_analyze(file_paths: list) -> Optional[list]:
    """
    Use Gemini to analyze documents for fraud indicators.
    Returns list of {file, fraud_score, details} or None if unavailable.
    """
    if not HAS_GEMINI or not os.getenv("GEMINI_API_KEY") or not file_paths:
        return None

    try:
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        model = genai.GenerativeModel("gemini-1.5-flash")

        results = []
        for fp in file_paths:
            if not fp.exists():
                continue
            mime = _mime_for_path(fp)
            if mime not in GEMINI_DOC_TYPES:
                continue

            content = fp.read_bytes()
            prompt = """Analyze this document for potential fraud indicators in a crowdfunding context.
Consider: signs of manipulation, forgery, inconsistent metadata, suspicious patterns, stock/ generic images.
Respond with exactly two lines:
FRAUD_SCORE: <number 0.0 to 1.0, where 0=likely legitimate, 1=likely fraudulent>
REASONING: <one short sentence>"""

            try:
                # Build part: PIL Image for images, protos.Part for PDF/other
                if mime.startswith("image/"):
                    from PIL import Image
                    from io import BytesIO
                    img = Image.open(BytesIO(content)).convert("RGB")
                    parts = [prompt, img]
                else:
                    part = genai.protos.Part(
                        inline_data=genai.protos.Blob(mime_type=mime, data=content)
                    )
                    parts = [prompt, part]

                resp = model.generate_content(
                    parts,
                    generation_config=genai.types.GenerationConfig(max_output_tokens=150),
                )
                text = resp.text or ""

                score = 0.3
                reasoning = "No response"
                for line in text.split("\n"):
                    if "FRAUD_SCORE:" in line:
                        m = re.search(r"0?\.\d+", line)
                        if m:
                            score = min(1.0, max(0.0, float(m.group())))
                    elif "REASONING:" in line:
                        reasoning = line.replace("REASONING:", "").strip()

                results.append({
                    "file": str(fp.name),
                    "fraud_score": score,
                    "reasoning": reasoning,
                    "source": "gemini",
                })
            except Exception:
                pass

        return results if results else None
    except Exception:
        return None


def compute_fraud_score(
    file_paths: list[Path],
    use_reality_defender: bool = True,
    use_siteengine: bool = True,
) -> dict:
    """
    Returns:
        fraud_score: 0-1 average across APIs + models
        flagged: True if fraud_score > FRAUD_THRESHOLD
        details: per-file and per-model breakdown
    Uses Gemini when GEMINI_API_KEY is set and documents are images/PDF.
    """
    file_paths = file_paths or []
    scores_per_file = []
    details = []
    used_gemini = False

    # Try Gemini first (real AI fraud detection)
    gemini_results = _gemini_fraud_analyze(file_paths)
    if gemini_results:
        used_gemini = True
        for r in gemini_results:
            score = r["fraud_score"]
            scores_per_file.append(score)
            details.append({
                "file": r["file"],
                "gemini_score": score,
                "reasoning": r.get("reasoning", ""),
                "source": "gemini",
            })

    # For files not analyzed by Gemini, or if Gemini unavailable: use mock/sklearn
    analyzed_files = {d["file"] for d in details}
    for fp in file_paths:
        if not fp.exists() or str(fp.name) in analyzed_files:
            continue
        content = fp.read_bytes()
        file_size = len(content)
        content_hash = hashlib.sha256(content).hexdigest()
        features = _file_features(fp, file_size, content_hash)

        rd = _mock_reality_defender(fp) if use_reality_defender else 0.0
        se = _mock_siteengine(fp) if use_siteengine else 0.0
        ml = _sklearn_fraud_score(features)

        avg_file = (rd + se + ml) / 3.0
        scores_per_file.append(avg_file)
        details.append({
            "file": str(fp.name),
            "reality_defender": rd,
            "siteengine": se,
            "ml_pipeline": ml,
            "average": avg_file,
        })

    if not scores_per_file:
        fraud_score = 0.0
    else:
        fraud_score = float(np.mean(scores_per_file))

    out = {
        "fraud_score": round(fraud_score, 4),
        "flagged": fraud_score > FRAUD_THRESHOLD,
        "threshold": FRAUD_THRESHOLD,
        "details": details,
        "fraud_score_0_100": round(fraud_score * 100),
    }
    if used_gemini:
        out["source"] = "gemini"
    return out
