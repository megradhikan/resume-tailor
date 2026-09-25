# Resume Tailor

[![Tests](https://github.com/megradhikan/resume-tailor/actions/workflows/tests.yml/badge.svg)](https://github.com/megradhikan/resume-tailor/actions/workflows/tests.yml)

A multi-agent system that analyzes your resume against a job description and produces a gap analysis, targeted rewrite suggestions, a cover letter draft, and interview prep.

**The constraint that shapes everything else: nothing is invented.** Every rewrite, every cover letter sentence, every interview talking point has to be traceable back to something already on your resume. That's enforced by a deterministic grounding check that runs in code after the LLM output — not a prompt asking the model to behave. See [PRODUCT.md](PRODUCT.md) for the fuller design rationale (users, brand principles, anti-references).

**Live:** [resume-tailor-mauve-omega.vercel.app](https://resume-tailor-mauve-omega.vercel.app) — the demo includes a **"See a sample"** button that loads a precomputed example with no backend call, so it's explorable even if the free-tier backend is asleep or unreachable.

---

## Screenshots

### Input
Paste resume text or upload a PDF/DOCX. Add a job description plus company and role for cover letter generation.

![Input form](docs/screenshots/01-input-form.png)

### ATS Analysis
Computed ATS score (not LLM-estimated), seniority match, matched/missing keyword grid, and skill gap breakdown with adjacency signals.

![Analysis tab](docs/screenshots/02-analysis.png)

### Rewrite Suggestions
Line-level diff view — strikethrough original, bolded suggestion, reason, and grounding source. Select suggestions to include in a DOCX export.

![Rewrites tab](docs/screenshots/03-rewrites.png)

### Cover Letter
Full draft grounded in your resume sections, with per-paragraph source attribution and DOCX export.

![Cover letter tab](docs/screenshots/04-cover-letter.png)

### Interview Prep
Questions categorized as behavioral, technical, or gap probe (flagged gaps the interviewer is likely to probe). Each question expands with talking points anchored to your resume.

![Interview prep tab](docs/screenshots/05-interview-prep.png)

### Application Tracker
Locally-persisted table of every analysis run — ATS score, seniority fit, status (saved / applied / rejected), and a Load button to pull any past run back into the form.

![Application tracker](docs/screenshots/06-tracker.png)

---

## Architecture

```
resume (PDF/DOCX/text) + job description
        │
        ▼
  Analyzer Agent  ──▶  AnalysisResult (matched/missing keywords, ats_score, skill gaps)
        │
        ├──────────────────────────┬────────────────────────────┐
        ▼                          ▼                            ▼
  Rewrite Agent          Cover Letter Agent          Interview Prep Agent
  (line-level diffs)     (grounded draft)            (behavioral/technical/gap_probe)
        │
        ▼
  Grounding Check (deterministic — no LLM)
```

All LLM calls go through `src/llm_client.py` — one file to swap providers (currently Groq llama-3.3-70b-versatile).

## ATS Score formula

```
score = 100 × matched / (matched + missing_required×2 + missing_preferred×1)
```

Computed in code after the LLM extracts keyword lists — not an opaque LLM-generated number.

## Setup (local)

```bash
git clone https://github.com/megradhikan/resume-tailor
cd resume-tailor

# Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt   # prod deps + pytest
cp .env.example .env
# Add GROQ_API_KEY to .env (free at console.groq.com)

# Run tests
pytest tests/

# Start backend
uvicorn src.api.app:app --reload

# Frontend (new terminal)
cd frontend
cp .env.local.example .env.local
npm install && npm run dev
# → http://localhost:3000
```

### Full-stack with Docker Compose

```bash
cp .env.example .env          # add GROQ_API_KEY
docker compose up --build
# backend → http://localhost:8000
# frontend → http://localhost:3000
```

## CLI (v0, still works)

```bash
source .venv/bin/activate
python3 -m src.cli           # rich output
python3 -m src.cli --json    # raw JSON
```

## Tests

```bash
python3 -m pytest tests/ -v   # 92 unit/integration tests, no LLM calls — runs in CI on every push
```

## Deployment

**Backend → Railway**
1. Connect the repo in Railway
2. Set `GROQ_API_KEY` and `ALLOWED_ORIGINS` env vars
3. Railway picks up `railway.toml` automatically — uses the `Dockerfile`

**Frontend → Vercel**
1. Import the repo, set root directory to `frontend/`
2. Set `NEXT_PUBLIC_API_URL` to your Railway backend URL

## Versions

| Version | Status | Description |
|---------|--------|-------------|
| v0.1.0 | released | CLI, plain text, Analyzer + Rewrite agents |
| v1.0.0 | released | PDF/DOCX upload, all 4 agents, FastAPI + Next.js, Docker |
| v2.0.0 | current | Redesigned UI, application tracker, DOCX export, grounding validation |
| v3 | planned | Eval harness, observability, batch JD processing |
