"""
Cover Letter Agent — drafts a grounded cover letter.
Every paragraph that references an accomplishment must trace back
to resume_sections. Gaps are addressed honestly, never papered over.
"""
from __future__ import annotations

from src.llm_client import call_llm
from src.models.analyzer import AnalysisResult
from src.models.cover_letter import CoverLetterOutput


def _build_prompt(
    resume_sections: dict[str, list[str]],
    analysis: AnalysisResult,
    company_name: str,
    role_title: str,
) -> str:
    sections_text = "\n".join(
        f"[{section.upper()}]\n" + "\n".join(f"  - {item}" for item in items)
        for section, items in resume_sections.items()
    )
    matched_text = ", ".join(k.keyword for k in analysis.matched_keywords[:15])
    gaps_text = "\n".join(
        f"  - {g.skill} (adjacent={g.has_adjacent_experience}): {g.notes}"
        for g in analysis.skill_gaps
    )

    return f"""You are an expert cover letter writer. Write a professional cover letter for:
- Company: {company_name}
- Role: {role_title}

RESUME SECTIONS (your ONLY allowed source of facts):
{sections_text}

ROLE SUMMARY: {analysis.jd_summary}

KEYWORDS THIS CANDIDATE ALREADY HAS: {matched_text}

SKILL GAPS (handle honestly — do NOT imply experience that doesn't exist):
{gaps_text}

RULES:
1. Every specific accomplishment or skill you mention must come from the RESUME SECTIONS above.
2. For each skill_gap, you may honestly bridge it: "While I haven't worked directly with X, my experience with Y has given me..."
   Never say "I have experience with X" if X is a skill_gap.
3. Structure: opening (why this role/company), body (2-3 paragraphs connecting resume to role requirements), closing (call to action).
4. Keep it under 400 words. Professional but not generic.
5. In paragraph_grounding, for each paragraph (0-indexed), list which resume sections you drew from.

Output cover_letter_draft as a single string with paragraph breaks (\\n\\n between paragraphs).
Output paragraph_grounding as an array tracking which sections backed each paragraph."""


def run(
    resume_sections: dict[str, list[str]],
    analysis: AnalysisResult,
    company_name: str,
    role_title: str,
) -> CoverLetterOutput:
    prompt = _build_prompt(resume_sections, analysis, company_name, role_title)
    return call_llm(prompt, CoverLetterOutput)
