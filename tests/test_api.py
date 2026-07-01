"""Integration tests for the FastAPI endpoints — mocks LLM calls."""
from __future__ import annotations
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from src.models.analyzer import (
    AnalysisResult, MatchedKeyword, MissingKeyword,
    SeniorityMatch, KeywordImportance,
)
from src.models.rewriter import RewriteOutput, RewriteSuggestion
from src.models.cover_letter import CoverLetterOutput, ParagraphGrounding
from src.models.interview_prep import InterviewPrepOutput, InterviewQuestion, QuestionCategory


def make_analysis_result() -> AnalysisResult:
    return AnalysisResult(
        matched_keywords=[MatchedKeyword(keyword="Python", resume_evidence="5 yrs Python")],
        missing_keywords=[MissingKeyword(keyword="Go", importance=KeywordImportance.preferred, jd_evidence="Go preferred")],
        skill_gaps=[],
        ats_score=72.5,
        jd_summary="Senior backend role.",
        seniority_match=SeniorityMatch.match,
    )


def make_rewrite_output() -> RewriteOutput:
    return RewriteOutput(suggestions=[
        RewriteSuggestion(
            section="experience",
            original_line="Built APIs",
            suggested_line="Architected and delivered high-throughput APIs",
            reason="Stronger action verb",
            grounded_in="APIs (in resume)",
        )
    ])


def make_cover_letter_output() -> CoverLetterOutput:
    return CoverLetterOutput(
        cover_letter_draft="Dear Hiring Manager,\n\nI am excited to apply.\n\nSincerely,\nJane",
        paragraph_grounding=[ParagraphGrounding(paragraph_index=0, grounded_in=["Python"])],
    )


