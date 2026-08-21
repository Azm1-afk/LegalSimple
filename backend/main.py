"""FastAPI entry point for LegalSimple."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.database import Base, engine
from backend import models  # noqa: F401
from backend.auth import router as auth_router
from backend.rag.router import (
    document_comparison_router,
    document_simplifier_router,
    risk_analyzer_router,
    router as companion_router,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title="LegalSimple API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get_frontend_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

Base.metadata.create_all(bind=engine)

app.include_router(companion_router)
app.include_router(document_simplifier_router)
app.include_router(risk_analyzer_router)
app.include_router(document_comparison_router)
app.include_router(auth_router)


@app.get("/api/health", tags=["Health"])
def health_check() -> dict[str, str]:
    """Confirm that the FastAPI process is running."""
    return {"status": "ok"}


@app.get("/api/auth/google-client-id", tags=["Auth"])
def google_client_id() -> dict[str, str]:
    """Expose the public Google OAuth client ID to the frontend."""
    return {"client_id": config.GOOGLE_OAUTH_CLIENT_ID}


# Serving the existing static frontend here avoids CORS during the simplest local setup.
app.mount(
    "/",
    StaticFiles(directory=config.PROJECT_DIR / "frontend", html=True),
    name="frontend",
)