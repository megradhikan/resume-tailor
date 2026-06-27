# Resume Tailor

A multi-agent system that analyzes your resume against a job description and produces: a gap analysis, targeted rewrite suggestions, a cover letter draft, and interview prep questions — without ever fabricating experience you don't have.

## Architecture

```
resume (PDF/DOCX/text) + job description
        │
        ▼
  Analyzer Agent  ──▶  AnalysisResult (matched/missing keywords, ats_score, skill gaps)
        │
        ├──────────────────────────────┐────────────────────────────┐
        ▼                              ▼                            ▼
  Rewrite Agent              Cover Letter Agent          Interview Prep Agent
  (line-level diffs)         (grounded draft)            (behavioral/technical/gap_probe)
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
pip install -r requirements.txt
cp .env.example .env
# Add GROQ_API_KEY to .env (free at console.groq.com)

# Start backend
uvicorn src.api.app:app --reload

# Frontend (new terminal)
cd frontend
cp .env.local.example .env.local
npm install && npm run dev
# → http://localhost:3000
```

## CLI (v0, still works)

```bash
source .venv/bin/activate
python3 -m src.cli           # rich output
python3 -m src.cli --json    # raw JSON
```

## Tests

```bash
python3 -m pytest tests/ -v   # 13 unit tests, no LLM calls
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
| v1.0.0 | current | PDF/DOCX upload, all 4 agents, FastAPI + Next.js, Docker |
| v2 | planned | Auth, persistence, application tracker, DOCX export |
| v3 | planned | Eval harness, observability, batch JD processing |
