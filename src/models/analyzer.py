from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, Field


class SeniorityMatch(str, Enum):
    under = "under"
    match = "match"
    over = "over"


class KeywordImportance(str, Enum):
    required = "required"
    preferred = "preferred"


class AnalyzerInput(BaseModel):
    resume_text: str
    resume_sections: dict[str, list[str]]  # {experience: [...], skills: [...], education: [...]}
    job_description: str


class MatchedKeyword(BaseModel):
    keyword: str
    resume_evidence: str = Field(description="Direct quote or line reference from the resume")


class MissingKeyword(BaseModel):
    keyword: str
    importance: KeywordImportance
    jd_evidence: str = Field(description="Quote from JD showing why this keyword matters")


class SkillGap(BaseModel):
    skill: str
    has_adjacent_experience: bool
    notes: str
    resume_section_ref: str = Field(description="Which resume section was checked for this skill")


# LLM-extracted keyword lists before score computation
class _LLMKeywordExtraction(BaseModel):
    matched_keywords: list[MatchedKeyword]
    missing_keywords: list[MissingKeyword]
    skill_gaps: list[SkillGap]
    jd_summary: str = Field(description="2-3 sentence summary of what the role actually wants")
    seniority_match: SeniorityMatch


class AnalysisResult(BaseModel):
    matched_keywords: list[MatchedKeyword]
    missing_keywords: list[MissingKeyword]
    skill_gaps: list[SkillGap]
    ats_score: float = Field(ge=0, le=100, description="Computed heuristic score, not LLM guess")
    jd_summary: str
    seniority_match: SeniorityMatch
