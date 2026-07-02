/**
 * Application tracker — persists to Supabase (applications table).
 * Falls back to localStorage for unauthenticated sessions.
 */

import { createClient } from "@/lib/supabase";

export type ApplicationStatus = "saved" | "applied" | "interviewing" | "rejected" | "offer";

export interface TrackedApplication {
  id: string;
  company: string;
  role: string;
  date: string;           // ISO string
  ats_score: number;
  seniority_match: string;
  jd_summary: string;
  status: ApplicationStatus;
  resume_text: string;
  job_description: string;
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

export async function getApplications(): Promise<TrackedApplication[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getApplications:", error.message);
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
      ats_score: app.ats_score,
      seniority_match: app.seniority_match,
      jd_summary: app.jd_summary,
      resume_text: app.resume_text,
      job_description: app.job_description,
      status: "saved",
    })
    .select()
    .single();

  if (error) {
    console.error("saveApplication:", error.message);
    return null;
  }

  return rowToApp(data);
}

export async function updateStatus(id: string, status: ApplicationStatus): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) console.error("updateStatus:", error.message);
}

export async function deleteApplication(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id);

  if (error) console.error("deleteApplication:", error.message);
}

export async function saveRewriteDecisions(
  applicationId: string,
  decisions: { suggestion_index: number; section: string; original_line: string; suggested_line: string; accepted: boolean }[]
): Promise<void> {
  if (!decisions.length) return;
  const supabase = createClient();
  const rows = decisions.map((d) => ({ application_id: applicationId, ...d }));
  const { error } = await supabase.from("rewrite_decisions").insert(rows);
  if (error) console.error("saveRewriteDecisions:", error.message);
}

// ── Internal ─────────────────────────────────────────────────────────────────

function rowToApp(row: Record<string, unknown>): TrackedApplication {
  return {
    id: row.id as string,
    company: (row.company as string) ?? "",
    role: (row.role as string) ?? "",
    date: (row.created_at as string) ?? new Date().toISOString(),
    ats_score: row.ats_score as number,
    seniority_match: (row.seniority_match as string) ?? "",
    jd_summary: (row.jd_summary as string) ?? "",
    status: (row.status as ApplicationStatus) ?? "saved",
    resume_text: (row.resume_text as string) ?? "",
    job_description: (row.job_description as string) ?? "",
  };
}
