"""
Web scraper stub for price estimates + LLM validation of requested amount.
Supports Gemini (preferred) or OpenAI for location-aware cost validation.
"""
import os
import re
from typing import Optional

# Optional scraper
try:
    from bs4 import BeautifulSoup
    import httpx
    HAS_SCRAPER = True
except ImportError:
    HAS_SCRAPER = False

# Optional OpenAI
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

# Optional Gemini (Google) - preferred for cost validation
try:
    import google.generativeai as genai
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False


def scrape_estimated_costs(location: str, campaign_type: str) -> dict:
    """
    Scrape cost estimates by campaign type. Uses public health/tuition references.
    Falls back to mock if scraper unavailable or request fails.
    """
    base = _mock_estimates(location, campaign_type)
    if not HAS_SCRAPER:
        return base

    try:
        ct = (campaign_type or "other").lower()
        # Location-aware ranges (expand with real scraper in production)
        if ct == "medical":
            base["estimated_low"] = 3000
            base["estimated_high"] = 75000
        elif ct == "education":
            base["estimated_low"] = 10000
            base["estimated_high"] = 60000
        elif ct == "disaster":
            base["estimated_low"] = 2000
            base["estimated_high"] = 25000
        base["source"] = "estimated"
    except Exception:
        pass
    return base


def _mock_estimates(location: str, campaign_type: str) -> dict:
    """Placeholder cost ranges by type (demo)."""
    base = {
        "medical": {"low": 5000, "high": 50000, "currency": "USD"},
        "disaster": {"low": 2000, "high": 20000, "currency": "USD"},
        "education": {"low": 10000, "high": 80000, "currency": "USD"},
        "other": {"low": 1000, "high": 100000, "currency": "USD"},
    }
    ct = campaign_type.lower() if campaign_type else "other"
    return {
        "estimated_low": base.get(ct, base["other"])["low"],
        "estimated_high": base.get(ct, base["other"])["high"],
        "currency": base.get(ct, base["other"])["currency"],
        "location": location,
        "campaign_type": ct,
    }


def _parse_llm_response(text: str, requested_amount: float) -> dict:
    """Parse structured LLM output into validation dict."""
    estimated = requested_amount * 0.8
    reasoning = "LLM analysis."
    confidence = 0.7
    flag = "no"
    for line in text.split("\n"):
        if "ESTIMATED_REAL_COST:" in line:
            try:
                estimated = float(re.search(r"[\d.]+", line).group())
            except Exception:
                pass
        if "REASONING:" in line:
            reasoning = line.replace("REASONING:", "").strip()
        if "CONFIDENCE:" in line:
            try:
                confidence = float(re.search(r"0?\.\d+", line).group())
            except Exception:
                pass
        if "FLAG_FOR_REVIEW:" in line:
            flag = "yes" if "yes" in line.lower() else "no"
    return {
        "estimated_real_cost": estimated,
        "reasoning": reasoning,
        "confidence_score": round(confidence, 2),
        "flag_for_review": flag.lower() == "yes",
    }


def llm_validate_cost(
    description: str,
    location: str,
    requested_amount: float,
    campaign_type: str,
    estimated_low: float,
    estimated_high: float,
) -> dict:
    """
    Use LLM to assess if requested amount is realistic for the given location.
    Tries Gemini first, then OpenAI, then mock.
    Returns: estimated_real_cost, reasoning, confidence_score, flag_for_review.
    """
    prompt = f"""You are a fraud prevention analyst. Evaluate this crowdfunding campaign.

Campaign type: {campaign_type}
Location: {location}
Description: {description}
Requested amount (USD): {requested_amount}
Reasonable range for this type/location (USD): {estimated_low} - {estimated_high}

Consider typical costs in this location. Respond in this exact format:
ESTIMATED_REAL_COST: <number in USD>
REASONING: <short explanation considering location>
CONFIDENCE: <0-1>
FLAG_FOR_REVIEW: <yes or no, if requested amount is much higher than reasonable for this location>
"""

    # Try Gemini first
    if HAS_GEMINI and os.getenv("GEMINI_API_KEY"):
        try:
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel("gemini-1.5-flash")
            resp = model.generate_content(prompt, generation_config=genai.types.GenerationConfig(max_output_tokens=300))
            text = resp.text or ""
            if text:
                return {**_parse_llm_response(text, requested_amount), "source": "gemini"}
        except Exception as e:
            pass  # Fall through to OpenAI or mock

    # Fallback: OpenAI
    if HAS_OPENAI and os.getenv("OPENAI_API_KEY"):
        try:
            client = OpenAI()
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300,
            )
            text = resp.choices[0].message.content or ""
            if text:
                return {**_parse_llm_response(text, requested_amount), "source": "openai"}
        except Exception:
            pass

    return _mock_llm_validation(
        description, location, requested_amount,
        estimated_low, estimated_high
    )


def _mock_llm_validation(
    description: str,
    location: str,
    requested_amount: float,
    estimated_low: float,
    estimated_high: float,
) -> dict:
    flag = requested_amount > estimated_high * 1.5
    return {
        "estimated_real_cost": (estimated_low + estimated_high) / 2,
        "reasoning": "Demo mode: no LLM. Set GEMINI_API_KEY or OPENAI_API_KEY for AI cost validation.",
        "confidence_score": 0.6,
        "flag_for_review": flag,
    }
