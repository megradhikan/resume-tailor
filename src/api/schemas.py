"""Request/response schemas for the FastAPI endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field

from src.models.analyzer import AnalysisResult
from src.models.rewriter import RewriteOutput
from src.models.cover_letter import CoverLetterOutput
from src.models.interview_prep import InterviewPrepOutput


# ── Request bodies ───────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    resume_text: str = Field(description="Plain text resume (used when no file is uploaded)")
    job_description: str


class RewriteRequest(BaseModel):
    resume_text: str
    analysis: AnalysisResult


class CoverLetterRequest(BaseModel):
    resume_text: str
    analysis: AnalysisResult
    company_name: str
    role_title: str


class InterviewPrepRequest(BaseModel):
    resume_text: str
    analysis: AnalysisResult


# ── Response bodies ──────────────────────────────────────────────────────────

class AnalyzeResponse(BaseModel):
    analysis: AnalysisResult
    resume_sections: dict[str, list[str]]


class RewriteResponse(BaseModel):
    rewrites: RewriteOutput
    grounding_violations: list[dict]


class CoverLetterResponse(BaseModel):
    cover_letter: CoverLetterOutput


class InterviewPrepResponse(BaseModel):
    interview_prep: InterviewPrepOutput


class ErrorResponse(BaseModel):
    detail: str
