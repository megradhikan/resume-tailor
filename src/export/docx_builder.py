"""
DOCX export — builds a Word document from a resume with accepted
rewrite suggestions applied, or from a cover letter draft.
"""
from __future__ import annotations

import io
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH


def _add_heading(doc: Document, text: str, level: int = 1) -> None:
    p = doc.add_heading(text, level=level)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT


def build_resume_docx(
    resume_text: str,
    accepted_suggestions: list[dict],
) -> bytes:
    """
    Apply accepted rewrite suggestions to the resume text and export as DOCX.
    Accepted suggestions are applied as line-level replacements.
    Changed lines are highlighted in the document so the user can review them.
    """
    # Build a replacement map: original_line -> suggested_line
    replacements: dict[str, str] = {
        s["original_line"].strip(): s["suggested_line"].strip()
        for s in accepted_suggestions
    }

    doc = Document()
    doc.core_properties.title = "Tailored Resume"

    current_section: str | None = None
    section_keywords = {
        "experience", "education", "skills", "projects",
        "summary", "certifications", "other",
    }

    for raw_line in resume_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        # Detect section headers (short lines that match known section names)
        is_header = (
            len(line) < 60
            and any(kw in line.lower() for kw in section_keywords)
            and line == line  # always true, keeps structure
        )

        # Check if this line has an accepted replacement
        replacement = replacements.get(line)

        if replacement:
            # Write the suggested line, highlighted green
            p = doc.add_paragraph()
            run = p.add_run(replacement)
            run.font.color.rgb = RGBColor(0x16, 0x7A, 0x3E)  # dark green
            run.bold = True
        elif is_header and any(kw in line.lower() for kw in section_keywords):
            doc.add_heading(line, level=2)
        else:
            doc.add_paragraph(line)

    # Legend
    doc.add_paragraph()
    p = doc.add_paragraph()
    run = p.add_run("Note: green lines are accepted rewrite suggestions.")
    run.font.color.rgb = RGBColor(0x16, 0x7A, 0x3E)
    run.italic = True
    run.font.size = Pt(9)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def build_cover_letter_docx(
    cover_letter_draft: str,
    company_name: str = "",
    role_title: str = "",
) -> bytes:
    """Export a cover letter draft as a clean DOCX."""
    doc = Document()
    doc.core_properties.title = f"Cover Letter — {role_title} at {company_name}".strip(" —")

    if company_name or role_title:
        title = f"{role_title} at {company_name}".strip(" at")
        doc.add_heading(title, level=1)
        doc.add_paragraph()

    for para in cover_letter_draft.split("\n\n"):
        text = para.strip()
        if text:
            doc.add_paragraph(text)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
