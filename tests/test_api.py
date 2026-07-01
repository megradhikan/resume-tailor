"""Integration tests for the FastAPI endpoints — mocks LLM calls."""
from __future__ import annotations
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from src.models.analyzer import (
    AnalysisResult, MatchedKeyword, MissingKeyword, SkillGap,
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


@pytest.fixture
def client():
    import os
    os.environ.setdefault("GROQ_API_KEY", "test-key-for-unit-tests")
    from src.api.app import app
    return TestClient(app, raise_server_exceptions=True)


# ── /health ──────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ── /analyze ─────────────────────────────────────────────────────────────────

def test_analyze_with_text(client):
    with patch("src.agents.analyzer.run", return_value=make_analysis_result()):
        r = client.post("/analyze", data={
            "job_description": "We need a Python backend engineer.",
            "resume_text": "Python developer with 5 years experience building APIs.",
        })
    assert r.status_code == 200
    body = r.json()
    assert "analysis" in body
    assert body["analysis"]["ats_score"] == 72.5


def test_analyze_missing_resume_and_file(client):
    r = client.post("/analyze", data={
        "job_description": "Need a Python dev.",
        "resume_text": "",
    })
    assert r.status_code == 400


def test_analyze_missing_job_description(client):
    r = client.post("/analyze", data={"resume_text": "My resume"})
    assert r.status_code == 422


# ── /rewrite ─────────────────────────────────────────────────────────────────

def test_rewrite_endpoint(client):
    analysis = make_analysis_result()
    with patch("src.agents.rewriter.run", return_value=make_rewrite_output()):
        r = client.post("/rewrite", json={
            "resume_text": "Built APIs using Python.",
            "analysis": analysis.model_dump(),
        })
    assert r.status_code == 200
    body = r.json()
    assert "rewrites" in body
    assert "grounding_violations" in body


def test_rewrite_rejects_missing_resume_text(client):
    analysis = make_analysis_result()
    r = client.post("/rewrite", json={"analysis": analysis.model_dump()})
    assert r.status_code == 422


def test_rewrite_does_not_accept_job_description_field(client):
    """The rewrite endpoint must not have job_description in its schema."""
    analysis = make_analysis_result()
    with patch("src.agents.rewriter.run", return_value=make_rewrite_output()):
        r = client.post("/rewrite", json={
            "resume_text": "Built APIs.",
            "analysis": analysis.model_dump(),
            "job_description": "this should be silently ignored, not cause an error",
        })
    # Extra fields are ignored by Pydantic — request should still succeed
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
    body = r.json()
    assert "cover_letter" in body
    assert "cover_letter_draft" in body["cover_letter"]


# ── /interview-prep ───────────────────────────────────────────────────────────

def test_interview_prep_endpoint(client):
    analysis = make_analysis_result()
    with patch("src.agents.interview_prep.run", return_value=make_interview_output()):
        r = client.post("/interview-prep", json={
            "resume_text": "Python developer.",
            "analysis": analysis.model_dump(),
        })
    assert r.status_code == 200
    body = r.json()
    assert "interview_prep" in body
    assert len(body["interview_prep"]["questions"]) == 1


# ── /export/resume ─────────────────────────────────────────────────────────

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
    assert len(r.content) > 0


def test_export_resume_no_suggestions(client):
    r = client.post("/export/resume", json={
        "resume_text": "Jane Doe\nSoftware Engineer\n",
        "accepted_suggestions": [],
    })
    assert r.status_code == 200


# ── /export/cover-letter ──────────────────────────────────────────────────

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


def test_export_cover_letter_minimal(client):
    r = client.post("/export/cover-letter", json={
        "cover_letter_draft": "Hello world.",
    })
    assert r.status_code == 200
