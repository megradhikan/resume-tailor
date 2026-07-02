/**
 * Application tracker — persists to Supabase (applications table).
 */

import { createClient } from "@/lib/supabase";

export type ApplicationStatus = "saved" | "applied" | "interviewing" | "rejected" | "offer";

const VALID_STATUSES: ApplicationStatus[] = ["saved", "applied", "interviewing", "rejected", "offer"];

export interface TrackedApplication {
  id: string;
  company: string;
  role: string;
  date: string;           // ISO string (maps to created_at)
  ats_score: number;
  seniority_match: string;
  jd_summary: string;
  status: ApplicationStatus;
  resume_text: string;
  job_description: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidStatus(s: unknown): s is ApplicationStatus {
  return typeof s === "string" && VALID_STATUSES.includes(s as ApplicationStatus);
}

function rowToApp(row: Record<string, unknown>): TrackedApplication {
  return {
    id: typeof row.id === "string" ? row.id : "",
    company: typeof row.company === "string" ? row.company : "",
    role: typeof row.role === "string" ? row.role : "",
    date: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    ats_score: typeof row.ats_score === "number" ? row.ats_score : 0,
    seniority_match: typeof row.seniority_match === "string" ? row.seniority_match : "",
    jd_summary: typeof row.jd_summary === "string" ? row.jd_summary : "",
    status: isValidStatus(row.status) ? row.status : "saved",
    resume_text: typeof row.resume_text === "string" ? row.resume_text : "",
    job_description: typeof row.job_description === "string" ? row.job_description : "",
  };
}

function logError(context: string, message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[tracker] ${context}:`, message);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getApplications(): Promise<TrackedApplication[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    logError("getApplications", error.message);
    return [];
  }

  return (data ?? []).map(rowToApp);
}

export async function saveApplication(
  app: Omit<TrackedApplication, "id" | "date" | "status">
): Promise<TrackedApplication | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      company: app.company,
      role: app.role,
      ats_score: Math.max(0, Math.min(100, app.ats_score)), // enforce range client-side too
      seniority_match: app.seniority_match,
      jd_summary: app.jd_summary,
      resume_text: app.resume_text,
      job_description: app.job_description,
      status: "saved",
    })
    .select()
    .single();

  if (error) {
    logError("saveApplication", error.message);
    return null;
  }

  return rowToApp(data as Record<string, unknown>);
}

export async function updateStatus(id: string, status: ApplicationStatus): Promise<void> {
  if (!isValidStatus(status)) return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("applications")
    .update({ status })                   // updated_at set by DB trigger
    .eq("id", id)
    .eq("user_id", user.id);             // defense in depth — RLS + explicit filter

  if (error) logError("updateStatus", error.message);
}

export async function deleteApplication(id: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);             // defense in depth — RLS + explicit filter

  if (error) logError("deleteApplication", error.message);
}

export async function saveRewriteDecisions(
  applicationId: string,
  decisions: {
    suggestion_index: number;
    section: string;
    original_line: string;
    suggested_line: string;
    accepted: boolean;
  }[]
): Promise<void> {
  if (!decisions.length) return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Verify the application belongs to this user before inserting decisions
  const { data: app } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .eq("user_id", user.id)
    .single();

  if (!app) {
    logError("saveRewriteDecisions", "application not found or not owned by user");
    return;
  }

  const rows = decisions
    .filter((d) => d.suggestion_index >= 0)
    .map((d) => ({ application_id: applicationId, ...d }));

  const { error } = await supabase.from("rewrite_decisions").insert(rows);
  if (error) logError("saveRewriteDecisions", error.message);
}
