"use client";

import { useState, useEffect } from "react";
import {
  analyze,
  rewrite,
  coverLetter,
  interviewPrep,
  exportResume,
  exportCoverLetter,
  AnalysisResult,
  RewriteSuggestion,
  GroundingViolation,
  InterviewQuestion,
  ParagraphGrounding,
} from "@/lib/api";
import { saveApplication, saveRewriteDecisions, TrackedApplication } from "@/lib/tracker";
import ApplicationTracker from "@/app/components/ApplicationTracker";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Tab = "analysis" | "rewrites" | "cover-letter" | "interview";

interface Results {
  analysis?: AnalysisResult;
  resumeText?: string;
  resumeSections?: Record<string, string[]>;
  rewrites?: RewriteSuggestion[];
  groundingViolations?: GroundingViolation[];
  coverLetterDraft?: string;
  coverLetterGrounding?: ParagraphGrounding[];
  interviewQuestions?: InterviewQuestion[];
}

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/auth");
        return;
      }
      setUserEmail(data.user.email ?? null);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  };

  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");

  const [results, setResults] = useState<Results>({});
  const [activeTab, setActiveTab] = useState<Tab>("analysis");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [trackerTick, setTrackerTick] = useState(0);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportResume = async () => {
    if (!results.rewrites || !results.resumeText) return;
    setExporting(true);
    try {
      const accepted = results.rewrites.filter((_, i) => acceptedIndices.has(i));
      const blob = await exportResume(results.resumeText, accepted);
      downloadBlob(blob, "tailored_resume.docx");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleExportCoverLetter = async () => {
    if (!results.coverLetterDraft) return;
    setExporting(true);
    try {
      const blob = await exportCoverLetter(results.coverLetterDraft, companyName, roleTitle);
      downloadBlob(blob, "cover_letter.docx");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const runAnalysis = async () => {
    if (!jd.trim() || (!resumeText.trim() && !resumeFile)) {
      setError("Provide a resume and job description to continue.");
      return;
    }
    setError(null);
    setLoading("Analyzing resume against job description…");
    setResults({});
    setAcceptedIndices(new Set());
    try {
      const data = await analyze(resumeText, jd, resumeFile ?? undefined);
      setResults({ analysis: data.analysis, resumeText: data.resume_text, resumeSections: data.resume_sections });
      setActiveTab("analysis");

      setLoading("Generating rewrites, cover letter, and interview prep…");
      const [rwData, clData, ipData] = await Promise.all([
        rewrite(resumeText, data.analysis),
        companyName && roleTitle
          ? coverLetter(resumeText, data.analysis, companyName, roleTitle)
          : Promise.resolve(null),
        interviewPrep(resumeText, data.analysis),
      ]);

      setResults((prev) => ({
        ...prev,
        rewrites: rwData.rewrites.suggestions,
        groundingViolations: rwData.grounding_violations,
        coverLetterDraft: clData?.cover_letter.cover_letter_draft,
        coverLetterGrounding: clData?.cover_letter.paragraph_grounding,
        interviewQuestions: ipData.interview_prep.questions,
      }));

      const saved = await saveApplication({
        company: companyName,
        role: roleTitle,
        ats_score: data.analysis.ats_score,
        seniority_match: data.analysis.seniority_match,
        jd_summary: data.analysis.jd_summary,
        resume_text: data.resume_text,
        job_description: jd,
      });

      // Persist rewrite decisions if the user already had accepted some
      if (saved && rwData.rewrites.suggestions.length > 0) {
        const decisions = rwData.rewrites.suggestions.map((s, i) => ({
          suggestion_index: i,
          section: s.section,
          original_line: s.original_line,
          suggested_line: s.suggested_line,
          accepted: acceptedIndices.has(i),
        }));
        await saveRewriteDecisions(saved.id, decisions);
      }

      setTrackerTick((t) => t + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(null);
    }
  };

  const handleReload = (app: TrackedApplication) => {
    setResumeText(app.resume_text);
    setResumeFile(null);
    setJd(app.job_description);
    setCompanyName(app.company);
    setRoleTitle(app.role);
    setResults({});
    setAcceptedIndices(new Set());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const tabs: { id: Tab; label: string; available: boolean }[] = [
    { id: "analysis", label: "Analysis", available: !!results.analysis },
    {
      id: "rewrites",
      label: results.groundingViolations?.length ? "Rewrites (warnings)" : "Rewrites",
      available: !!results.rewrites,
    },
    { id: "cover-letter", label: "Cover Letter", available: !!results.coverLetterDraft },
    { id: "interview", label: "Interview Prep", available: !!results.interviewQuestions },
  ];

  const flaggedIndices = new Set(results.groundingViolations?.map((v) => v.suggestion_index) ?? []);

  const scoreColor =
    (results.analysis?.ats_score ?? 0) >= 70
      ? "var(--color-success)"
      : (results.analysis?.ats_score ?? 0) >= 50
      ? "var(--color-warning)"
      : "var(--color-danger)";

  return (
    <>
      {/* Site header */}
      <header style={{ backgroundColor: "var(--color-header)", borderBottom: "1px solid oklch(0.22 0.01 245)" }}>
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span
              className="text-sm font-semibold tracking-tight"
              style={{ color: "var(--color-surface)" }}
            >
              Resume Tailor
            </span>
            <span className="text-sm hidden sm:inline" style={{ color: "var(--color-header-dim)" }}>
              Analysis grounded only in your resume
            </span>
          </div>
          {userEmail && (
            <div className="flex items-center gap-4">
              <span className="text-xs hidden sm:inline" style={{ color: "var(--color-header-dim)" }}>
                {userEmail}
              </span>
              <button
                onClick={handleSignOut}
                className="text-xs font-semibold transition-colors"
                style={{ color: "var(--color-header-dim)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-surface)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-header-dim)"; }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

          {/* Input form */}
          <div
            className="rounded-xl p-6 space-y-5"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            {/* Resume */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "var(--color-ink)" }}
              >
                Resume
              </label>
              <div className="flex items-center gap-3 mb-3">
                <label
                  className="cursor-pointer text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
                  style={{
                    border: "1px solid var(--color-border-strong)",
                    color: "var(--color-ink-muted)",
                    backgroundColor: "var(--color-surface-2)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--color-ink)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--color-ink-muted)";
                  }}
                >
                  Upload PDF or DOCX
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setResumeFile(f);
                      if (f) setResumeText("");
                    }}
                  />
                </label>
                {resumeFile && (
                  <span
                    className="text-sm flex items-center gap-1.5"
                    style={{ color: "var(--color-success)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {resumeFile.name}
                    <button
                      onClick={() => setResumeFile(null)}
                      className="transition-colors"
                      style={{ color: "var(--color-ink-faint)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-ink-muted)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-ink-faint)"; }}
                      aria-label="Remove file"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
              {!resumeFile && (
                <textarea
                  rows={6}
                  placeholder="Or paste your resume as plain text…"
                  className="w-full text-sm rounded-lg px-3 py-2.5 resize-y transition-colors"
                  style={{
                    fontFamily: "var(--font-mono)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-ink)",
                    backgroundColor: "var(--color-surface-2)",
                    outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-accent-subtle)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                />
              )}
            </div>

            {/* Job description */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "var(--color-ink)" }}
              >
                Job Description
              </label>
              <textarea
                rows={6}
                placeholder="Paste the full job description…"
                className="w-full text-sm rounded-lg px-3 py-2.5 resize-y transition-colors"
                style={{
                  border: "1px solid var(--color-border)",
                  color: "var(--color-ink)",
                  backgroundColor: "var(--color-surface-2)",
                  outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-accent-subtle)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </div>

            {/* Company + role */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
                  Company
                  <span className="font-normal ml-1.5 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    for cover letter
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Acme Corp"
                  className="w-full text-sm rounded-lg px-3 py-2 transition-colors"
                  style={{
                    border: "1px solid var(--color-border)",
                    color: "var(--color-ink)",
                    backgroundColor: "var(--color-surface-2)",
                    outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-accent-subtle)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
                  Role
                  <span className="font-normal ml-1.5 text-xs" style={{ color: "var(--color-ink-faint)" }}>
                    for cover letter
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Software Engineer"
                  className="w-full text-sm rounded-lg px-3 py-2 transition-colors"
                  style={{
                    border: "1px solid var(--color-border)",
                    color: "var(--color-ink)",
                    backgroundColor: "var(--color-surface-2)",
                    outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-accent-subtle)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="text-sm rounded-lg px-4 py-3"
                style={{
                  backgroundColor: "var(--color-danger-bg)",
                  color: "var(--color-danger-text)",
                  border: "1px solid oklch(0.85 0.08 25)",
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={runAnalysis}
              disabled={!!loading}
              className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors"
              style={{
                backgroundColor: loading ? "var(--color-accent-subtle)" : "var(--color-accent)",
                color: loading ? "var(--color-accent-text)" : "white",
                cursor: loading ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent-hover)";
              }}
              onMouseLeave={(e) => {
                if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent)";
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin"
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
                    <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {loading}
                </span>
              ) : (
                "Analyze and tailor resume"
              )}
            </button>
          </div>

          {/* Results panel */}
          {results.analysis && (
            <div
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              {/* Tab bar */}
              <div
                className="flex"
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => t.available && setActiveTab(t.id)}
                    className="px-4 py-3 text-sm font-medium transition-colors"
                    style={{
                      borderBottom: activeTab === t.id
                        ? "2px solid var(--color-accent)"
                        : "2px solid transparent",
                      marginBottom: "-1px",
                      color: activeTab === t.id
                        ? "var(--color-accent)"
                        : t.available
                        ? "var(--color-ink-muted)"
                        : "var(--color-ink-faint)",
                      cursor: t.available ? "pointer" : "not-allowed",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
                {loading && (
                  <span
                    className="ml-auto self-center pr-4 text-xs flex items-center gap-1.5"
                    style={{ color: "var(--color-ink-faint)" }}
                  >
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
                      <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Processing…
                  </span>
                )}
              </div>

              <div className="p-6">

                {/* ── Analysis tab ── */}
                {activeTab === "analysis" && results.analysis && (
                  <div className="space-y-6">

                    {/* Score row */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-2">
                          <span
                            className="text-2xl font-bold tabular-nums"
                            style={{ color: scoreColor }}
                          >
                            {results.analysis.ats_score.toFixed(1)}
                          </span>
                          <span className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
                            / 100 ATS score
                          </span>
                        </div>
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-md"
                          style={
                            results.analysis.seniority_match === "match"
                              ? { backgroundColor: "var(--color-success-bg)", color: "var(--color-success-text)" }
                              : results.analysis.seniority_match === "under"
                              ? { backgroundColor: "var(--color-warning-bg)", color: "var(--color-warning-text)" }
                              : { backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent-text)" }
                          }
                        >
                          {results.analysis.seniority_match} seniority
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--color-border)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${results.analysis.ats_score}%`,
                            backgroundColor: scoreColor,
                          }}
                        />
                      </div>
                      <p className="text-xs" style={{ color: "var(--color-ink-faint)" }}>
                        Required keywords weighted 2×. Score computed from your resume, not estimated.
                      </p>
                    </div>

                    {/* JD summary */}
                    <p
                      className="text-sm leading-relaxed rounded-lg px-4 py-3"
                      style={{
                        backgroundColor: "var(--color-surface-2)",
                        color: "var(--color-ink-muted)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      {results.analysis.jd_summary}
                    </p>

                    {/* Keywords grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {results.analysis.matched_keywords.length > 0 && (
                        <div>
                          <h3
                            className="text-sm font-semibold mb-2.5"
                            style={{ color: "var(--color-ink)" }}
                          >
                            Matched ({results.analysis.matched_keywords.length})
                          </h3>
                          <div className="flex flex-wrap gap-1.5">
                            {results.analysis.matched_keywords.map((k) => (
                              <span
                                key={k.keyword}
                                className="text-xs font-medium px-2 py-0.5 rounded"
                                style={{
                                  backgroundColor: "var(--color-success-bg)",
                                  color: "var(--color-success-text)",
                                }}
                                title={k.resume_evidence}
                              >
                                {k.keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.analysis.missing_keywords.length > 0 && (
                        <div>
                          <h3
                            className="text-sm font-semibold mb-2.5"
                            style={{ color: "var(--color-ink)" }}
                          >
                            Missing ({results.analysis.missing_keywords.length})
                          </h3>
                          <div className="space-y-1.5">
                            {results.analysis.missing_keywords.map((k) => (
                              <div key={k.keyword} className="flex items-start gap-2 text-sm">
                                <span
                                  className="text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 mt-px"
                                  style={
                                    k.importance === "required"
                                      ? { backgroundColor: "var(--color-danger-bg)", color: "var(--color-danger-text)" }
                                      : { backgroundColor: "var(--color-warning-bg)", color: "var(--color-warning-text)" }
                                  }
                                >
                                  {k.importance}
                                </span>
                                <span style={{ color: "var(--color-ink)" }}>{k.keyword}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Skill gaps */}
                    {results.analysis.skill_gaps.length > 0 && (
                      <div>
                        <h3
                          className="text-sm font-semibold mb-2.5"
                          style={{ color: "var(--color-ink)" }}
                        >
                          Skill gaps
                        </h3>
                        <div className="space-y-2">
                          {results.analysis.skill_gaps.map((g) => (
                            <div
                              key={g.skill}
                              className="flex items-start gap-3 text-sm rounded-lg px-3 py-2.5"
                              style={{
                                backgroundColor: "var(--color-surface-2)",
                                border: "1px solid var(--color-border)",
                              }}
                            >
                              <span
                                className="font-semibold shrink-0"
                                style={{ color: "var(--color-ink)" }}
                              >
                                {g.skill}
                              </span>
                              <span
                                className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0 mt-px"
                                style={
                                  g.has_adjacent_experience
                                    ? { backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent-text)" }
                                    : { backgroundColor: "var(--color-surface-2)", color: "var(--color-ink-faint)", border: "1px solid var(--color-border)" }
                                }
                              >
                                {g.has_adjacent_experience ? "adjacent experience" : "no adjacent exp"}
                              </span>
                              <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                                {g.notes}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Rewrites tab ── */}
                {activeTab === "rewrites" && results.rewrites && (
                  <div className="space-y-4">
                    {results.groundingViolations && results.groundingViolations.length > 0 && (
                      <div
                        className="rounded-lg px-4 py-3 text-sm"
                        style={{
                          backgroundColor: "var(--color-warning-bg)",
                          border: "1px solid oklch(0.85 0.09 75)",
                        }}
                      >
                        <p className="font-semibold mb-1" style={{ color: "var(--color-warning-text)" }}>
                          Grounding warnings — review before using
                        </p>
                        {results.groundingViolations.map((v) => (
                          <p key={v.suggestion_index} className="text-xs mt-0.5" style={{ color: "var(--color-warning-text)" }}>
                            Suggestion {v.suggestion_index + 1}: introduces {v.ungrounded_terms.join(", ")} not found in your resume
                          </p>
                        ))}
                      </div>
                    )}

                    {results.rewrites.map((s, i) => (
                      <div
                        key={i}
                        className="rounded-lg p-4 space-y-3 cursor-pointer transition-all"
                        style={{
                          border: acceptedIndices.has(i)
                            ? "1px solid oklch(0.70 0.10 160)"
                            : flaggedIndices.has(i)
                            ? "1px solid oklch(0.82 0.09 75)"
                            : "1px solid var(--color-border)",
                          backgroundColor: acceptedIndices.has(i)
                            ? "var(--color-success-bg)"
                            : flaggedIndices.has(i)
                            ? "var(--color-warning-bg)"
                            : "var(--color-surface-2)",
                        }}
                        onClick={() =>
                          setAcceptedIndices((prev) => {
                            const next = new Set(prev);
                            next.has(i) ? next.delete(i) : next.add(i);
                            return next;
                          })
                        }
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={acceptedIndices.has(i)}
                            onChange={() => {}}
                            className="w-4 h-4 rounded"
                            style={{ accentColor: "var(--color-accent)" }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: "var(--color-surface)",
                              color: "var(--color-ink-muted)",
                              border: "1px solid var(--color-border)",
                            }}
                          >
                            {s.section}
                          </span>
                          {flaggedIndices.has(i) && (
                            <span className="text-xs font-semibold" style={{ color: "var(--color-warning-text)" }}>
                              grounding warning
                            </span>
                          )}
                          {acceptedIndices.has(i) && (
                            <span className="text-xs font-semibold ml-auto" style={{ color: "var(--color-success-text)" }}>
                              accepted
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 text-sm">
                          <p
                            className="line-through text-xs leading-relaxed"
                            style={{ color: "var(--color-ink-faint)" }}
                          >
                            {s.original_line}
                          </p>
                          <p className="font-medium leading-relaxed" style={{ color: "var(--color-ink)" }}>
                            {s.suggested_line}
                          </p>
                        </div>
                        <div className="flex items-start gap-4 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                          <span>{s.reason}</span>
                          <span
                            className="shrink-0 ml-auto"
                            style={{ color: "var(--color-accent-text)" }}
                          >
                            grounded in {s.grounded_in}
                          </span>
                        </div>
                      </div>
                    ))}

                    <div className="pt-1 flex items-center gap-4">
                      <button
                        onClick={handleExportResume}
                        disabled={exporting || acceptedIndices.size === 0}
                        className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                        style={{
                          backgroundColor: acceptedIndices.size === 0 ? "var(--color-surface-2)" : "var(--color-accent)",
                          color: acceptedIndices.size === 0 ? "var(--color-ink-faint)" : "white",
                          cursor: acceptedIndices.size === 0 ? "not-allowed" : "pointer",
                          border: acceptedIndices.size === 0 ? "1px solid var(--color-border)" : "none",
                        }}
                        onMouseEnter={(e) => {
                          if (acceptedIndices.size > 0 && !exporting)
                            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent-hover)";
                        }}
                        onMouseLeave={(e) => {
                          if (acceptedIndices.size > 0 && !exporting)
                            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent)";
                        }}
                      >
                        {exporting
                          ? "Exporting…"
                          : acceptedIndices.size === 0
                          ? "Accept suggestions to export"
                          : `Download resume DOCX (${acceptedIndices.size} change${acceptedIndices.size !== 1 ? "s" : ""})`}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Cover letter tab ── */}
                {activeTab === "cover-letter" && results.coverLetterDraft && (
                  <div className="space-y-4">
                    <div
                      className="whitespace-pre-wrap text-sm leading-relaxed rounded-lg px-4 py-4"
                      style={{
                        backgroundColor: "var(--color-surface-2)",
                        color: "var(--color-ink)",
                        border: "1px solid var(--color-border)",
                        lineHeight: "1.75",
                        maxWidth: "65ch",
                      }}
                    >
                      {results.coverLetterDraft}
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleExportCoverLetter}
                        disabled={exporting}
                        className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                        style={{
                          backgroundColor: "var(--color-accent)",
                          color: "white",
                          cursor: exporting ? "not-allowed" : "pointer",
                          opacity: exporting ? 0.6 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (!exporting) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent-hover)";
                        }}
                        onMouseLeave={(e) => {
                          if (!exporting) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent)";
                        }}
                      >
                        {exporting ? "Exporting…" : "Download cover letter DOCX"}
                      </button>
                    </div>
                    {results.coverLetterGrounding && results.coverLetterGrounding.length > 0 && (
                      <div className="pt-1">
                        <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-ink-muted)" }}>
                          Grounding by paragraph
                        </p>
                        <div className="space-y-1">
                          {results.coverLetterGrounding.map((g) => (
                            <p key={g.paragraph_index} className="text-xs" style={{ color: "var(--color-ink-faint)" }}>
                              Para {g.paragraph_index + 1}: {g.grounded_in.join(", ")}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Interview prep tab ── */}
                {activeTab === "interview" && results.interviewQuestions && (
                  <div className="space-y-6">
                    {(["behavioral", "technical", "gap_probe"] as const).map((cat) => {
                      const qs = results.interviewQuestions!.filter((q) => q.category === cat);
                      if (!qs.length) return null;
                      const labels = {
                        behavioral: "Behavioral",
                        technical: "Technical",
                        gap_probe: "Gap probes — expect these",
                      };
                      const styles: Record<string, { bg: string; color: string }> = {
                        behavioral: { bg: "var(--color-accent-subtle)", color: "var(--color-accent-text)" },
                        technical: { bg: "oklch(0.95 0.03 290)", color: "oklch(0.35 0.10 290)" },
                        gap_probe: { bg: "var(--color-warning-bg)", color: "var(--color-warning-text)" },
                      };
                      return (
                        <div key={cat}>
                          <span
                            className="inline-block text-xs font-semibold px-2.5 py-1 rounded-md mb-3"
                            style={styles[cat]}
                          >
                            {labels[cat]}
                          </span>
                          <div className="space-y-2">
                            {qs.map((q, i) => (
                              <details
                                key={i}
                                className="rounded-lg group"
                                style={{
                                  border: "1px solid var(--color-border)",
                                }}
                              >
                                <summary
                                  className="px-4 py-3 text-sm font-medium cursor-pointer list-none flex justify-between items-center gap-3"
                                  style={{ color: "var(--color-ink)" }}
                                >
                                  <span>{q.question}</span>
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                    fill="none"
                                    className="shrink-0 transition-transform group-open:rotate-180"
                                    aria-hidden="true"
                                    style={{ color: "var(--color-ink-faint)" }}
                                  >
                                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </summary>
                                <div
                                  className="px-4 pb-4 pt-3 space-y-3"
                                  style={{ borderTop: "1px solid var(--color-border)" }}
                                >
                                  {q.relevant_resume_points.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--color-ink-muted)" }}>
                                        From your resume
                                      </p>
                                      <ul className="space-y-1">
                                        {q.relevant_resume_points.map((p, j) => (
                                          <li key={j} className="text-xs flex gap-2" style={{ color: "var(--color-ink-muted)" }}>
                                            <span style={{ color: "var(--color-ink-faint)" }}>–</span>
                                            {p}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {q.suggested_talking_points.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--color-ink-muted)" }}>
                                        Talking points
                                      </p>
                                      <ul className="space-y-1">
                                        {q.suggested_talking_points.map((p, j) => (
                                          <li key={j} className="text-xs flex gap-2" style={{ color: "var(--color-ink-muted)" }}>
                                            <span style={{ color: "var(--color-ink-faint)" }}>–</span>
                                            {p}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            </div>
          )}

          <ApplicationTracker onReload={handleReload} refreshTick={trackerTick} />
        </div>
      </main>
    </>
  );
}
