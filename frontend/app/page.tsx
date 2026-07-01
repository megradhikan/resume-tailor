"use client";

import { useState } from "react";
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
import { saveApplication, TrackedApplication } from "@/lib/tracker";
import ApplicationTracker from "@/app/components/ApplicationTracker";

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
      setError("Please provide a resume and job description.");
      return;
    }
    setError(null);
    setLoading("Analyzing resume against JD…");
    setResults({});
    setAcceptedIndices(new Set());
    try {
      const data = await analyze(resumeText, jd, resumeFile ?? undefined);
      setResults({ analysis: data.analysis, resumeText, resumeSections: data.resume_sections });
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

      saveApplication({
        company: companyName,
        role: roleTitle,
        ats_score: data.analysis.ats_score,
        seniority_match: data.analysis.seniority_match,
        jd_summary: data.analysis.jd_summary,
        resume_text: resumeText,
        job_description: jd,
      });
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
    { id: "rewrites", label: `Rewrites${results.groundingViolations?.length ? " ⚠" : ""}`, available: !!results.rewrites },
    { id: "cover-letter", label: "Cover Letter", available: !!results.coverLetterDraft },
    { id: "interview", label: "Interview Prep", available: !!results.interviewQuestions },
  ];

  const flaggedIndices = new Set(results.groundingViolations?.map((v) => v.suggestion_index) ?? []);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Resume Tailor</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Multi-agent resume analysis — no experience is ever fabricated.
        </p>

        {/* Input form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 space-y-5">
          {/* Resume input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resume</label>
            <div className="flex gap-3 mb-2">
              <label className="cursor-pointer px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Upload PDF / DOCX
                <input
                  type="file"
                  accept=".pdf,.docx,.doc"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setResumeFile(f);
                    if (f) setResumeText("");
                  }}
                />
              </label>
              {resumeFile && (
                <span className="text-sm text-green-600 self-center">
                  {resumeFile.name}
                  <button className="ml-2 text-gray-400 hover:text-gray-600" onClick={() => setResumeFile(null)}>✕</button>
                </span>
              )}
            </div>
            {!resumeFile && (
              <textarea
                rows={6}
                placeholder="Or paste plain text resume here…"
                className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
              />
            )}
          </div>

          {/* JD */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
            <textarea
              rows={6}
              placeholder="Paste the full job description…"
              className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
          </div>

          {/* Company / role for cover letter */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company name <span className="text-gray-400">(for cover letter)</span>
              </label>
              <input
                type="text"
                placeholder="Acme Corp"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role title <span className="text-gray-400">(for cover letter)</span>
              </label>
              <input
                type="text"
                placeholder="Software Engineer"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

          <button
            onClick={runAnalysis}
            disabled={!!loading}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ?? "Analyze & Tailor"}
          </button>
        </div>

        {/* Results */}
        {results.analysis && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => t.available && setActiveTab(t.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === t.id
                      ? "border-indigo-600 text-indigo-600"
                      : t.available
                      ? "border-transparent text-gray-500 hover:text-gray-700"
                      : "border-transparent text-gray-300 cursor-not-allowed"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              {loading && (
                <span className="ml-auto self-center pr-4 text-xs text-gray-400 animate-pulse">
                  {loading}
                </span>
              )}
            </div>

            <div className="p-6">
              {/* Analysis tab */}
              {activeTab === "analysis" && results.analysis && (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`text-4xl font-bold ${
                        results.analysis.ats_score >= 70
                          ? "text-green-600"
                          : results.analysis.ats_score >= 50
                          ? "text-yellow-500"
                          : "text-red-500"
                      }`}
                    >
                      {results.analysis.ats_score.toFixed(1)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">ATS Score / 100</div>
                      <div className="text-xs text-gray-400">Required keywords weighted 2×</div>
                    </div>
                    <div className="ml-auto">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          results.analysis.seniority_match === "match"
                            ? "bg-green-100 text-green-700"
                            : results.analysis.seniority_match === "under"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {results.analysis.seniority_match.toUpperCase()} seniority
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{results.analysis.jd_summary}</p>

                  {results.analysis.matched_keywords.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Matched Keywords ({results.analysis.matched_keywords.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {results.analysis.matched_keywords.map((k) => (
                          <span
                            key={k.keyword}
                            className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full"
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
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Missing Keywords ({results.analysis.missing_keywords.length})
                      </h3>
                      <div className="space-y-1">
                        {results.analysis.missing_keywords.map((k) => (
                          <div key={k.keyword} className="flex items-start gap-2 text-sm">
                            <span
                              className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${
                                k.importance === "required"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {k.importance}
                            </span>
                            <span className="text-gray-800 font-medium">{k.keyword}</span>
                            <span className="text-gray-400 text-xs">{k.jd_evidence.slice(0, 80)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.analysis.skill_gaps.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Skill Gaps</h3>
                      <div className="space-y-2">
                        {results.analysis.skill_gaps.map((g) => (
                          <div
                            key={g.skill}
                            className="flex items-start gap-2 text-sm border border-gray-100 rounded-lg p-2"
                          >
                            <span className="font-medium text-gray-800 shrink-0">{g.skill}</span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                g.has_adjacent_experience
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {g.has_adjacent_experience ? "adjacent exp" : "no adjacent exp"}
                            </span>
                            <span className="text-gray-500 text-xs">{g.notes}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Rewrites tab */}
              {activeTab === "rewrites" && results.rewrites && (
                <div className="space-y-4">
                  {results.groundingViolations && results.groundingViolations.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                      <p className="font-medium text-red-700 mb-1">⚠ Grounding warnings — review before using:</p>
                      {results.groundingViolations.map((v) => (
                        <p key={v.suggestion_index} className="text-red-600 text-xs">
                          #{v.suggestion_index + 1}: introduces {v.ungrounded_terms.join(", ")} not found in your resume
                        </p>
                      ))}
                    </div>
                  )}
                  {results.rewrites.map((s, i) => (
                    <div
                      key={i}
                      className={`border rounded-lg p-4 space-y-2 cursor-pointer transition-colors ${
                        acceptedIndices.has(i)
                          ? "border-green-400 bg-green-50"
                          : flaggedIndices.has(i)
                          ? "border-red-200 bg-red-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
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
                          className="w-4 h-4 accent-green-600"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {s.section}
                        </span>
                        {flaggedIndices.has(i) && (
                          <span className="text-xs font-medium text-red-600">⚠ flagged</span>
                        )}
                        {acceptedIndices.has(i) && (
                          <span className="text-xs font-medium text-green-600 ml-auto">✓ accepted</span>
                        )}
                      </div>
                      <div className="text-sm">
                        <p className="text-gray-400 line-through">{s.original_line}</p>
                        <p className="text-gray-900 font-medium mt-1">{s.suggested_line}</p>
                      </div>
                      <p className="text-xs text-gray-500">{s.reason}</p>
                      <p className="text-xs text-indigo-500">Grounded in: {s.grounded_in}</p>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center gap-3">
                    <button
                      onClick={handleExportResume}
                      disabled={exporting || acceptedIndices.size === 0}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {exporting ? "Exporting…" : `Export Resume DOCX (${acceptedIndices.size} accepted)`}
                    </button>
                    {acceptedIndices.size === 0 && (
                      <p className="text-xs text-gray-400">Check suggestions above to accept them</p>
                    )}
                  </div>
                </div>
              )}

              {/* Cover letter tab */}
              {activeTab === "cover-letter" && results.coverLetterDraft && (
                <div className="space-y-4">
                  <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-lg p-4 bg-gray-50">
                    {results.coverLetterDraft}
                  </div>
                  <button
                    onClick={handleExportCoverLetter}
                    disabled={exporting}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {exporting ? "Exporting…" : "Download Cover Letter DOCX"}
                  </button>
                  {results.coverLetterGrounding && results.coverLetterGrounding.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Paragraph grounding
                      </h3>
                      <div className="space-y-1">
                        {results.coverLetterGrounding.map((g) => (
                          <p key={g.paragraph_index} className="text-xs text-gray-500">
                            Para {g.paragraph_index + 1}: {g.grounded_in.join(", ")}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Interview prep tab */}
              {activeTab === "interview" && results.interviewQuestions && (
                <div className="space-y-6">
                  {(["behavioral", "technical", "gap_probe"] as const).map((cat) => {
                    const qs = results.interviewQuestions!.filter((q) => q.category === cat);
                    if (!qs.length) return null;
                    const labels = {
                      behavioral: "Behavioral",
                      technical: "Technical",
                      gap_probe: "Gap Probes (expect these)",
                    };
                    const colors = {
                      behavioral: "bg-blue-100 text-blue-700",
                      technical: "bg-purple-100 text-purple-700",
                      gap_probe: "bg-orange-100 text-orange-700",
                    };
                    return (
                      <div key={cat}>
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mb-3 ${colors[cat]}`}>
                          {labels[cat]}
                        </span>
                        <div className="space-y-3">
                          {qs.map((q, i) => (
                            <details key={i} className="border border-gray-200 rounded-lg group">
                              <summary className="p-3 text-sm font-medium cursor-pointer list-none flex justify-between items-center">
                                {q.question}
                                <span className="text-gray-400 ml-2 shrink-0">▾</span>
                              </summary>
                              <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
                                {q.relevant_resume_points.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-500 mb-1">Relevant resume points:</p>
                                    <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside">
                                      {q.relevant_resume_points.map((p, j) => <li key={j}>{p}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {q.suggested_talking_points.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-500 mb-1">Talking points:</p>
                                    <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside">
                                      {q.suggested_talking_points.map((p, j) => <li key={j}>{p}</li>)}
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
  );
}
