"""FastAPI routes that use LegalSimple's shared document RAG service."""

import logging
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from backend import config
from backend.rag.schemas import (
    CompanionChatRequest,
    CompanionChatResponse,
    DocumentComparisonResponse,
    DocumentDeleteResponse,
    DocumentSimplifierResponse,
    DocumentUploadResponse,
    RiskAnalyzerResponse,
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
document_simplifier_router = APIRouter(
    prefix="/api", tags=["Document Simplifier"]
)
risk_analyzer_router = APIRouter(prefix="/api", tags=["Risk Analyzer"])
document_comparison_router = APIRouter(prefix="/api", tags=["Document Comparison"])
rag_service = RAGService()


async def _read_uploaded_file(file: UploadFile) -> tuple[str, bytes]:
    """Read one size-limited upload and always close its temporary file."""
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
    return filename, file_bytes


@router.post(
    "/documents",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(file: UploadFile = File(...)) -> DocumentUploadResponse:
    """Parse an uploaded document and create its in-memory FAISS index."""
    filename, file_bytes = await _read_uploaded_file(file)

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


@document_simplifier_router.post(
    "/document-simplifier",
    response_model=DocumentSimplifierResponse,
)
async def simplify_document(
    file: UploadFile = File(...),
) -> DocumentSimplifierResponse:
    """Index one PDF, retrieve important content, and simplify it with Gemini."""
    filename, file_bytes = await _read_uploaded_file(file)
    if Path(filename).suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a PDF document.",
        )

    indexed_document: DocumentUploadResponse | None = None
    try:
        indexed_document = await run_in_threadpool(
            rag_service.process_document, filename, file_bytes
        )
        simplification, sources = await run_in_threadpool(
            rag_service.simplify_document, indexed_document.document_id
        )
        return DocumentSimplifierResponse(
            filename=indexed_document.filename,
            simplification=simplification,
            chunks=indexed_document.chunks,
            sources=sources,
        )
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
    finally:
        if indexed_document is not None:
            try:
                await run_in_threadpool(
                    rag_service.remove_document, indexed_document.document_id
                )
            except UnknownDocumentError:
                logger.warning(
                    "Simplifier document %s was already removed",
                    indexed_document.document_id,
                )


@risk_analyzer_router.post(
    "/risk-analyzer",
    response_model=RiskAnalyzerResponse,
)
async def analyze_document_risk(
    file: UploadFile = File(...),
) -> RiskAnalyzerResponse:
    """Index one PDF, retrieve risk-related content, and classify it with Gemini."""
    filename, file_bytes = await _read_uploaded_file(file)
    if Path(filename).suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a PDF document.",
        )

    indexed_document: DocumentUploadResponse | None = None
    try:
        indexed_document = await run_in_threadpool(
            rag_service.process_document, filename, file_bytes
        )
        analysis, sources = await run_in_threadpool(
            rag_service.analyze_document_risk, indexed_document.document_id
        )
        return RiskAnalyzerResponse(
            filename=indexed_document.filename,
            risk_level=analysis.risk_level,
            explanation=analysis.explanation,
            chunks=indexed_document.chunks,
            sources=sources,
        )
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
    finally:
        if indexed_document is not None:
            try:
                await run_in_threadpool(
                    rag_service.remove_document, indexed_document.document_id
                )
            except UnknownDocumentError:
                logger.warning(
                    "Risk Analyzer document %s was already removed",
                    indexed_document.document_id,
                )


@document_comparison_router.post(
    "/document-comparison",
    response_model=DocumentComparisonResponse,
    response_model_exclude_none=True,
)
async def compare_documents(
    original_file: UploadFile = File(...),
    revised_file: UploadFile = File(...),
) -> DocumentComparisonResponse:
    """Index two PDFs, cross-match their chunks, and explain supported changes."""
    original_filename, original_bytes = await _read_uploaded_file(original_file)
    revised_filename, revised_bytes = await _read_uploaded_file(revised_file)

    if Path(original_filename).suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document A must be a PDF document.",
        )
    if Path(revised_filename).suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document B must be a PDF document.",
        )
    if original_bytes == revised_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose two different PDF documents to compare.",
        )

    indexed_documents: list[DocumentUploadResponse] = []
    try:
        # Each PDF gets its own temporary FAISS index so A and B stay identifiable.
        indexed_original = await run_in_threadpool(
            rag_service.process_document,
            original_filename,
            original_bytes,
            "A",
        )
        indexed_documents.append(indexed_original)
        indexed_revised = await run_in_threadpool(
            rag_service.process_document,
            revised_filename,
            revised_bytes,
            "B",
        )
        indexed_documents.append(indexed_revised)

        (
            overall_summary,
            summary,
            comparison_items,
            coverage_note,
            disclaimer,
        ) = await run_in_threadpool(
            rag_service.compare_documents,
            indexed_original.document_id,
            indexed_revised.document_id,
        )
        return DocumentComparisonResponse(
            original_filename=indexed_original.filename,
            revised_filename=indexed_revised.filename,
            original_chunks=indexed_original.chunks,
            revised_chunks=indexed_revised.chunks,
            overall_summary=overall_summary,
            summary=summary,
            items=comparison_items,
            coverage_note=coverage_note,
            disclaimer=disclaimer,
        )
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
    finally:
        # Comparison indexes are request-scoped and must not remain in memory.
        for indexed_document in indexed_documents:
            try:
                await run_in_threadpool(
                    rag_service.remove_document, indexed_document.document_id
                )
            except UnknownDocumentError:
                logger.warning(
                    "Comparison document %s was already removed",
                    indexed_document.document_id,
                )
