# Resume Tailor

A multi-agent system that analyzes your resume against a job description and suggests targeted, grounded rewrites — without ever fabricating experience you don't have.

## v0 — MVP

**What it does:**
- **Analyzer Agent**: compares your resume to a JD, extracts matched/missing keywords, flags skill gaps, computes an explainable ATS score
- **Rewrite Agent**: suggests line-level edits (not a full rewrite) grounded in your actual resume text
- **Grounding Validation**: deterministic code check that flags any suggestion introducing a term not found in your resume

**What it doesn't do (yet):** file upload, cover letter, interview prep, persistence, auth.

## Setup

```bash
git clone ...
cd resume-tailor
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Add your Groq API key to .env (free at console.groq.com, no credit card)
```

## Usage

```bash
# Rich terminal output
python3 -m src.cli

# Raw JSON output (pipe-friendly)
python3 -m src.cli --json
```

Paste your resume text, type `END`, paste the JD, type `END`. Results appear immediately.

## ATS Score formula

```
score = 100 × (matched_keywords) / (matched + missing_required×2 + missing_preferred×1)
```

Required keywords are weighted 2× preferred. Computed in code after the LLM extracts the keyword lists — not an opaque LLM-generated number.

## Tests

```bash
python3 -m pytest tests/ -v
```

13 unit tests covering the ATS score formula and grounding validation — no LLM calls needed.

## Architecture

```
resume_text + job_description
        │
        ▼
  Analyzer Agent  ──▶  AnalysisResult (matched/missing keywords, ats_score, gaps)
        │
        ▼
  Rewrite Agent   ──▶  RewriteOutput (line-level suggestions with grounding refs)
        │
        ▼
  Grounding Check ──▶  flags any suggestion adding terms not in original resume
```

All LLM calls go through `src/llm_client.py` — one file to swap providers.

## Versions

| Version | Status | Description |
|---------|--------|-------------|
| v0 | current | CLI, plain text, Analyzer + Rewrite agents |
| v1 | planned | PDF/DOCX upload, Cover Letter + Interview Prep agents, web UI |
| v2 | planned | Auth, persistence, application tracker, export |
| v3 | planned | Eval harness, observability, batch JD processing |
