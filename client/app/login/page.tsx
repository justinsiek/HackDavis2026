"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, Doctor } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { setDoctor } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { doctor } = await api<{ doctor: Doctor }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim() }),
      });
      setDoctor(doctor);
      router.replace("/patients");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Unknown user. Try doctor1 or doctor2.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="flex flex-1 min-h-screen items-center justify-center px-4 py-16"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="mb-8 flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "var(--accent)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2a4 4 0 100 8 4 4 0 000-8zm0 3v2.5l2 1.5"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2.5 14c0-3 2.5-4.5 5.5-4.5S13.5 11 13.5 14"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-1)" }}>
            Patient Continuity
          </span>
        </div>

        <h1
          className="text-2xl font-bold tracking-tight mb-1"
          style={{ color: "var(--text-1)" }}
        >
          Sign in
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-2)" }}>
          Enter your credentials to access the dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5" style={{ color: "var(--text-1)" }}>
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="doctor1"
              className="block w-full rounded-lg px-3.5 py-2.5 text-sm transition-colors outline-none"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-1)",
              }}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5" style={{ color: "var(--text-1)" }}>
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg px-3.5 py-2.5 text-sm transition-colors outline-none"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-1)",
              }}
              required
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: "#dc2626" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {isSubmitting ? "Signing in…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
