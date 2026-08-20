"""Backend configuration loaded from environment variables."""

import os
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent

# Load backend/.env without overriding variables provided by the environment.
load_dotenv(BACKEND_DIR / ".env")

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "").strip()
GEMINI_GENERATION_MODEL = "gemini-3.6-flash"
GEMINI_EMBEDDING_MODEL = "gemini-embedding-2"

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_EXTRACTED_CHARACTERS = 2_000_000
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
RETRIEVAL_COUNT = 4
SIMPLIFIER_RETRIEVAL_COUNT = 12
RISK_ANALYZER_RETRIEVAL_COUNT = 16

# Comparison limits keep matching and the final Gemini prompt manageable.
COMPARISON_MATCH_COUNT = 3
COMPARISON_MAX_ITEMS = 30
COMPARISON_MAX_DISTANCE = 0.85
COMPARISON_MUTUAL_MAX_DISTANCE = 1.10
COMPARISON_MIN_TEXT_SIMILARITY = 0.45
COMPARISON_UNCHANGED_ITEMS = 3
MAX_CHAT_HISTORY_MESSAGES = 12

DEFAULT_FRONTEND_ORIGINS = (
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
)


def get_frontend_origins() -> list[str]:
    """Return the explicitly allowed browser origins for the frontend."""
    configured_origins = os.getenv("FRONTEND_ORIGINS", "")
    if not configured_origins.strip():
        return list(DEFAULT_FRONTEND_ORIGINS)

    return [
        origin.strip().rstrip("/")
        for origin in configured_origins.split(",")
        if origin.strip()
    ]

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./legalsimple.db",
)

# JWT Authentication
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24