"""FastAPI routes for Legal AI Companion chat and document handling."""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from backend import config
from backend.rag.schemas import (
    CompanionChatRequest,
    CompanionChatResponse,
    DocumentDeleteResponse,
    DocumentUploadResponse,
)
from backend.rag.service import (
    DocumentProcessingError,
    GeminiRequestError,
    RAGConfigurationError,
    RAGService,
    UnknownDocumentError,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/companion", tags=["Legal AI Companion"])
rag_service = RAGService()


@router.post(
    "/documents",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(file: UploadFile = File(...)) -> DocumentUploadResponse:
    """Parse an uploaded document and create its in-memory FAISS index."""
    filename = file.filename or ""
    try:
        file_bytes = await file.read(config.MAX_UPLOAD_BYTES + 1)
    except Exception as error:
        logger.exception("Could not read an uploaded document")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded document could not be read.",
        ) from error
    finally:
        await file.close()

    if len(file_bytes) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The selected document is larger than 10 MB.",
        )

    try:
        return await run_in_threadpool(rag_service.process_document, filename, file_bytes)
    except DocumentProcessingError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
        ) from error
    except RAGConfigurationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error
    except GeminiRequestError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error


@router.delete(
    "/documents/{document_id}",
    response_model=DocumentDeleteResponse,
)
async def delete_document(document_id: str) -> DocumentDeleteResponse:
    """Remove an attachment's in-memory FAISS index when the browser detaches it."""
    try:
        await run_in_threadpool(rag_service.remove_document, document_id)
    except UnknownDocumentError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(error)
        ) from error
    return DocumentDeleteResponse(status="removed", document_id=document_id)


@router.post(
    "/chat",
    response_model=CompanionChatResponse,
    response_model_exclude_none=True,
)
async def chat(request: CompanionChatRequest) -> CompanionChatResponse:
    """Answer a general question or run document-grounded conversational RAG."""
    try:
        answer, sources = await run_in_threadpool(
            rag_service.chat,
            request.message,
            request.document_id,
            request.chat_history,
        )
    except UnknownDocumentError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(error)
        ) from error
    except RAGConfigurationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error
    except GeminiRequestError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error

    return CompanionChatResponse(answer=answer, sources=sources)
