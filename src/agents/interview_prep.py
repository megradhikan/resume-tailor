"""
Interview Prep Agent — generates likely interview questions.
gap_probe questions come directly from AnalysisResult.skill_gaps
so the user knows exactly what to expect given what's missing.
"""
from __future__ import annotations

from src.llm_client import call_llm
from src.models.analyzer import AnalysisResult
from src.models.interview_prep import InterviewPrepOutput


def _build_prompt(
    resume_sections: dict[str, list[str]],
    analysis: AnalysisResult,
) -> str:
    sections_text = "\n".join(
        f"[{section.upper()}]\n" + "\n".join(f"  - {item}" for item in items)
        for section, items in resume_sections.items()
    )
    gaps_text = "\n".join(
        f"  - {g.skill} (adjacent={g.has_adjacent_experience}): {g.notes}"
        for g in analysis.skill_gaps
    ) or "  (none)"

    matched_text = "\n".join(
        f"  - {k.keyword}: {k.resume_evidence[:60]}"
        for k in analysis.matched_keywords[:10]
    )

    return f"""You are an expert technical interviewer preparing a candidate for an interview.

RESUME SECTIONS:
{sections_text}

ROLE SUMMARY: {analysis.jd_summary}
SENIORITY MATCH: {analysis.seniority_match.value}

CANDIDATE'S MATCHED STRENGTHS:
{matched_text}

SKILL GAPS (these WILL be probed — generate gap_probe questions for each):
{gaps_text}

Generate 8-12 interview questions covering:
1. behavioral (3-4): past experience stories, teamwork, conflict, impact. Reference specific resume points.
2. technical (3-4): depth questions on technologies/skills the candidate DOES have (from matched keywords).
3. gap_probe (one per skill_gap): "Tell me about your experience with X..." style questions for each gap.
   For gap_probe questions, relevant_resume_points should note the adjacent experience the candidate CAN draw on.

For suggested_talking_points: give the candidate a concrete angle to answer from, grounded in what's actually in their resume."""


def run(
    resume_sections: dict[str, list[str]],
    analysis: AnalysisResult,
) -> InterviewPrepOutput:
    prompt = _build_prompt(resume_sections, analysis)
    return call_llm(prompt, InterviewPrepOutput)
