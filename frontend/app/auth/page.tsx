"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.push("/");
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* Header */}
      <header style={{ backgroundColor: "var(--color-header)", borderBottom: "1px solid oklch(0.22 0.01 245)" }}>
        <div className="max-w-3xl mx-auto px-6 py-3">
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--color-surface)" }}>
            Resume Tailor
          </span>
        </div>
      </header>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div
          className="w-full max-w-sm rounded-xl p-8 space-y-6"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div>
            <h1 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-ink-muted)" }}>
              {mode === "signin"
                ? "Your applications are saved to your account."
                : "Free account. Your data stays private."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-sm rounded-lg px-3 py-2"
                style={{
                  border: "1px solid var(--color-border)",
                  color: "var(--color-ink)",
                  backgroundColor: "var(--color-surface-2)",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-accent-subtle)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
                Password
              </label>
              <input
                type="password"
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 6 characters" : ""}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm rounded-lg px-3 py-2"
                style={{
                  border: "1px solid var(--color-border)",
                  color: "var(--color-ink)",
                  backgroundColor: "var(--color-surface-2)",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-accent-subtle)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {error && (
              <p
                className="text-sm rounded-lg px-4 py-3"
                style={{
                  backgroundColor: "var(--color-danger-bg)",
                  color: "var(--color-danger-text)",
                  border: "1px solid oklch(0.85 0.08 25)",
                }}
              >
                {error}
              </p>
            )}

            {success && (
              <p
                className="text-sm rounded-lg px-4 py-3"
                style={{
                  backgroundColor: "var(--color-success-bg)",
                  color: "var(--color-success-text)",
                  border: "1px solid oklch(0.78 0.09 160)",
                }}
              >
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
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
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-sm text-center" style={{ color: "var(--color-ink-muted)" }}>
            {mode === "signin" ? "No account?" : "Already have an account?"}{" "}
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setSuccess(null); }}
              className="font-semibold"
              style={{ color: "var(--color-accent)" }}
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
