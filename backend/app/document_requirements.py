"""
Document requirements by campaign type for fraud reduction.
"""
CAMPAIGN_TYPES = ["medical", "disaster", "education", "other"]

REQUIRED_DOCUMENTS = {
    "medical": [
        "hospital_bill",
        "doctor_certificate",
    ],
    "disaster": [
        "insurance_claim",
        "police_report",
    ],
    "education": [
        "admission_letter",
        "tuition_invoice",
    ],
    "other": [],
}


def get_required_documents(campaign_type: str) -> list[str]:
    return REQUIRED_DOCUMENTS.get(campaign_type.lower(), REQUIRED_DOCUMENTS["other"])


def validate_document_types(campaign_type: str, uploaded_labels: list[str]) -> tuple[bool, list[str]]:
    """Check if uploaded docs satisfy required types. Returns (ok, missing_list)."""
    required = set(get_required_documents(campaign_type))
    uploaded = set(uploaded_labels or [])
    missing = list(required - uploaded)
    return (len(missing) == 0, missing)
