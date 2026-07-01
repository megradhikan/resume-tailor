/**
 * Application tracker — persists to localStorage.
 * Each entry is one (resume, JD) run: company, role, ATS score, date, status.
 */

export type ApplicationStatus = "saved" | "applied" | "interviewing" | "rejected" | "offer";

export interface TrackedApplication {
  id: string;
  company: string;
  role: string;
  date: string;          // ISO string
  ats_score: number;
  seniority_match: string;
  jd_summary: string;
  status: ApplicationStatus;
  resume_text: string;
  job_description: string;
}

const KEY = "resume_tailor_applications";

function load(): TrackedApplication[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(apps: TrackedApplication[]): void {
  localStorage.setItem(KEY, JSON.stringify(apps));
}

export function getApplications(): TrackedApplication[] {
  return load().sort((a, b) => b.date.localeCompare(a.date));
}

export function saveApplication(app: Omit<TrackedApplication, "id" | "date" | "status">): TrackedApplication {
  const apps = load();
  const entry: TrackedApplication = {
    ...app,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    status: "saved",
  };
  save([entry, ...apps]);
  return entry;
}

export function updateStatus(id: string, status: ApplicationStatus): void {
  const apps = load();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx !== -1) {
    apps[idx].status = status;
    save(apps);
  }
}

export function deleteApplication(id: string): void {
  save(load().filter((a) => a.id !== id));
}
