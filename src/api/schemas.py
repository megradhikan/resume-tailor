"""Request/response schemas for the FastAPI endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field

from src.models.analyzer import AnalysisResult
from src.models.rewriter import RewriteOutput
from src.models.cover_letter import CoverLetterOutput
from src.models.interview_prep import InterviewPrepOutput

_MAX_TEXT = 50_000


# ── Request bodies ───────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    resume_text: str = Field(max_length=_MAX_TEXT, description="Plain text resume")
    job_description: str = Field(max_length=_MAX_TEXT)


class RewriteRequest(BaseModel):
    resume_text: str = Field(max_length=_MAX_TEXT)
    analysis: AnalysisResult


class CoverLetterRequest(BaseModel):
    resume_text: str = Field(max_length=_MAX_TEXT)
    analysis: AnalysisResult
    company_name: str = Field(max_length=200)
    role_title: str = Field(max_length=200)


class InterviewPrepRequest(BaseModel):
    resume_text: str = Field(max_length=_MAX_TEXT)
    analysis: AnalysisResult


# ── Response bodies ──────────────────────────────────────────────────────────

class AnalyzeResponse(BaseModel):
    analysis: AnalysisResult
    resume_sections: dict[str, list[str]]
    resume_text: str


class RewriteResponse(BaseModel):
    rewrites: RewriteOutput
    grounding_violations: list[dict]


class CoverLetterResponse(BaseModel):
    cover_letter: CoverLetterOutput


class InterviewPrepResponse(BaseModel):
    interview_prep: InterviewPrepOutput


class ErrorResponse(BaseModel):
    detail: str
