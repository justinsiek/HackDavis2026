"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, Patient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AdmitPatientModal from "./AdmitPatientModal";
import TopBar from "@/components/TopBar";

export default function PatientsPage() {
  const router = useRouter();
  const { doctor, isLoading: authLoading, setDoctor } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admitOpen, setAdmitOpen] = useState(false);
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.name.toLowerCase().includes(q));
  }, [patients, query]);

  if (authLoading || !doctor) return null;

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#0F172A]">
      <TopBar doctorName={doctor.name} onLogout={handleLogout} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {/* Page header */}
        <header className="pb-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-[26px] font-bold tracking-tight leading-none">
                Patients
              </h1>
              <p className="text-sm mt-2 text-[#6B7280]">
                {isLoadingPatients
                  ? "Loading…"
                  : `${patients.length} patient${patients.length !== 1 ? "s" : ""} admitted`}
              </p>
            </div>

            <button
              onClick={() => setAdmitOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#0F172A] hover:bg-black transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v11M1 6.5h11" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Admit patient
            </button>
          </div>

          {/* Search */}
          <div className="mt-6 relative max-w-sm">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
            >
              <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9.25 9.25L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patients…"
              className="w-full rounded-lg pl-9 pr-3 py-2 text-sm bg-white border border-[#E5E7EB] placeholder-[#9CA3AF] outline-none focus:border-[#0F172A] transition-colors"
            />
          </div>
        </header>

        {/* Content */}
        <section className="flex-1">
          {error && (
            <div
              className="mb-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
              style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
            >
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#EF4444" }} />
              <span>{error}</span>
            </div>
          )}

          {isLoadingPatients ? (
            <div className="px-2 py-16 text-center text-sm text-[#9CA3AF]">
              Loading patients…
            </div>
          ) : patients.length === 0 ? (
            <div className="px-2 py-20 text-center">
              <p className="text-sm font-medium mb-1 text-[#0F172A]">No patients yet</p>
              <p className="text-sm text-[#6B7280]">
                Click{" "}
                <button
                  onClick={() => setAdmitOpen(true)}
                  className="underline underline-offset-2 text-[#0F172A] hover:text-black"
                >
                  Admit patient
                </button>{" "}
                to add one.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-16 text-center text-sm text-[#9CA3AF]">
              No matches for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((p) => (
                <li key={p.id} className="relative group">
                  <Link
                    href={`/patients/${p.id}`}
                    className="block overflow-hidden border border-[#E5E7EB] bg-white hover:border-[#0F172A] transition-colors"
                  >
                    {/* Photo / initials hero */}
                    <div className="relative aspect-square overflow-hidden bg-[#F3F4F6]">
                      {p.photo_data ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photo_data}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-medium text-[#9CA3AF] tracking-wider">
                          {initials(p.name)}
                        </div>
                      )}

                      {/* Status pill top-left */}
                      <span
                        className="absolute top-3 left-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium text-[#0F172A]"
                        style={{
                          background: p.has_new_updates ? "#FDE68A" : "#A7F3D0",
                        }}
                      >
                        {p.has_new_updates ? "New" : "Current"}
                      </span>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#F1F1F1]">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#0F172A] truncate">
                          {p.name}
                        </div>
                        <div className="text-xs text-[#9CA3AF] mt-0.5">
                          Admitted{" "}
                          {new Date(p.admitted_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <span className="text-base text-[#D1D5DB] transition-transform group-hover:translate-x-0.5 group-hover:text-[#6B7280] shrink-0">
                        →
                      </span>
                    </div>
                  </Link>

                  {/* Delete button (top-right of card, on hover) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(p.id, p.name);
                    }}
                    aria-label={`Delete ${p.name}`}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-full transition-all bg-white/85 text-[#6B7280] hover:text-[#0F172A] hover:bg-white backdrop-blur-md"
                  >
                    <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M1.5 1.5l10 10M11.5 1.5l-10 10" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
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
