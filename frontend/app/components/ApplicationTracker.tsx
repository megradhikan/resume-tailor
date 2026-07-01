"use client";

import { useEffect, useState } from "react";
import {
  getApplications,
  updateStatus,
  deleteApplication,
  TrackedApplication,
  ApplicationStatus,
} from "@/lib/tracker";

const STATUS_OPTIONS: { value: ApplicationStatus; label: string; color: string }[] = [
  { value: "saved",        label: "Saved",        color: "bg-gray-100 text-gray-600" },
  { value: "applied",      label: "Applied",      color: "bg-blue-100 text-blue-700" },
  { value: "interviewing", label: "Interviewing", color: "bg-purple-100 text-purple-700" },
  { value: "rejected",     label: "Rejected",     color: "bg-red-100 text-red-600" },
  { value: "offer",        label: "Offer",        color: "bg-green-100 text-green-700" },
];

function statusColor(s: ApplicationStatus) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.color ?? "bg-gray-100 text-gray-600";
}

interface Props {
  onReload?: (app: TrackedApplication) => void;
  refreshTick?: number;
}

export default function ApplicationTracker({ onReload, refreshTick }: Props) {
  const [apps, setApps] = useState<TrackedApplication[]>([]);

  const refresh = () => setApps(getApplications());

  useEffect(() => { refresh(); }, [refreshTick]);

  const handleStatus = (id: string, status: ApplicationStatus) => {
    updateStatus(id, status);
    refresh();
  };

  const handleDelete = (id: string) => {
    if (confirm("Remove this application from the tracker?")) {
      deleteApplication(id);
      refresh();
    }
  };

  if (apps.length === 0) return null;

  const avgScore = Math.round(apps.reduce((s, a) => s + a.ats_score, 0) / apps.length);
  const offerCount = apps.filter((a) => a.status === "offer").length;
  const interviewCount = apps.filter((a) => a.status === "interviewing").length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Application Tracker</h2>
          <p className="text-xs text-gray-400 mt-0.5">{apps.length} application{apps.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-indigo-600">{avgScore}</div>
            <div className="text-xs text-gray-400">avg ATS</div>
          </div>
          <div>
            <div className="text-lg font-bold text-purple-600">{interviewCount}</div>
            <div className="text-xs text-gray-400">interviews</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-600">{offerCount}</div>
            <div className="text-xs text-gray-400">offers</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
              <th className="text-left px-6 py-3 font-medium">Company / Role</th>
              <th className="text-left px-6 py-3 font-medium">Date</th>
              <th className="text-left px-6 py-3 font-medium">ATS</th>
              <th className="text-left px-6 py-3 font-medium">Fit</th>
              <th className="text-left px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3">
                  <div className="font-medium text-gray-900">{app.company || "—"}</div>
                  <div className="text-xs text-gray-500">{app.role || "—"}</div>
                </td>
                <td className="px-6 py-3 text-gray-500 whitespace-nowrap">
                  {new Date(app.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </td>
                <td className="px-6 py-3">
                  <span className={`font-semibold ${app.ats_score >= 70 ? "text-green-600" : app.ats_score >= 50 ? "text-yellow-500" : "text-red-500"}`}>
                    {app.ats_score.toFixed(1)}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    app.seniority_match === "match" ? "bg-green-100 text-green-700" :
                    app.seniority_match === "under" ? "bg-yellow-100 text-yellow-700" :
                    "bg-blue-100 text-blue-700"
                  }`}>
                    {app.seniority_match}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <select
                    value={app.status}
                    onChange={(e) => handleStatus(app.id, e.target.value as ApplicationStatus)}
                    className={`text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300 ${statusColor(app.status)}`}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-3">
                  <div className="flex gap-2 justify-end">
                    {onReload && (
                      <button
                        onClick={() => onReload(app)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        title="Reload this application"
                      >
                        Reload
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(app.id)}
                      className="text-xs text-gray-400 hover:text-red-500 font-medium"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
