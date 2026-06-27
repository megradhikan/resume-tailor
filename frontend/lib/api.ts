const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface MatchedKeyword {
  keyword: string;
  resume_evidence: string;
}

export interface MissingKeyword {
  keyword: string;
  importance: "required" | "preferred";
  jd_evidence: string;
}

export interface SkillGap {
  skill: string;
  has_adjacent_experience: boolean;
  notes: string;
  resume_section_ref: string;
}

export interface AnalysisResult {
  matched_keywords: MatchedKeyword[];
  missing_keywords: MissingKeyword[];
  skill_gaps: SkillGap[];
  ats_score: number;
  jd_summary: string;
  seniority_match: "under" | "match" | "over";
}

export interface RewriteSuggestion {
  section: string;
  original_line: string;
  suggested_line: string;
  reason: string;
  grounded_in: string;
}

export interface GroundingViolation {
  suggestion_index: number;
  ungrounded_terms: string[];
  message: string;
}

export interface InterviewQuestion {
  question: string;
  category: "behavioral" | "technical" | "gap_probe";
  relevant_resume_points: string[];
  suggested_talking_points: string[];
}

export interface ParagraphGrounding {
  paragraph_index: number;
  grounded_in: string[];
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function analyze(
  resumeText: string,
  jobDescription: string,
  resumeFile?: File
): Promise<{ analysis: AnalysisResult; resume_sections: Record<string, string[]>; resume_text: string }> {
  const form = new FormData();
  form.append("job_description", jobDescription);
  if (resumeFile) {
    form.append("resume_file", resumeFile);
    form.append("resume_text", "");
  } else {
    form.append("resume_text", resumeText);
  }

  const res = await fetch(`${API_URL}/analyze`, { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Analysis failed");
  const data = await res.json();
  return { ...data, resume_text: resumeText };
}

export async function rewrite(
  resumeText: string,
  analysis: AnalysisResult
): Promise<{ rewrites: { suggestions: RewriteSuggestion[] }; grounding_violations: GroundingViolation[] }> {
  const res = await fetch(`${API_URL}/rewrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume_text: resumeText, analysis }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Rewrite failed");
  return res.json();
}

export async function coverLetter(
  resumeText: string,
  analysis: AnalysisResult,
  companyName: string,
  roleTitle: string
): Promise<{ cover_letter: { cover_letter_draft: string; paragraph_grounding: ParagraphGrounding[] } }> {
  const res = await fetch(`${API_URL}/cover-letter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume_text: resumeText, analysis, company_name: companyName, role_title: roleTitle }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Cover letter failed");
  return res.json();
}

export async function interviewPrep(
  resumeText: string,
  analysis: AnalysisResult
): Promise<{ interview_prep: { questions: InterviewQuestion[] } }> {
  const res = await fetch(`${API_URL}/interview-prep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume_text: resumeText, analysis }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Interview prep failed");
  return res.json();
}
