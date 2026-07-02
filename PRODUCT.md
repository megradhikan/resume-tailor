# Product

## Register

product

## Users

Job seekers (primarily software engineers and other technical roles) tailoring their resume to a specific job description. They use this during an active job search, usually late evening at a desk, under cognitive load. They need speed, clarity, and trust in the output. They are skeptical of AI tools that fabricate or embellish.

## Product Purpose

Resume Tailor analyzes a resume against a job description using a multi-agent pipeline (analyzer, rewriter, cover letter, interview prep). It produces ATS keyword scores, grounded rewrite suggestions, a cover letter draft, and interview prep questions. The single hardest constraint: every suggestion must be traceable to something already in the resume. Nothing is invented.

## Brand Personality

Precise, honest, understated. The tool earns trust by being explicit about what it does not do.

## Anti-references

- Generic indigo-on-white SaaS templates (the 2024-era "build in a weekend" look)
- Warm-cream editorial AI tools (the 2026-era sand/paper background reflex)
- Dark "hacker terminal" job tools (the first anti-reflex for this category)
- Hero-metric dashboards with giant floating numbers
- AI-generated copy with "seamless", "empower", "supercharge"

## Design Principles

1. **The output earns the trust, not the UI.** Design steps back; analysis and suggestions are the product.
2. **Every label means exactly what it says.** No jargon, no softening language, no hedging qualifiers.
3. **State is always visible.** Loading, error, accepted, flagged: the user always knows where they are.
4. **Density without clutter.** Job seekers scan fast. Information should be dense but legible, not spaced for marketing optics.
5. **Restraint over decoration.** One accent color, one weight for emphasis, nothing else.

## Accessibility & Inclusion

WCAG AA minimum. Focus rings on all interactive elements. `prefers-reduced-motion` supported. Color never the sole carrier of meaning (icons or labels always accompany semantic color).
