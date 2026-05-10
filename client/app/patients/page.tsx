"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, Patient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AdmitPatientModal from "./AdmitPatientModal";
import Sidebar from "@/components/Sidebar";

export default function PatientsPage() {
  const router = useRouter();
  const { doctor, isLoading: authLoading, setDoctor } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admitOpen, setAdmitOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) router.replace("/login");
  }, [authLoading, doctor, router]);

  const loadPatients = useCallback(async () => {
    setIsLoadingPatients(true);
    setError(null);
    try {
      const { patients } = await api<{ patients: Patient[] }>("/api/patients");
      setPatients(patients);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setDoctor(null);
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load patients");
    } finally {
      setIsLoadingPatients(false);
    }
  }, [router, setDoctor]);

  useEffect(() => {
    if (!doctor) return;
    loadPatients();
  }, [doctor, loadPatients]);

  function handleLogout() {
    setDoctor(null);
    router.replace("/login");
  }

  async function handleDelete(patientId: string, patientName: string) {
    if (!window.confirm(`Delete ${patientName}? This cannot be undone.`)) return;
    try {
      await api(`/api/patients/${patientId}`, { method: "DELETE" });
      setPatients((prev) => prev.filter((p) => p.id !== patientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete patient");
    }
  }

  if (authLoading || !doctor) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar doctorName={doctor.name} onLogout={handleLogout} />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Page header */}
        <div
          className="px-8 py-6 border-b flex items-center justify-between"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-1)" }}>
              Patients
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
              {isLoadingPatients
                ? "Loading…"
                : `${patients.length} patient${patients.length !== 1 ? "s" : ""} admitted`}
            </p>
          </div>
          <button
            onClick={() => setAdmitOpen(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Admit patient
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 px-8 py-6">
          {error && (
            <div
              className="mb-4 rounded-lg px-4 py-3 text-sm"
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
              }}
            >
              {error}
            </div>
          )}

          {isLoadingPatients ? (
            <div
              className="rounded-xl px-6 py-12 text-center text-sm"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text-3)",
              }}
            >
              Loading patients…
            </div>
          ) : patients.length === 0 ? (
            <div
              className="rounded-xl px-6 py-12 text-center"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <p className="text-sm font-bold mb-1" style={{ color: "var(--text-1)" }}>
                No patients yet
              </p>
              <p className="text-sm" style={{ color: "var(--text-3)" }}>
                Click{" "}
                <button
                  onClick={() => setAdmitOpen(true)}
                  className="underline"
                  style={{ color: "var(--accent)" }}
                >
                  Admit patient
                </button>{" "}
                to add one.
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              {/* List header */}
              <div
                className="grid items-center px-5 py-2.5 border-b"
                style={{
                  gridTemplateColumns: "40px 1fr 160px 100px 40px",
                  borderColor: "var(--border)",
                  background: "#f8fafc",
                }}
              >
                <span />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  Patient
                </span>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  Admitted
                </span>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  Status
                </span>
                <span />
              </div>

              {/* Patient rows */}
              <ul>
                {patients.map((p, i) => (
                  <li
                    key={p.id}
                    className="relative group"
                    style={{
                      borderTop: i > 0 ? `1px solid var(--border)` : undefined,
                    }}
                  >
                    <Link
                      href={`/patients/${p.id}`}
                      className="grid items-center px-5 py-3.5 transition-colors hover:bg-slate-50"
                      style={{ gridTemplateColumns: "40px 1fr 160px 100px 40px" }}
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
                        {p.photo_data ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.photo_data}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center text-xs font-bold"
                            style={{ background: "var(--accent-light)", color: "var(--accent-text)" }}
                          >
                            {initials(p.name)}
                          </div>
                        )}
                      </div>

                      {/* Name */}
                      <div>
                        <span className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
                          {p.name}
                        </span>
                      </div>

                      {/* Admitted date */}
                      <span className="text-sm" style={{ color: "var(--text-2)" }}>
                        {new Date(p.admitted_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>

                      {/* Status */}
                      <div>
                        {p.has_new_updates ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                            style={{ background: "#fef3c7", color: "#92400e" }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            New
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                            style={{ background: "#f0fdf4", color: "#166534" }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Current
                          </span>
                        )}
                      </div>

                      {/* Arrow */}
                      <span
                        className="text-base transition-transform group-hover:translate-x-0.5"
                        style={{ color: "var(--text-3)" }}
                      >
                        →
                      </span>
                    </Link>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id, p.name)}
                      aria-label={`Delete ${p.name}`}
                      className="absolute right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:bg-red-50"
                      style={{ color: "var(--text-3)" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M1.5 1.5l10 10M11.5 1.5l-10 10" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>

      {admitOpen && (
        <AdmitPatientModal
          onClose={() => setAdmitOpen(false)}
          onAdmitted={() => {
            setAdmitOpen(false);
            loadPatients();
          }}
        />
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
