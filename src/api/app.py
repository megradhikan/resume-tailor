"""
FastAPI application — v1 backend.
Each endpoint is independently callable so the frontend can show
partial results as they stream in rather than blocking on all 4 agents.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from src.agents import analyzer as analyzer_agent
from src.agents import rewriter as rewriter_agent
from src.agents import cover_letter as cover_letter_agent
from src.agents import interview_prep as interview_prep_agent
from src.api.schemas import (
    AnalyzeResponse,
    RewriteRequest, RewriteResponse,
    CoverLetterRequest, CoverLetterResponse,
    InterviewPrepRequest, InterviewPrepResponse,
)
from src.ingestion.parser import parse_resume
from src.models.analyzer import AnalyzerInput
from src.validation.grounding import validate_rewrite_suggestions

load_dotenv()

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate API key at startup
    if not os.environ.get("GROQ_API_KEY"):
        raise RuntimeError("GROQ_API_KEY not set — set it in .env before starting the server.")
    yield


app = FastAPI(
    title="Resume Tailor API",
    version="1.0.0",
    description="Multi-agent resume tailoring — analysis, rewrites, cover letters, interview prep.",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/analyze", response_model=AnalyzeResponse)
@limiter.limit("10/minute")
async def analyze(
    request: Request,
    job_description: str = Form(...),
    resume_text: str = Form(default=""),
    resume_file: UploadFile | None = File(default=None),
):
    """
    Run the Analyzer Agent. Accepts either plain text or a PDF/DOCX file upload.
    Returns AnalysisResult + parsed resume sections (needed for downstream endpoints).
    """
    if resume_file and resume_file.filename:
        file_bytes = await resume_file.read()
        parsed = parse_resume(file_bytes=file_bytes, filename=resume_file.filename)
    elif resume_text.strip():
        parsed = parse_resume(text=resume_text)
    else:
        raise HTTPException(status_code=400, detail="Provide either resume_text or resume_file.")

    inp = AnalyzerInput(
        resume_text=parsed.text,
        resume_sections=parsed.sections,
        job_description=job_description,
    )
    analysis = analyzer_agent.run(inp)
    return AnalyzeResponse(analysis=analysis, resume_sections=parsed.sections)


@app.post("/rewrite", response_model=RewriteResponse)
@limiter.limit("10/minute")
async def rewrite(request: Request, req: RewriteRequest):
    """
    Run the Rewrite Agent. Requires analysis from /analyze.
    Returns line-level suggestions with grounding violation flags.
    """
    parsed = parse_resume(text=req.resume_text)
    rewrites = rewriter_agent.run(parsed.sections, req.analysis)
    violations = validate_rewrite_suggestions(rewrites.suggestions, parsed.text)
    return RewriteResponse(
        rewrites=rewrites,
        grounding_violations=[
            {
                "suggestion_index": v.suggestion_index,
                "ungrounded_terms": v.ungrounded_terms,
                "message": v.message,
            }
            for v in violations
        ],
    )


@app.post("/cover-letter", response_model=CoverLetterResponse)
@limiter.limit("10/minute")
async def cover_letter(request: Request, req: CoverLetterRequest):
    """Run the Cover Letter Agent. Requires analysis from /analyze."""
    parsed = parse_resume(text=req.resume_text)
    result = cover_letter_agent.run(
        resume_sections=parsed.sections,
        analysis=req.analysis,
        company_name=req.company_name,
        role_title=req.role_title,
    )
    return CoverLetterResponse(cover_letter=result)


@app.post("/interview-prep", response_model=InterviewPrepResponse)
@limiter.limit("10/minute")
async def interview_prep(request: Request, req: InterviewPrepRequest):
    """Run the Interview Prep Agent. Requires analysis from /analyze."""
    parsed = parse_resume(text=req.resume_text)
    result = interview_prep_agent.run(
        resume_sections=parsed.sections,
        analysis=req.analysis,
    )
    return InterviewPrepResponse(interview_prep=result)
