"""Simple unit tests for document validation and text extraction."""

from io import BytesIO

import pytest
from docx import Document as DocxDocument

from backend import config
from backend.rag.service import (
    DocumentProcessingError,
    RAGService,
    validate_document_upload,
)


def create_docx_bytes(text: str = "") -> bytes:
    """Create a small DOCX document in memory for an extraction test."""
    document = DocxDocument()
    if text:
        document.add_paragraph(text)

    document_bytes = BytesIO()
    document.save(document_bytes)
    return document_bytes.getvalue()


def test_valid_file_size():
    file_bytes = b"x" * config.MAX_UPLOAD_BYTES

    filename, extension = validate_document_upload("document.pdf", file_bytes)

    assert filename == "document.pdf"
    assert extension == ".pdf"


def test_oversized_file_rejected():
    file_bytes = b"x" * (config.MAX_UPLOAD_BYTES + 1)

    with pytest.raises(DocumentProcessingError, match="larger than 10 MB"):
        validate_document_upload("document.pdf", file_bytes)


def test_valid_file_type():
    # Both PDF and DOCX are supported by the current backend rules.
    assert validate_document_upload("document.pdf", b"content")[1] == ".pdf"
    assert validate_document_upload("document.docx", b"content")[1] == ".docx"


def test_invalid_file_type():
    with pytest.raises(DocumentProcessingError, match="PDF, DOCX, or TXT"):
        validate_document_upload("document.exe", b"content")


def test_empty_document_rejected():
    empty_docx = create_docx_bytes()
    document_service = RAGService()

    with pytest.raises(DocumentProcessingError, match="No extractable text"):
        document_service._parse_document("empty.docx", ".docx", empty_docx)


def test_text_extraction():
    expected_text = "This is a LegalSimple unit test document."
    docx_bytes = create_docx_bytes(expected_text)
    document_service = RAGService()

    extracted_documents = document_service._parse_document(
        "unit-test.docx", ".docx", docx_bytes
    )

    assert expected_text in extracted_documents[0].page_content
