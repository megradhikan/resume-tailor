"""Unit tests for API request/response schemas — validation logic only."""
import pytest
from pydantic import ValidationError
from src.api.schemas import RewriteRequest, CoverLetterRequest, InterviewPrepRequest
from src.models.analyzer import (
    AnalysisResult, MatchedKeyword, MissingKeyword, SkillGap,
    SeniorityMatch, KeywordImportance,
)


def make_analysis(**overrides) -> dict:
    base = {
        "matched_keywords": [{"keyword": "Python", "resume_evidence": "5 yrs Python"}],
        "missing_keywords": [{"keyword": "Go", "importance": "preferred", "jd_evidence": "Go preferred"}],
        "skill_gaps": [],
        "ats_score": 72.5,
        "jd_summary": "Senior backend role.",
        "seniority_match": "match",
    }
    base.update(overrides)
    return base


# ── RewriteRequest ────────────────────────────────────────────────────────────

def test_rewrite_request_valid():
    req = RewriteRequest(resume_text="My resume", analysis=AnalysisResult(**make_analysis()))
    assert req.resume_text == "My resume"


def test_rewrite_request_requires_resume_text():
    with pytest.raises(ValidationError):
        RewriteRequest(analysis=AnalysisResult(**make_analysis()))


def test_rewrite_request_requires_analysis():
    with pytest.raises(ValidationError):
        RewriteRequest(resume_text="My resume")


def test_rewrite_request_has_no_job_description_field():
    """Critical: RewriteRequest must NOT accept job_description — frontend sends only analysis."""
    req_dict = {
        "resume_text": "My resume",
        "analysis": make_analysis(),
        "job_description": "should be ignored",  # extra field
    }
    # Pydantic v2 ignores extra fields by default; the field must not be declared
    req = RewriteRequest(**{k: v for k, v in req_dict.items() if k != "job_description"})
    assert not hasattr(req, "job_description")


# ── CoverLetterRequest ────────────────────────────────────────────────────────

def test_cover_letter_request_valid():
    req = CoverLetterRequest(
        resume_text="My resume",
        analysis=AnalysisResult(**make_analysis()),
        company_name="Acme",
        role_title="Engineer",
    )
    assert req.company_name == "Acme"


def test_cover_letter_request_missing_resume_text():
    with pytest.raises(ValidationError):
        CoverLetterRequest(
            analysis=AnalysisResult(**make_analysis()),
            company_name="Acme",
            role_title="Engineer",
        )


# ── InterviewPrepRequest ─────────────────────────────────────────────────────

def test_interview_prep_request_valid():
    req = InterviewPrepRequest(
        resume_text="My resume",
        analysis=AnalysisResult(**make_analysis()),
    )
    assert req.resume_text == "My resume"


# ── AnalysisResult validation ────────────────────────────────────────────────

def test_analysis_result_rejects_invalid_seniority():
    with pytest.raises(ValidationError):
        AnalysisResult(**make_analysis(seniority_match="junior"))


def test_analysis_result_rejects_invalid_importance():
    bad_analysis = make_analysis(
        missing_keywords=[{"keyword": "Go", "importance": "critical", "jd_evidence": "..."}]
    )
    with pytest.raises(ValidationError):
        AnalysisResult(**bad_analysis)


def test_analysis_result_accepts_all_seniority_values():
    for value in ("under", "match", "over"):
        result = AnalysisResult(**make_analysis(seniority_match=value))
        assert result.seniority_match.value == value


def test_analysis_result_ats_score_float():
    result = AnalysisResult(**make_analysis(ats_score=85.5))
    assert result.ats_score == 85.5


def test_analysis_result_empty_keywords():
    result = AnalysisResult(**make_analysis(matched_keywords=[], missing_keywords=[]))
    assert result.matched_keywords == []
    assert result.missing_keywords == []
