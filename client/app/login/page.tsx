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
    <div className="flex flex-1 items-center justify-center px-4 py-16 bg-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/clair-logo.png"
          alt="Clair"
          className="h-20 w-auto select-none mb-6 -ml-2"
          draggable={false}
        />
        <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">Sign in</h1>
        <p className="mt-1 text-sm text-[#0F172A]">
          Welcome back to Clair.
        </p>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Username</span>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              required
            />
          </label>
        </div>

        {error && (
          <p
            className="mt-4 inline-flex items-start gap-2 rounded-md px-3 py-2 text-sm"
            style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
          >
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#EF4444" }} />
            <span>{error}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {isSubmitting ? "Signing in…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