def make_interview_output() -> InterviewPrepOutput:
    return InterviewPrepOutput(questions=[
        InterviewQuestion(
            question="Tell me about a time you improved API performance.",
            category=QuestionCategory.behavioral,
            relevant_resume_points=["Built REST APIs"],
            suggested_talking_points=["Reduced latency by 40%"],
        )
    ])


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Clear the in-memory rate limit store between tests."""
    os.environ.setdefault("GROQ_API_KEY", "test-key-for-unit-tests")
    from src.api.app import limiter
    limiter._storage.reset()
    yield
    limiter._storage.reset()


@pytest.fixture
def client():
    os.environ.setdefault("GROQ_API_KEY", "test-key-for-unit-tests")
    from src.api.app import app
    return TestClient(app, raise_server_exceptions=False)


# ── /health ───────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_does_not_expose_version(client):
    r = client.get("/health")
    assert "version" not in r.json()


# ── Security headers ──────────────────────────────────────────────────────────

def test_security_headers_present(client):
    r = client.get("/health")
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("x-frame-options") == "DENY"
    assert "referrer-policy" in r.headers


# ── Swagger UI disabled in production ─────────────────────────────────────────

def test_docs_disabled_by_default(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


# ── /analyze ──────────────────────────────────────────────────────────────────

def test_analyze_with_text(client):
    with patch("src.agents.analyzer.run", return_value=make_analysis_result()):
        r = client.post("/analyze", data={
            "job_description": "We need a Python backend engineer.",
            "resume_text": "Python developer with 5 years experience building APIs.",
        })
    assert r.status_code == 200
    assert r.json()["analysis"]["ats_score"] == 72.5


def test_analyze_missing_resume_returns_400(client):
    r = client.post("/analyze", data={
        "job_description": "Need a Python dev.",
        "resume_text": "",
    })
    assert r.status_code == 400


def test_analyze_missing_job_description_returns_422(client):
    r = client.post("/analyze", data={"resume_text": "My resume"})
    assert r.status_code == 422


def test_analyze_rejects_oversized_resume_text(client):
    r = client.post("/analyze", data={
        "job_description": "A job.",
        "resume_text": "x" * 50_001,
    })
    assert r.status_code == 400


def test_analyze_rejects_oversized_job_description(client):
    r = client.post("/analyze", data={
        "job_description": "y" * 50_001,
        "resume_text": "My resume",
    })
    assert r.status_code == 400


def test_analyze_rejects_disallowed_file_extension(client):
    r = client.post("/analyze", data={"job_description": "A job."}, files={
        "resume_file": ("resume.txt", b"plain text content", "text/plain"),
    })
    assert r.status_code == 400


def test_analyze_rejects_oversized_file(client):
    big_bytes = b"x" * (5 * 1024 * 1024 + 1)
    r = client.post("/analyze", data={"job_description": "A job."}, files={
        "resume_file": ("resume.pdf", big_bytes, "application/pdf"),
    })
    assert r.status_code == 400


# ── /rewrite ──────────────────────────────────────────────────────────────────

def test_rewrite_endpoint(client):
    analysis = make_analysis_result()
    with patch("src.agents.rewriter.run", return_value=make_rewrite_output()):
        r = client.post("/rewrite", json={
            "resume_text": "Built APIs using Python.",
            "analysis": analysis.model_dump(),
        })
    assert r.status_code == 200
    assert "rewrites" in r.json()
    assert "grounding_violations" in r.json()


def test_rewrite_rejects_missing_resume_text(client):
    analysis = make_analysis_result()
    r = client.post("/rewrite", json={"analysis": analysis.model_dump()})
    assert r.status_code == 422


def test_rewrite_rejects_oversized_resume(client):
    analysis = make_analysis_result()
    r = client.post("/rewrite", json={
        "resume_text": "x" * 50_001,
        "analysis": analysis.model_dump(),
    })
    assert r.status_code == 422


def test_rewrite_has_no_job_description_field(client):
    """RewriteRequest must not declare job_description — extra fields are silently ignored."""
    analysis = make_analysis_result()
    with patch("src.agents.rewriter.run", return_value=make_rewrite_output()):
        r = client.post("/rewrite", json={
            "resume_text": "Built APIs.",
            "analysis": analysis.model_dump(),
            "job_description": "should be ignored",
        })
    assert r.status_code == 200


# ── /cover-letter ─────────────────────────────────────────────────────────────

def test_cover_letter_endpoint(client):
    analysis = make_analysis_result()
    with patch("src.agents.cover_letter.run", return_value=make_cover_letter_output()):
        r = client.post("/cover-letter", json={
            "resume_text": "Python developer.",
            "analysis": analysis.model_dump(),
            "company_name": "Acme",
            "role_title": "Backend Engineer",
        })
    assert r.status_code == 200
    assert "cover_letter_draft" in r.json()["cover_letter"]


# ── /interview-prep ───────────────────────────────────────────────────────────

def test_interview_prep_endpoint(client):
    analysis = make_analysis_result()
    with patch("src.agents.interview_prep.run", return_value=make_interview_output()):
        r = client.post("/interview-prep", json={
            "resume_text": "Python developer.",
            "analysis": analysis.model_dump(),
        })
    assert r.status_code == 200
    assert len(r.json()["interview_prep"]["questions"]) == 1


# ── /export/resume ────────────────────────────────────────────────────────────

def test_export_resume_returns_docx(client):
    r = client.post("/export/resume", json={
        "resume_text": "Jane Doe\n\nExperience\nBuilt APIs using Python.\n",
        "accepted_suggestions": [
            {
                "section": "experience",
                "original_line": "Built APIs using Python.",
                "suggested_line": "Architected high-throughput APIs using Python.",
                "reason": "Stronger verb",
                "grounded_in": "Python (in resume)",
            }
        ],
    })
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


def test_export_resume_rejects_oversized_suggestion_field(client):
    r = client.post("/export/resume", json={
        "resume_text": "Jane Doe\n",
        "accepted_suggestions": [
            {
                "section": "experience",
                "original_line": "x" * 2001,
                "suggested_line": "Better line",
                "reason": "reason",
                "grounded_in": "grounding",
            }
        ],
    })
    assert r.status_code == 422


def test_export_resume_no_suggestions(client):
    r = client.post("/export/resume", json={
        "resume_text": "Jane Doe\nSoftware Engineer\n",
        "accepted_suggestions": [],
    })
    assert r.status_code == 200


# ── /export/cover-letter ──────────────────────────────────────────────────────

def test_export_cover_letter_returns_docx(client):
    r = client.post("/export/cover-letter", json={
        "cover_letter_draft": "Dear Hiring Manager,\n\nI am excited.\n\nSincerely,\nJane",
        "company_name": "Acme",
        "role_title": "Engineer",
    })
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


def test_export_cover_letter_rejects_oversized_company_name(client):
    r = client.post("/export/cover-letter", json={
        "cover_letter_draft": "Hello.",
        "company_name": "A" * 201,
        "role_title": "Engineer",
    })
    assert r.status_code == 422


def test_export_cover_letter_minimal(client):
    r = client.post("/export/cover-letter", json={"cover_letter_draft": "Hello world."})
    assert r.status_code == 200


# ── Generic error handler ─────────────────────────────────────────────────────

def test_internal_error_does_not_leak_details(client):
    """500 responses must return a generic message, not raw exception text."""
    with patch("src.agents.analyzer.run", side_effect=RuntimeError("secret internal path /app/src/key=abc123")):
        r = client.post("/analyze", data={
            "job_description": "A job.",
            "resume_text": "My resume.",
        })
    assert r.status_code == 500
    body = r.json()
    assert "secret" not in body.get("detail", "")
    assert "abc123" not in body.get("detail", "")
    assert body["detail"] == "An internal error occurred."
