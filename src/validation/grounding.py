"""
Grounding validation — deterministic code check, no LLM calls.

For each rewrite suggestion, verifies that every noun phrase describing
a skill/tool/technology in suggested_line is traceable back to original_line
or the broader resume_text. Flags violations rather than silently dropping them.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from src.models.rewriter import RewriteSuggestion

# Common English words that may appear capitalized in resume bullets — not tech terms.
# Keep this broad so we only flag things that are genuinely tech-shaped.
_COMMON_WORDS = {
    # articles / prepositions / conjunctions
    "the", "a", "an", "and", "or", "to", "of", "in", "for", "with", "on",
    "at", "by", "from", "into", "onto", "upon", "over", "under", "across",
    "through", "within", "between", "among", "around", "about", "against",
    "as", "if", "so", "but", "nor", "yet", "both", "either", "neither",
    # pronouns
    "this", "that", "these", "those", "my", "your", "our", "their", "its",
    "we", "i", "you", "he", "she", "it", "they", "who", "which", "what",
    # common verbs (action verbs that appear in resume bullets)
    "is", "was", "were", "are", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "use", "used", "using",
    "built", "build", "building", "develop", "developed", "developing",
    "led", "lead", "leading", "work", "worked", "working",
    "design", "designed", "designing",
    "deploy", "deployed", "deploying",
    "create", "created", "creating",
    "implement", "implemented", "implementing",
    "manage", "managed", "managing",
    "drive", "drove", "driven", "driving",
    "reduce", "reduced", "reducing",
    "improve", "improved", "improving",
    "deliver", "delivered", "delivering",
    "support", "supported", "supporting",
    "maintain", "maintained", "maintaining",
    "collaborate", "collaborated", "collaborating",
    # common adjectives / descriptors
    "new", "key", "core", "main", "large", "high", "low", "scalable",
    "efficient", "effective", "robust", "secure", "reliable", "complex",
    "cross", "functional", "technical", "business", "multiple", "various",
    "end", "real", "time", "based", "driven", "first", "second", "third",
    "junior", "senior", "principal", "staff",
    # common nouns that appear in bullets (not tools/tech)
    "team", "teams", "project", "projects", "system", "systems",
    "process", "processes", "product", "products", "feature", "features",
    "solution", "solutions", "service", "services", "platform", "platforms",
    "performance", "experience", "engineer", "engineering", "software",
    "data", "application", "applications", "infrastructure", "architecture",
    "pipeline", "workflow", "stack", "environment", "codebase",
    "stakeholder", "stakeholders", "customer", "customers", "user", "users",
    "requirement", "requirements", "review", "reviews", "meeting", "meetings",
    "milestone", "milestones", "deadline", "deadlines", "release", "releases",
    "sprint", "sprints", "mentor", "mentored", "mentoring",
}


@dataclass
class GroundingViolation:
    suggestion_index: int
    section: str
    original_line: str
    suggested_line: str
    ungrounded_terms: list[str]
    message: str


def _extract_candidate_terms(text: str) -> list[str]:
    """
    Extract terms from text that are likely to be tech/tool names:
    - ALL-CAPS acronyms (API, SQL, AWS)
    - camelCase compound words (FastAPI, PostgreSQL, TypeScript)
    - Dotted identifiers (node.js, v2.0)
    - Multi-word capitalized proper nouns (Apache Kafka)
    - Single capitalized words (Kubernetes, Docker, Python) not in common-words list
    """
    # Multi-word capitalized sequences (e.g., "Apache Kafka", "REST APIs")
    multi_word = re.findall(r'\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]+)+\b', text)

    # ALL-CAPS acronyms
    acronyms = re.findall(r'\b[A-Z]{2,}\b', text)

    # camelCase (contains at least one uppercase letter after the first char)
    camel_case = re.findall(r'\b[A-Z][a-z]+(?:[A-Z][a-z0-9]*)+\b', text)

    # Dotted tech names (node.js, v2.0)
    dotted = re.findall(r'\b\w+\.\w+\b', text)

    # Single capitalized word (potential product/tech name) — len > 4 to reduce noise
    single_cap = re.findall(r'\b[A-Z][a-z]{3,}\b', text)

    candidates = set(multi_word + acronyms + camel_case + dotted + single_cap)
    return [t for t in candidates if t.lower() not in _COMMON_WORDS and len(t) > 2]


def _term_in_text(term: str, text: str) -> bool:
    """Case-insensitive substring check."""
    return term.lower() in text.lower()


def validate_rewrite_suggestions(
    suggestions: list[RewriteSuggestion],
    resume_text: str,
) -> list[GroundingViolation]:
    """
    Check each suggestion: any tech term in suggested_line that doesn't
    appear in original_line OR resume_text is flagged as ungrounded.

    Returns a list of violations (empty = all clear).
    """
    violations: list[GroundingViolation] = []

    for idx, suggestion in enumerate(suggestions):
        candidate_terms = _extract_candidate_terms(suggestion.suggested_line)
        ungrounded: list[str] = []

        for term in candidate_terms:
            in_original = _term_in_text(term, suggestion.original_line)
            in_resume = _term_in_text(term, resume_text)
            if not in_original and not in_resume:
                ungrounded.append(term)

        if ungrounded:
            violations.append(
                GroundingViolation(
                    suggestion_index=idx,
                    section=suggestion.section,
                    original_line=suggestion.original_line,
                    suggested_line=suggestion.suggested_line,
                    ungrounded_terms=ungrounded,
                    message=(
                        f"Suggestion #{idx + 1} in section '{suggestion.section}' "
                        f"introduces term(s) not found in original line or resume: "
                        f"{ungrounded}. This may be a hallucination."
                    ),
                )
            )

    return violations


def format_violations(violations: list[GroundingViolation]) -> str:
    if not violations:
        return ""
    lines = ["GROUNDING WARNINGS — the following suggestions were flagged:\n"]
    for v in violations:
        lines.append(f"  [{v.suggestion_index + 1}] Section: {v.section}")
        lines.append(f"      Ungrounded terms: {v.ungrounded_terms}")
        lines.append(f"      Original:  {v.original_line[:100]}")
        lines.append(f"      Suggested: {v.suggested_line[:100]}")
        lines.append("")
    return "\n".join(lines)
