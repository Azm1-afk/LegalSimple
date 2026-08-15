"""FastAPI entry point for LegalSimple."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.rag.router import document_simplifier_router, router as companion_router


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
app.include_router(companion_router)
app.include_router(document_simplifier_router)


@app.get("/api/health", tags=["Health"])
def health_check() -> dict[str, str]:
    """Confirm that the FastAPI process is running."""
    return {"status": "ok"}


# Serving the existing static frontend here avoids CORS during the simplest local setup.
app.mount(
    "/",
    StaticFiles(directory=config.PROJECT_DIR / "frontend", html=True),
    name="frontend",
)
