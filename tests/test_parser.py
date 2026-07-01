"""Unit tests for resume ingestion/parsing — no LLM or file I/O dependencies."""
import pytest
from src.ingestion.parser import parse_resume, parse_text, _detect_sections, ParsedResume


SAMPLE_RESUME = """Jane Doe
jane@example.com | (555) 123-4567

Summary
Experienced software engineer with 5 years building Python microservices.

Experience
Senior Software Engineer — Acme Corp (2021–present)
- Built REST APIs with FastAPI and PostgreSQL
- Deployed services on AWS using Docker and Kubernetes

Software Engineer — Beta Inc (2019–2021)
- Worked on Python Django backend
- Reduced API latency by 40%

Education
B.S. Computer Science — State University (2019)

Skills
Python, FastAPI, PostgreSQL, AWS, Docker, Kubernetes, Git

Projects
Open Source CLI Tool — github.com/jane/tool
- Python CLI for automating deployments
"""


def test_parse_text_returns_parsed_resume():
    result = parse_text(SAMPLE_RESUME)
    assert isinstance(result, ParsedResume)
    assert result.source == "text"
    assert result.text.strip() != ""


def test_parse_text_extracts_experience_section():
    result = parse_text(SAMPLE_RESUME)
    assert "experience" in result.sections
    exp_lines = result.sections["experience"]
    assert any("FastAPI" in line for line in exp_lines)


def test_parse_text_extracts_skills_section():
    result = parse_text(SAMPLE_RESUME)
    assert "skills" in result.sections
    skills = result.sections["skills"]
    assert any("Python" in s for s in skills)


def test_parse_text_extracts_education_section():
    result = parse_text(SAMPLE_RESUME)
    assert "education" in result.sections


def test_parse_text_extracts_projects_section():
    result = parse_text(SAMPLE_RESUME)
    assert "projects" in result.sections


def test_parse_resume_with_text_kwarg():
    result = parse_resume(text=SAMPLE_RESUME)
    assert result.source == "text"
    assert "Python" in result.text


def test_parse_resume_raises_without_args():
    with pytest.raises((ValueError, TypeError)):
        parse_resume()


def test_parse_resume_raises_on_unsupported_extension():
    with pytest.raises(ValueError, match="Unsupported"):
        parse_resume(file_bytes=b"data", filename="resume.txt")


def test_detect_sections_empty_input():
    sections = _detect_sections([])
    assert sections == {}


def test_detect_sections_no_headers():
    lines = ["Just a line", "Another line without headers"]
    sections = _detect_sections(lines)
    # All lines fall under "other"
    assert "other" in sections
    assert len(sections["other"]) == 2


def test_detect_sections_recognises_all_patterns():
    lines = [
        "Summary", "I am a developer.",
        "Experience", "Did things.",
        "Education", "Got a degree.",
        "Skills", "Python, Go",
        "Projects", "Built stuff.",
        "Certifications", "AWS Cert.",
    ]
    sections = _detect_sections(lines)
    for key in ("summary", "experience", "education", "skills", "projects", "certifications"):
        assert key in sections, f"Missing section: {key}"


def test_empty_resume_text():
    result = parse_text("   \n  \n  ")
    assert result.text == ""
    assert result.sections == {}


def test_resume_text_preserved():
    text = "Jane Doe\nSoftware Engineer"
    result = parse_text(text)
    assert result.text == text.strip()
