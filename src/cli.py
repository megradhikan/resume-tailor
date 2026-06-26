"""
v0 CLI — paste resume text and JD, get analysis + rewrite suggestions.
Usage: python -m src.cli
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich import box

load_dotenv()

console = Console()


# ── Input helpers ────────────────────────────────────────────────────────────

def _read_multiline(prompt: str) -> str:
    """Read multi-line input until the user types END on its own line."""
    console.print(f"\n[bold cyan]{prompt}[/bold cyan]")
    console.print("[dim]Paste your text below. Type [bold]END[/bold] on its own line when done.[/dim]")
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == "END":
            break
        lines.append(line)
    return "\n".join(lines).strip()


def _parse_sections(resume_text: str) -> dict[str, list[str]]:
    """
    Minimal section parser: splits on common header keywords.
    Good enough for v0 plain-text input.
    """
    import re
    headers = {
        "experience": r"(?i)^(work experience|experience|employment|professional experience)",
        "education": r"(?i)^(education|academic background|degrees?)",
        "skills": r"(?i)^(skills?|technical skills?|core competencies|technologies)",
        "projects": r"(?i)^(projects?|side projects?|personal projects?)",
        "summary": r"(?i)^(summary|objective|profile|about)",
    }

    lines = resume_text.splitlines()
    current_section = "other"
    sections: dict[str, list[str]] = {k: [] for k in list(headers.keys()) + ["other"]}

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        matched_section = None
        for section, pattern in headers.items():
            if re.match(pattern, stripped):
                matched_section = section
                break

        if matched_section:
            current_section = matched_section
        else:
            sections[current_section].append(stripped)

    return {k: v for k, v in sections.items() if v}


# ── Output rendering ─────────────────────────────────────────────────────────

def _render_analysis(result) -> None:
    console.print(Rule("[bold green]ANALYSIS RESULT[/bold green]"))

    # ATS score
    score = result.ats_score
    color = "green" if score >= 70 else "yellow" if score >= 50 else "red"
    console.print(
        Panel(
            f"[bold {color}]{score:.1f} / 100[/bold {color}]\n"
            f"[dim]Required keywords weighted 2×, preferred 1×[/dim]",
            title="ATS Score",
            border_style=color,
        )
    )

    # JD summary
    console.print(Panel(result.jd_summary, title="JD Summary", border_style="blue"))

    # Seniority
    seniority_color = {"match": "green", "under": "yellow", "over": "cyan"}
    console.print(
        f"Seniority match: [{seniority_color[result.seniority_match.value]}]"
        f"{result.seniority_match.value.upper()}[/{seniority_color[result.seniority_match.value]}]"
    )

    # Matched keywords
    if result.matched_keywords:
        table = Table(title="Matched Keywords", box=box.SIMPLE_HEAD)
        table.add_column("Keyword", style="green")
        table.add_column("Resume evidence", style="dim")
        for kw in result.matched_keywords:
            table.add_row(kw.keyword, kw.resume_evidence[:80])
        console.print(table)

    # Missing keywords
    if result.missing_keywords:
        table = Table(title="Missing Keywords", box=box.SIMPLE_HEAD)
        table.add_column("Keyword", style="red")
        table.add_column("Importance", style="bold")
        table.add_column("JD evidence", style="dim")
        for kw in result.missing_keywords:
            imp_color = "red" if kw.importance.value == "required" else "yellow"
            table.add_row(
                kw.keyword,
                f"[{imp_color}]{kw.importance.value}[/{imp_color}]",
                kw.jd_evidence[:80],
            )
        console.print(table)

    # Skill gaps
    if result.skill_gaps:
        table = Table(title="Skill Gaps", box=box.SIMPLE_HEAD)
        table.add_column("Skill", style="yellow")
        table.add_column("Adjacent exp?")
        table.add_column("Notes", style="dim")
        for gap in result.skill_gaps:
            table.add_row(
                gap.skill,
                "[green]Yes[/green]" if gap.has_adjacent_experience else "[red]No[/red]",
                gap.notes[:80],
            )
        console.print(table)


def _render_rewrites(output, violations) -> None:
    console.print(Rule("[bold magenta]REWRITE SUGGESTIONS[/bold magenta]"))

    # Show grounding warnings first if any
    if violations:
        console.print(
            Panel(
                "\n".join(
                    f"[yellow]⚠ Suggestion #{v.suggestion_index + 1}[/yellow] "
                    f"[dim]({v.section})[/dim]: introduces unverified term(s): "
                    f"[red]{v.ungrounded_terms}[/red]"
                    for v in violations
                ),
                title="[red]Grounding Warnings[/red]",
                border_style="red",
            )
        )

    flagged_indices = {v.suggestion_index for v in violations}

    for idx, s in enumerate(output.suggestions):
        flag = " [red][FLAGGED][/red]" if idx in flagged_indices else ""
        console.print(
            Panel(
                f"[dim]Section:[/dim] {s.section}\n"
                f"[dim]Original:[/dim]  {s.original_line}\n"
                f"[green]Suggested:[/green] {s.suggested_line}\n"
                f"[dim]Reason:[/dim]   {s.reason}\n"
                f"[dim]Grounded in:[/dim] {s.grounded_in}",
                title=f"Suggestion #{idx + 1}{flag}",
                border_style="red" if idx in flagged_indices else "magenta",
            )
        )


def _dump_json(analysis, rewrites, violations) -> None:
    output = {
        "analysis": analysis.model_dump(),
        "rewrite_suggestions": rewrites.model_dump(),
        "grounding_violations": [
            {
                "suggestion_index": v.suggestion_index,
                "ungrounded_terms": v.ungrounded_terms,
                "message": v.message,
            }
            for v in violations
        ],
    }
    print(json.dumps(output, indent=2))


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    json_mode = "--json" in sys.argv

    if not json_mode:
        console.print(
            Panel(
                "[bold]Resume Tailor v0[/bold]\n"
                "Analyzer + Rewrite Agent pipeline\n"
                "[dim]Uses Groq llama-3.3-70b-versatile[/dim]",
                border_style="cyan",
            )
        )

    resume_text = _read_multiline("Paste your RESUME (plain text):")
    if not resume_text:
        console.print("[red]Error: resume text is empty.[/red]")
        sys.exit(1)

    jd_text = _read_multiline("Paste the JOB DESCRIPTION:")
    if not jd_text:
        console.print("[red]Error: job description is empty.[/red]")
        sys.exit(1)

    resume_sections = _parse_sections(resume_text)

    if not json_mode:
        console.print("\n[dim]Running Analyzer Agent...[/dim]")

    from src.models.analyzer import AnalyzerInput
    from src.agents import analyzer as analyzer_agent
    from src.agents import rewriter as rewriter_agent
    from src.validation.grounding import validate_rewrite_suggestions, format_violations

    analyzer_input = AnalyzerInput(
        resume_text=resume_text,
        resume_sections=resume_sections,
        job_description=jd_text,
    )

    analysis = analyzer_agent.run(analyzer_input)

    if not json_mode:
        console.print("[dim]Running Rewrite Agent...[/dim]")

    rewrites = rewriter_agent.run(resume_sections, analysis)
    violations = validate_rewrite_suggestions(rewrites.suggestions, resume_text)

    if json_mode:
        _dump_json(analysis, rewrites, violations)
    else:
        _render_analysis(analysis)
        _render_rewrites(rewrites, violations)

        if violations:
            console.print(
                f"\n[yellow]{len(violations)} suggestion(s) flagged by grounding check.[/yellow] "
                "Review them carefully before use."
            )
        else:
            console.print("\n[green]All suggestions passed grounding check.[/green]")


if __name__ == "__main__":
    main()
