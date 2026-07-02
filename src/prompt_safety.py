"""
Prompt injection mitigation.

User-controlled text (resume, JD, company name) is wrapped in XML-style
delimiters so the LLM can distinguish data from instructions. Common
injection patterns are also stripped before the text is embedded.
"""
from __future__ import annotations

import re

# Patterns that attempt to override or escape the system prompt
_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions?", re.I),
    re.compile(r"disregard\s+(all\s+)?previous\s+instructions?", re.I),
    re.compile(r"you\s+are\s+now\s+", re.I),
    re.compile(r"new\s+instructions?:", re.I),
    re.compile(r"system\s*prompt:", re.I),
    re.compile(r"<\s*/?system\s*>", re.I),
    re.compile(r"<\s*/?instructions?\s*>", re.I),
    re.compile(r"\[\s*INST\s*\]", re.I),
    re.compile(r"###\s*instruction", re.I),
]


def _strip_injection_attempts(text: str) -> str:
    """Remove known prompt-injection phrase patterns."""
    for pattern in _INJECTION_PATTERNS:
        text = pattern.sub("[removed]", text)
    return text


def wrap_user_content(label: str, text: str) -> str:
    """
    Wrap user-supplied text in delimiters that signal to the LLM that this
    is untrusted data, not an instruction. Strips injection patterns first.
    """
    cleaned = _strip_injection_attempts(text)
    return f"<{label}>\n{cleaned}\n</{label}>"
