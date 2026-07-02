"use client";

import { useEffect, useState } from "react";
import {
  getApplications,
  updateStatus,
  deleteApplication,
  TrackedApplication,
  ApplicationStatus,
} from "@/lib/tracker";

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "saved",        label: "Saved" },
  { value: "applied",      label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "rejected",     label: "Rejected" },
  { value: "offer",        label: "Offer" },
];

function statusStyle(s: ApplicationStatus): { bg: string; color: string } {
  switch (s) {
    case "saved":        return { bg: "var(--color-surface-2)", color: "var(--color-ink-muted)" };
    case "applied":      return { bg: "var(--color-accent-subtle)", color: "var(--color-accent-text)" };
    case "interviewing": return { bg: "oklch(0.95 0.03 290)", color: "oklch(0.35 0.10 290)" };
    case "rejected":     return { bg: "var(--color-danger-bg)", color: "var(--color-danger-text)" };
    case "offer":        return { bg: "var(--color-success-bg)", color: "var(--color-success-text)" };
  }
}

interface Props {
  onReload?: (app: TrackedApplication) => void;
  refreshTick?: number;
}

export default function ApplicationTracker({ onReload, refreshTick }: Props) {
  const [apps, setApps] = useState<TrackedApplication[]>([]);

  const refresh = async () => setApps(await getApplications());

  useEffect(() => { refresh(); }, [refreshTick]);

  const handleStatus = async (id: string, status: ApplicationStatus) => {
    await updateStatus(id, status);
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Remove this application from the tracker?")) {
      await deleteApplication(id);
      refresh();
    }
  };

  if (apps.length === 0) return null;

  const avgScore = Math.round(apps.reduce((s, a) => s + a.ats_score, 0) / apps.length);
  const offerCount = apps.filter((a) => a.status === "offer").length;
  const interviewCount = apps.filter((a) => a.status === "interviewing").length;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            Application Tracker
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-faint)" }}>
            {apps.length} application{apps.length !== 1 ? "s" : ""} saved locally
          </p>
        </div>
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-base font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
              {avgScore}
            </div>
            <div className="text-xs" style={{ color: "var(--color-ink-faint)" }}>avg ATS</div>
          </div>
          <div className="text-center">
            <div className="text-base font-bold tabular-nums" style={{ color: "oklch(0.35 0.10 290)" }}>
              {interviewCount}
            </div>
            <div className="text-xs" style={{ color: "var(--color-ink-faint)" }}>interviews</div>
          </div>
          <div className="text-center">
            <div className="text-base font-bold tabular-nums" style={{ color: "var(--color-success)" }}>
              {offerCount}
            </div>
            <div className="text-xs" style={{ color: "var(--color-ink-faint)" }}>offers</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              {["Company / Role", "Date", "ATS", "Fit", "Status", ""].map((h) => (
                <th
                  key={h}
                  className={`py-2.5 text-xs font-semibold ${h === "" ? "px-4" : "px-6"} ${h === "" ? "" : "text-left"}`}
                  style={{ color: "var(--color-ink-faint)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => {
              const st = statusStyle(app.status);
              const atsColor =
                app.ats_score >= 70
                  ? "var(--color-success)"
                  : app.ats_score >= 50
                  ? "var(--color-warning)"
                  : "var(--color-danger)";
              return (
                <tr
                  key={app.id}
                  className="transition-colors"
                  style={{ borderBottom: "1px solid var(--color-border)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "";
                  }}
                >
                  <td className="px-6 py-3">
                    <div className="font-semibold" style={{ color: "var(--color-ink)" }}>
                      {app.company || <span style={{ color: "var(--color-ink-faint)" }}>—</span>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-muted)" }}>
                      {app.role || <span style={{ color: "var(--color-ink-faint)" }}>—</span>}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-xs whitespace-nowrap" style={{ color: "var(--color-ink-muted)" }}>
                    {new Date(app.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm font-bold tabular-nums" style={{ color: atsColor }}>
                      {app.ats_score.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={
                        app.seniority_match === "match"
                          ? { backgroundColor: "var(--color-success-bg)", color: "var(--color-success-text)" }
                          : app.seniority_match === "under"
                          ? { backgroundColor: "var(--color-warning-bg)", color: "var(--color-warning-text)" }
                          : { backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent-text)" }
                      }
                    >
                      {app.seniority_match}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={app.status}
                      onChange={(e) => handleStatus(app.id, e.target.value as ApplicationStatus)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                      style={{
                        backgroundColor: st.bg,
                        color: st.color,
                        border: "none",
                        outline: "none",
                        appearance: "none",
                        WebkitAppearance: "none",
                      }}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      {onReload && (
                        <button
                          onClick={() => onReload(app)}
                          className="text-xs font-semibold transition-colors"
                          style={{ color: "var(--color-accent)" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-accent-hover)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-accent)"; }}
                          title="Load this application into the form"
                        >
                          Load
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(app.id)}
                        className="text-xs font-semibold transition-colors"
                        style={{ color: "var(--color-ink-faint)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-danger)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-ink-faint)"; }}
                        title="Remove from tracker"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
