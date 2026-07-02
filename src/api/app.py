"""
FastAPI application — v1 backend.
Each endpoint is independently callable so the frontend can show
partial results as they stream in rather than blocking on all 4 agents.
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

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
from src.export.docx_builder import build_resume_docx, build_cover_letter_docx
from src.ingestion.parser import parse_resume
from src.models.analyzer import AnalyzerInput
from src.validation.grounding import validate_rewrite_suggestions

load_dotenv()

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

# ── Constants ────────────────────────────────────────────────────────────────

_MAX_TEXT_CHARS = 50_000
_MAX_FILE_BYTES = 5 * 1024 * 1024   # 5 MB
_MAX_SECTIONS = 20                   # max parsed sections returned per resume
_MAX_SECTION_LINES = 200             # max lines per section


# ── Rate limiter ─────────────────────────────────────────────────────────────

def _real_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_real_ip)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.environ.get("GROQ_API_KEY"):
        raise RuntimeError("GROQ_API_KEY not set — set it in .env before starting the server.")
    if os.environ.get("DEBUG", "false").lower() == "true":
        logger.warning("DEBUG=true — Swagger UI is publicly accessible. Do not use in production.")
    yield


# ── App ───────────────────────────────────────────────────────────────────────

_debug = os.environ.get("DEBUG", "false").lower() == "true"

app = FastAPI(
    title="Resume Tailor API",
    version="1.0.0",
    description="Multi-agent resume tailoring.",
    lifespan=lifespan,
    docs_url="/docs" if _debug else None,
    redoc_url="/redoc" if _debug else None,
    openapi_url="/openapi.json" if _debug else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Middleware ────────────────────────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        ip = _real_ip(request)
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000)
        logger.info(
            "%s %s %s — %dms ip=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            ip,
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLoggingMiddleware)

_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
_allow_credentials = "*" not in _origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


# ── Exception handlers ────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "An internal error occurred."})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _truncate_sections(sections: dict[str, list[str]]) -> dict[str, list[str]]:
    """Cap parsed sections so a crafted input can't produce an unbounded response."""
    return {
        k: v[:_MAX_SECTION_LINES]
        for k, v in list(sections.items())[:_MAX_SECTIONS]
    }


def _safe_parse_resume(**kwargs):
    """Wrap parse_resume so library errors become clean 400s, not 500s."""
    try:
        return parse_resume(**kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse the uploaded file.")


# ── /health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


# ── /analyze ──────────────────────────────────────────────────────────────────

@app.post("/analyze", response_model=AnalyzeResponse)
@limiter.limit("5/minute")
async def analyze(
    request: Request,
    job_description: str = Form(...),
    resume_text: str = Form(default=""),
    resume_file: UploadFile | None = File(default=None),
):
    if len(job_description) > _MAX_TEXT_CHARS:
        raise HTTPException(status_code=400, detail=f"job_description exceeds {_MAX_TEXT_CHARS} character limit.")

    if resume_file and resume_file.filename:
        ext = resume_file.filename.rsplit(".", 1)[-1].lower()
        if ext not in ("pdf", "docx", "doc"):
            raise HTTPException(status_code=400, detail="Only PDF and DOCX files are accepted.")
        file_bytes = await resume_file.read(_MAX_FILE_BYTES + 1)
        if len(file_bytes) > _MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail="File exceeds 5 MB limit.")
        parsed = _safe_parse_resume(file_bytes=file_bytes, filename=resume_file.filename)
    elif resume_text.strip():
        if len(resume_text) > _MAX_TEXT_CHARS:
            raise HTTPException(status_code=400, detail=f"resume_text exceeds {_MAX_TEXT_CHARS} character limit.")
        parsed = _safe_parse_resume(text=resume_text)
    else:
        raise HTTPException(status_code=400, detail="Provide either resume_text or resume_file.")

    sections = _truncate_sections(parsed.sections)
    inp = AnalyzerInput(
        resume_text=parsed.text,
        resume_sections=sections,
        job_description=job_description,
    )
    analysis = analyzer_agent.run(inp)
    return AnalyzeResponse(analysis=analysis, resume_sections=sections, resume_text=parsed.text)


# ── /rewrite ──────────────────────────────────────────────────────────────────

@app.post("/rewrite", response_model=RewriteResponse)
@limiter.limit("5/minute")
async def rewrite(request: Request, req: RewriteRequest):
    parsed = _safe_parse_resume(text=req.resume_text)
    sections = _truncate_sections(parsed.sections)
    rewrites = rewriter_agent.run(sections, req.analysis)
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


# ── /cover-letter ─────────────────────────────────────────────────────────────

@app.post("/cover-letter", response_model=CoverLetterResponse)
@limiter.limit("5/minute")
async def cover_letter(request: Request, req: CoverLetterRequest):
    parsed = _safe_parse_resume(text=req.resume_text)
    result = cover_letter_agent.run(
        resume_sections=_truncate_sections(parsed.sections),
        analysis=req.analysis,
        company_name=req.company_name,
        role_title=req.role_title,
    )
    return CoverLetterResponse(cover_letter=result)


# ── /interview-prep ───────────────────────────────────────────────────────────

@app.post("/interview-prep", response_model=InterviewPrepResponse)
@limiter.limit("5/minute")
async def interview_prep(request: Request, req: InterviewPrepRequest):
    parsed = _safe_parse_resume(text=req.resume_text)
    result = interview_prep_agent.run(
        resume_sections=_truncate_sections(parsed.sections),
        analysis=req.analysis,
    )
    return InterviewPrepResponse(interview_prep=result)


# ── Export endpoints ──────────────────────────────────────────────────────────

class AcceptedSuggestion(BaseModel):
    section: str = Field(max_length=100)
    original_line: str = Field(max_length=2000)
    suggested_line: str = Field(max_length=2000)
    reason: str = Field(max_length=1000)
    grounded_in: str = Field(max_length=500)


class ExportResumeRequest(BaseModel):
    resume_text: str = Field(max_length=_MAX_TEXT_CHARS)
    accepted_suggestions: list[AcceptedSuggestion] = Field(max_length=100)


class ExportCoverLetterRequest(BaseModel):
    cover_letter_draft: str = Field(max_length=_MAX_TEXT_CHARS)
    company_name: str = Field(default="", max_length=200)
    role_title: str = Field(default="", max_length=200)


@app.post("/export/resume")
@limiter.limit("10/minute")
async def export_resume(request: Request, req: ExportResumeRequest):
    docx_bytes = build_resume_docx(
        req.resume_text,
        [s.model_dump() for s in req.accepted_suggestions],
    )
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=tailored_resume.docx"},
    )


@app.post("/export/cover-letter")
@limiter.limit("10/minute")
async def export_cover_letter(request: Request, req: ExportCoverLetterRequest):
    docx_bytes = build_cover_letter_docx(
        req.cover_letter_draft, req.company_name, req.role_title
    )
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=cover_letter.docx"},
    )
