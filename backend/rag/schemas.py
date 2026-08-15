"""Request and response schemas for LegalSimple's shared RAG API."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatHistoryMessage(BaseModel):
    """One recent user or assistant message supplied by the browser."""

    model_config = ConfigDict(str_strip_whitespace=True)

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=10_000)


class CompanionChatRequest(BaseModel):
    """A Legal AI Companion chat request."""

    model_config = ConfigDict(str_strip_whitespace=True)

    message: str = Field(min_length=1, max_length=8_000)
    document_id: str | None = Field(default=None, min_length=1, max_length=64)
    chat_history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=50)


class DocumentSource(BaseModel):
    """Source metadata retained from a retrieved document chunk."""

    filename: str
    page_number: int | None = Field(default=None, ge=1)


class CompanionChatResponse(BaseModel):
    """A generated answer and any document sources used for retrieval."""

    answer: str
    sources: list[DocumentSource] = Field(default_factory=list)


class DocumentUploadResponse(BaseModel):
    """Information about a successfully indexed document."""

    status: Literal["ready"]
    document_id: str
    filename: str
    chunks: int = Field(ge=1)


class DocumentDeleteResponse(BaseModel):
    """Confirmation that an in-memory document index was removed."""

    status: Literal["removed"]
    document_id: str


class DocumentSimplifierResponse(BaseModel):
    """A plain-language explanation generated from retrieved PDF content."""

    filename: str
    simplification: str
    chunks: int = Field(ge=1)
    sources: list[DocumentSource] = Field(default_factory=list)


class GeneratedRiskAnalysis(BaseModel):
    """Structured risk classification returned internally by Gemini."""

    model_config = ConfigDict(str_strip_whitespace=True)

    risk_level: Literal["high", "medium", "low"] = Field(
        description="The document's overall apparent risk level."
    )
    explanation: str = Field(
        min_length=1,
        max_length=20_000,
        description="Document-grounded reasons for the selected risk level.",
    )


class RiskAnalyzerResponse(BaseModel):
    """A document-grounded risk classification for an uploaded PDF."""

    filename: str
    risk_level: Literal["high", "medium", "low"]
    explanation: str
    chunks: int = Field(ge=1)
    sources: list[DocumentSource] = Field(default_factory=list)
