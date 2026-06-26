"""Unit tests for the ats_score computation — no LLM calls needed."""
import pytest

from src.agents.analyzer import _compute_ats_score
from src.models.analyzer import MatchedKeyword, MissingKeyword, KeywordImportance


def mk_matched(keyword: str) -> MatchedKeyword:
    return MatchedKeyword(keyword=keyword, resume_evidence=f"Evidence for {keyword}")


def mk_missing(keyword: str, importance: str) -> MissingKeyword:
    return MissingKeyword(
        keyword=keyword,
        importance=KeywordImportance(importance),
        jd_evidence=f"JD mentions {keyword}",
    )


def test_perfect_match():
    matched = [mk_matched("Python"), mk_matched("FastAPI")]
    missing = []
    score = _compute_ats_score(matched, missing)
    assert score == 100.0


def test_no_match():
    matched = []
    missing = [mk_missing("Python", "required"), mk_missing("Go", "preferred")]
    score = _compute_ats_score(matched, missing)
    assert score == 0.0


def test_empty_inputs():
    assert _compute_ats_score([], []) == 0.0


def test_required_weighted_heavier():
    # 2 matched, 1 missing required (weight 2), 1 missing preferred (weight 1)
    # weighted_matched = 2, weighted_total = 2 + 2 + 1 = 5
    # score = 100 * 2/5 = 40.0
    matched = [mk_matched("Python"), mk_matched("FastAPI")]
    missing = [mk_missing("Kubernetes", "required"), mk_missing("Redis", "preferred")]
    score = _compute_ats_score(matched, missing)
    assert score == 40.0


def test_only_preferred_missing():
    # 3 matched, 1 missing preferred (weight 1)
    # weighted_matched = 3, weighted_total = 3 + 0 + 1 = 4
    # score = 100 * 3/4 = 75.0
    matched = [mk_matched("Python"), mk_matched("SQL"), mk_matched("Git")]
    missing = [mk_missing("Docker", "preferred")]
    score = _compute_ats_score(matched, missing)
    assert score == 75.0


def test_only_required_missing():
    # 2 matched, 2 missing required (weight 2 each)
    # weighted_matched = 2, weighted_total = 2 + 4 = 6
    # score = 100 * 2/6 ≈ 33.3
    matched = [mk_matched("Python"), mk_matched("SQL")]
    missing = [mk_missing("Kubernetes", "required"), mk_missing("Terraform", "required")]
    score = _compute_ats_score(matched, missing)
    assert score == pytest.approx(33.3, abs=0.1)


def test_score_bounded():
    matched = [mk_matched(f"skill_{i}") for i in range(10)]
    missing = [mk_missing("rare_skill", "preferred")]
    score = _compute_ats_score(matched, missing)
    assert 0 <= score <= 100
