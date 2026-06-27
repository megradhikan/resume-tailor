"""
Resume ingestion: extract plain text and attempt section detection
from PDF, DOCX, or raw text inputs.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ParsedResume:
    text: str
    sections: dict[str, list[str]]
    source: str  # "pdf" | "docx" | "text"


# Section header patterns — ordered by priority
_SECTION_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("summary",    re.compile(r"^(summary|objective|profile|about me|professional summary)", re.I)),
    ("experience", re.compile(r"^(work experience|experience|employment history|professional experience|career history)", re.I)),
    ("education",  re.compile(r"^(education|academic background|academic history|degrees?|qualifications?)", re.I)),
    ("skills",     re.compile(r"^(skills?|technical skills?|core competencies|technologies|tools|tech stack)", re.I)),
    ("projects",   re.compile(r"^(projects?|side projects?|personal projects?|notable projects?|open.?source)", re.I)),
    ("certifications", re.compile(r"^(certifications?|licenses?|credentials?|awards?|achievements?)", re.I)),
]


def _detect_sections(lines: list[str]) -> dict[str, list[str]]:
    current_section = "other"
    sections: dict[str, list[str]] = {}

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped:
            continue

        matched_section = None
        for section_name, pattern in _SECTION_PATTERNS:
            if pattern.match(stripped):
                matched_section = section_name
                break

        if matched_section:
            current_section = matched_section
        else:
            sections.setdefault(current_section, []).append(stripped)

    return {k: v for k, v in sections.items() if v}


def parse_text(text: str) -> ParsedResume:
    lines = text.splitlines()
    sections = _detect_sections(lines)
    return ParsedResume(text=text.strip(), sections=sections, source="text")


def parse_pdf(file_bytes: bytes) -> ParsedResume:
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")

    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text(x_tolerance=2, y_tolerance=2)
            if page_text:
                text_parts.append(page_text)

    full_text = "\n".join(text_parts)
    if not full_text.strip():
        raise ValueError("Could not extract text from PDF. The file may be scanned/image-only.")

    lines = full_text.splitlines()
    sections = _detect_sections(lines)
    return ParsedResume(text=full_text.strip(), sections=sections, source="pdf")


def parse_docx(file_bytes: bytes) -> ParsedResume:
    try:
        import mammoth
    except ImportError:
        raise RuntimeError("mammoth not installed. Run: pip install mammoth")

    result = mammoth.extract_raw_text(io.BytesIO(file_bytes))
    full_text = result.value

    if not full_text.strip():
        raise ValueError("Could not extract text from DOCX file.")

    lines = full_text.splitlines()
    sections = _detect_sections(lines)
    return ParsedResume(text=full_text.strip(), sections=sections, source="docx")


def parse_resume(
    *,
    file_bytes: bytes | None = None,
    filename: str | None = None,
    text: str | None = None,
) -> ParsedResume:
    """
    Unified entry point. Accepts either:
    - file_bytes + filename (PDF or DOCX upload)
    - text (plain text paste, v0 path)
    """
    if text is not None:
        return parse_text(text)

    if file_bytes is None or not filename:
        raise ValueError("Provide either text or file_bytes+filename.")

    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return parse_pdf(file_bytes)
    elif ext in (".docx", ".doc"):
        return parse_docx(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Use PDF, DOCX, or paste plain text.")
