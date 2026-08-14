"""Gemini and FAISS retrieval service for the Legal AI Companion."""

import io
import logging
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import pymupdf
from docx import Document as DocxDocument
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend import config
from backend.rag.prompts import (
    DOCUMENT_ANSWER_SYSTEM_PROMPT,
    GENERAL_CHAT_SYSTEM_PROMPT,
    QUESTION_REWRITE_SYSTEM_PROMPT,
)
from backend.rag.schemas import (
    ChatHistoryMessage,
    DocumentSource,
    DocumentUploadResponse,
)


logger = logging.getLogger(__name__)
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}


class RAGConfigurationError(RuntimeError):
    """Raised when required Gemini configuration is unavailable."""


class DocumentProcessingError(ValueError):
    """Raised when an uploaded document cannot be parsed or indexed."""


class UnknownDocumentError(LookupError):
    """Raised when a document identifier has no in-memory FAISS store."""


class GeminiRequestError(RuntimeError):
    """Raised when Gemini cannot complete an embedding or generation request."""


@dataclass(frozen=True)
class DocumentStore:
    """The in-memory FAISS index and metadata for one uploaded document."""

    filename: str
    chunk_count: int
    vector_store: FAISS


class RAGService:
    """Parse documents, manage per-document FAISS stores, and answer questions."""

    def __init__(self) -> None:
        self._llm: ChatGoogleGenerativeAI | None = None
        self._embeddings: GoogleGenerativeAIEmbeddings | None = None
        self._document_stores: dict[str, DocumentStore] = {}
        self._stores_lock = threading.RLock()
        self._models_lock = threading.Lock()
        self._text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=config.CHUNK_SIZE,
            chunk_overlap=config.CHUNK_OVERLAP,
            length_function=len,
        )

    def process_document(self, filename: str, file_bytes: bytes) -> DocumentUploadResponse:
        """Parse and index one supported document in an isolated FAISS store."""
        safe_filename = Path(filename).name.strip()
        extension = Path(safe_filename).suffix.lower()

        if not safe_filename or extension not in SUPPORTED_EXTENSIONS:
            raise DocumentProcessingError("Choose a PDF, DOCX, or TXT document.")
        if not file_bytes:
            raise DocumentProcessingError("The selected document is empty.")
        if len(file_bytes) > config.MAX_UPLOAD_BYTES:
            raise DocumentProcessingError("The selected document is larger than 10 MB.")

        try:
            documents = self._parse_document(safe_filename, extension, file_bytes)
            chunks = self._text_splitter.split_documents(documents)
        except DocumentProcessingError:
            raise
        except Exception as error:
            logger.exception("Document parsing failed for %s", safe_filename)
            raise DocumentProcessingError("The document could not be read.") from error

        chunks = [chunk for chunk in chunks if chunk.page_content.strip()]
        if not chunks:
            raise DocumentProcessingError("No extractable text was found in the document.")

        for chunk_index, chunk in enumerate(chunks):
            chunk.metadata["chunk_index"] = chunk_index

        _, embeddings = self._ensure_models()
        try:
            vector_store = FAISS.from_documents(documents=chunks, embedding=embeddings)
        except Exception as error:
            logger.exception(
                "Gemini embedding or FAISS indexing failed for %s", safe_filename
            )
            raise GeminiRequestError(
                "The document could not be processed by the AI service."
            ) from error

        document_id = uuid4().hex
        with self._stores_lock:
            self._document_stores[document_id] = DocumentStore(
                filename=safe_filename,
                chunk_count=len(chunks),
                vector_store=vector_store,
            )

        logger.info(
            "Indexed %s as %s with %d chunks",
            safe_filename,
            document_id,
            len(chunks),
        )
        return DocumentUploadResponse(
            status="ready",
            document_id=document_id,
            filename=safe_filename,
            chunks=len(chunks),
        )

    def remove_document(self, document_id: str) -> None:
        """Remove one document's in-memory FAISS store."""
        with self._stores_lock:
            removed_store = self._document_stores.pop(document_id, None)
        if removed_store is None:
            raise UnknownDocumentError("The attached document is no longer available.")

    def chat(
        self,
        message: str,
        document_id: str | None,
        history: list[ChatHistoryMessage],
    ) -> tuple[str, list[DocumentSource]]:
        """Generate either a general answer or a document-grounded RAG answer."""
        llm, _ = self._ensure_models()
        langchain_history = self._to_langchain_history(history)

        try:
            if document_id:
                return self._chat_with_document(
                    message, document_id, langchain_history, llm
                )
            return self._general_chat(message, langchain_history, llm), []
        except UnknownDocumentError:
            raise
        except Exception as error:
            logger.exception("Gemini generation failed")
            raise GeminiRequestError(
                "The Legal AI Companion could not generate a response."
            ) from error

    def _ensure_models(
        self,
    ) -> tuple[ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings]:
        if not config.GOOGLE_API_KEY:
            raise RAGConfigurationError(
                "The Gemini API key is not configured on the backend."
            )

        with self._models_lock:
            try:
                if self._llm is None:
                    self._llm = ChatGoogleGenerativeAI(
                        model=config.GEMINI_GENERATION_MODEL,
                        temperature=1.0,
                        max_retries=2,
                    )
                if self._embeddings is None:
                    self._embeddings = GoogleGenerativeAIEmbeddings(
                        model=config.GEMINI_EMBEDDING_MODEL,
                    )
            except Exception as error:
                logger.exception("Gemini clients could not be initialized")
                raise GeminiRequestError(
                    "The Legal AI Companion could not initialize the AI service."
                ) from error

        assert self._llm is not None and self._embeddings is not None
        return self._llm, self._embeddings

    def _parse_document(
        self, filename: str, extension: str, file_bytes: bytes
    ) -> list[Document]:
        if extension == ".pdf":
            documents = self._parse_pdf(filename, file_bytes)
        elif extension == ".docx":
            documents = self._parse_docx(filename, file_bytes)
        else:
            documents = self._parse_txt(filename, file_bytes)

        extracted_characters = sum(len(document.page_content) for document in documents)
        if extracted_characters > config.MAX_EXTRACTED_CHARACTERS:
            raise DocumentProcessingError(
                "The document contains too much extracted text for this version of LegalSimple."
            )
        if not documents or extracted_characters == 0:
            raise DocumentProcessingError("No extractable text was found in the document.")
        return documents

    @staticmethod
    def _parse_pdf(filename: str, file_bytes: bytes) -> list[Document]:
        documents: list[Document] = []
        with pymupdf.open(stream=file_bytes, filetype="pdf") as pdf_document:
            for page_index, page in enumerate(pdf_document):
                page_text = page.get_text("text").strip()
                if page_text:
                    documents.append(
                        Document(
                            page_content=page_text,
                            metadata={
                                "filename": filename,
                                "page_number": page_index + 1,
                            },
                        )
                    )
        return documents

    @staticmethod
    def _parse_docx(filename: str, file_bytes: bytes) -> list[Document]:
        docx_document = DocxDocument(io.BytesIO(file_bytes))
        text_parts = [paragraph.text.strip() for paragraph in docx_document.paragraphs]

        # Tables frequently hold important clauses, dates, and payment terms.
        for table in docx_document.tables:
            for row in table.rows:
                row_text = " | ".join(
                    cell.text.strip() for cell in row.cells if cell.text.strip()
                )
                if row_text:
                    text_parts.append(row_text)

        document_text = "\n\n".join(part for part in text_parts if part)
        if not document_text:
            return []
        return [Document(page_content=document_text, metadata={"filename": filename})]

    @staticmethod
    def _parse_txt(filename: str, file_bytes: bytes) -> list[Document]:
        decoded_text = ""
        for encoding in ("utf-8-sig", "utf-16"):
            try:
                decoded_text = file_bytes.decode(encoding).strip()
                break
            except UnicodeDecodeError:
                continue

        if not decoded_text:
            raise DocumentProcessingError(
                "The TXT document must use UTF-8 or UTF-16 encoding."
            )
        return [Document(page_content=decoded_text, metadata={"filename": filename})]

    def _chat_with_document(
        self,
        message: str,
        document_id: str,
        history: list[BaseMessage],
        llm: ChatGoogleGenerativeAI,
    ) -> tuple[str, list[DocumentSource]]:
        with self._stores_lock:
            document_store = self._document_stores.get(document_id)
        if document_store is None:
            raise UnknownDocumentError("The attached document is no longer available.")

        retrieval_query = message
        if history:
            rewrite_prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", QUESTION_REWRITE_SYSTEM_PROMPT),
                    MessagesPlaceholder("chat_history"),
                    ("human", "{input}"),
                ]
            )
            rewritten_question = (rewrite_prompt | llm | StrOutputParser()).invoke(
                {"input": message, "chat_history": history}
            )
            retrieval_query = rewritten_question.strip() or message

        retriever = document_store.vector_store.as_retriever(
            search_kwargs={"k": config.RETRIEVAL_COUNT}
        )
        retrieved_documents = retriever.invoke(retrieval_query)
        context = self._format_context(retrieved_documents)

        answer_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", DOCUMENT_ANSWER_SYSTEM_PROMPT),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )
        answer = (answer_prompt | llm | StrOutputParser()).invoke(
            {"input": message, "chat_history": history, "context": context}
        )
        return self._prepare_answer_for_display(answer), self._collect_sources(
            retrieved_documents
        )

    @staticmethod
    def _general_chat(
        message: str,
        history: list[BaseMessage],
        llm: ChatGoogleGenerativeAI,
    ) -> str:
        general_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", GENERAL_CHAT_SYSTEM_PROMPT),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )
        answer = (general_prompt | llm | StrOutputParser()).invoke(
            {"input": message, "chat_history": history}
        )
        return RAGService._prepare_answer_for_display(answer)

    @staticmethod
    def _prepare_answer_for_display(answer: str) -> str:
        """Remove common Markdown markers that the plain-text chat UI cannot render."""
        plain_text = re.sub(r"(?m)^\s{0,3}#{1,6}\s+", "", answer)
        plain_text = re.sub(r"(?m)^\s*[-*_]{3,}\s*$", "", plain_text)
        plain_text = re.sub(r"(?m)^\s*\*\s+", "- ", plain_text)
        plain_text = plain_text.replace("**", "").replace("__", "").replace("`", "")
        plain_text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"\1", plain_text)
        plain_text = re.sub(r"\n{3,}", "\n\n", plain_text)
        return plain_text.strip()

    @staticmethod
    def _to_langchain_history(history: list[ChatHistoryMessage]) -> list[BaseMessage]:
        recent_history = history[-config.MAX_CHAT_HISTORY_MESSAGES :]
        converted_history: list[BaseMessage] = []
        for history_message in recent_history:
            if history_message.role == "user":
                converted_history.append(HumanMessage(content=history_message.content))
            else:
                converted_history.append(AIMessage(content=history_message.content))
        return converted_history

    @staticmethod
    def _format_context(documents: list[Document]) -> str:
        if not documents:
            return "No relevant document context was retrieved."

        formatted_documents: list[str] = []
        for index, document in enumerate(documents, start=1):
            filename = document.metadata.get("filename", "Uploaded document")
            page_number = document.metadata.get("page_number")
            source_label = f"Source {index}: {filename}"
            if isinstance(page_number, int):
                source_label += f", page {page_number}"
            formatted_documents.append(
                f"{source_label}\nBEGIN DOCUMENT EXCERPT\n"
                f"{document.page_content}\nEND DOCUMENT EXCERPT"
            )
        return "\n\n".join(formatted_documents)

    @staticmethod
    def _collect_sources(documents: list[Document]) -> list[DocumentSource]:
        sources: list[DocumentSource] = []
        seen_sources: set[tuple[str, int | None]] = set()

        for document in documents:
            filename = document.metadata.get("filename")
            if not isinstance(filename, str) or not filename:
                continue
            page_number = document.metadata.get("page_number")
            if not isinstance(page_number, int):
                page_number = None

            source_key = (filename, page_number)
            if source_key in seen_sources:
                continue
            seen_sources.add(source_key)
            sources.append(DocumentSource(filename=filename, page_number=page_number))

        return sources
