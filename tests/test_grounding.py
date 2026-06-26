"""Unit tests for grounding validation — no LLM calls."""
from src.validation.grounding import validate_rewrite_suggestions, _extract_candidate_terms
from src.models.rewriter import RewriteSuggestion


def mk_suggestion(original: str, suggested: str, section: str = "experience") -> RewriteSuggestion:
    return RewriteSuggestion(
        section=section,
        original_line=original,
        suggested_line=suggested,
        reason="test",
        grounded_in="test grounding",
    )


RESUME_TEXT = """
Python developer with 3 years experience.
Built REST APIs using FastAPI and PostgreSQL.
Led a team of 5 engineers.
Deployed services on AWS using Docker.
"""


def test_no_violations_when_terms_in_original():
    suggestions = [
        mk_suggestion(
            "Built REST APIs using FastAPI and PostgreSQL",
            "Designed and built scalable REST APIs using FastAPI and PostgreSQL",
        )
    ]
    violations = validate_rewrite_suggestions(suggestions, RESUME_TEXT)
    assert violations == []


def test_no_violations_when_terms_in_resume():
    # "Docker" is in resume but not the specific original_line
    suggestions = [
        mk_suggestion(
            "Led a team of 5 engineers",
            "Led a cross-functional team of 5 engineers deploying services via Docker",
        )
    ]
    violations = validate_rewrite_suggestions(suggestions, RESUME_TEXT)
    assert violations == []


def test_flags_hallucinated_term():
    suggestions = [
        mk_suggestion(
            "Built REST APIs using FastAPI",
            "Built REST APIs using FastAPI and Kubernetes",  # Kubernetes not in resume
        )
    ]
    violations = validate_rewrite_suggestions(suggestions, RESUME_TEXT)
    assert len(violations) == 1
    assert "Kubernetes" in violations[0].ungrounded_terms


def test_multiple_violations():
    suggestions = [
        mk_suggestion(
            "Python developer",
            "Python developer with Go and Rust experience",  # Go, Rust not in resume
        )
    ]
    violations = validate_rewrite_suggestions(suggestions, RESUME_TEXT)
    assert len(violations) == 1
    ungrounded = violations[0].ungrounded_terms
    # At least one of Go or Rust should be flagged
    assert any(t in ungrounded for t in ["Go", "Rust"])


def test_empty_suggestions():
    assert validate_rewrite_suggestions([], RESUME_TEXT) == []


def test_extract_candidate_terms_catches_tech():
    terms = _extract_candidate_terms("Deployed using Kubernetes and Apache Kafka on AWS")
    term_lower = [t.lower() for t in terms]
    assert any("kubernetes" in t for t in term_lower)
    assert any("kafka" in t or "apache" in t for t in term_lower)
