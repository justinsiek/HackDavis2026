"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, Patient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AdmitPatientModal from "./AdmitPatientModal";
import TopBar from "@/components/TopBar";

const PAGE_BG = "#F1F5F9";
const CARD_BG = "#FFFFFF";
const WRAPPER_SHADOW = "0 4px 24px rgba(15, 23, 42, 0.06)";
const CARD_BORDER = "#E2E8F0";
const CARD_SHADOW = "0 1px 2px rgba(15, 23, 42, 0.03)";
const CARD_SHADOW_HOVER = "0 3px 8px rgba(15, 23, 42, 0.05)";

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
    <div
      className="h-screen flex flex-col text-[#0F172A] overflow-hidden"
      style={{ background: PAGE_BG }}
    >
      <TopBar doctorName={doctor.name} onLogout={handleLogout} />

      <main className="flex-1 min-h-0 w-full max-w-[1400px] mx-auto px-10 py-5 overflow-y-auto flex flex-col">
        <div
          className="my-auto rounded-2xl p-6"
          style={{
            background: CARD_BG,
            boxShadow: WRAPPER_SHADOW,
          }}
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-4xl font-medium tracking-tight leading-none text-[#0F172A]">
                Patients
              </h1>
              <p className="text-sm mt-2.5 text-[#6B7280]">
                {isLoadingPatients
                  ? "Loading…"
                  : `${patients.length} patient${
                      patients.length !== 1 ? "s" : ""
                    } admitted`}
              </p>
            </div>

            <button
              onClick={() => setAdmitOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white bg-[#0F172A] hover:bg-black transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path
                  d="M6.5 1v11M1 6.5h11"
                  stroke="white"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              Admit patient
            </button>
          </div>

          {/* Search */}
          <div className="mt-6 relative max-w-xs">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
            >
              <circle
                cx="6"
                cy="6"
                r="4.25"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path
                d="M9.25 9.25L12 12"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patients..."
              className="w-full rounded-lg pl-9 pr-3 py-2 text-sm bg-white border border-[#E5E7EB] placeholder-[#9CA3AF] outline-none focus:border-[#0F172A] transition-colors"
            />
          </div>

          {/* Content */}
          <section className="mt-5">
            {error && (
              <div
                className="mb-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#0F172A",
                }}
              >
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "#EF4444" }}
                />
                <span>{error}</span>
              </div>
            )}

            {isLoadingPatients ? (
              <div className="px-2 py-16 text-center text-sm text-[#9CA3AF]">
                Loading patients…
              </div>
            ) : patients.length === 0 ? (
              <div className="px-2 py-20 text-center">
                <p className="text-sm font-medium mb-1 text-[#0F172A]">
                  No patients yet
                </p>
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
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filtered.map((p) => (
                  <li key={p.id} className="relative group">
                    <Link
                      href={`/patients/${p.id}`}
                      className="block rounded-2xl px-7 pt-6 pb-5 transition-all"
                      style={{
                        background: CARD_BG,
                        border: `1px solid ${CARD_BORDER}`,
                        boxShadow: CARD_SHADOW,
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.boxShadow = CARD_SHADOW_HOVER)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.boxShadow = CARD_SHADOW)
                      }
                    >
                      {/* Top row: avatar + status pill */}
                      <div className="flex items-start justify-between">
                        <div
                          className="h-24 w-24 shrink-0 rounded-full overflow-hidden"
                          style={{ background: "#F1F5F9" }}
                        >
                          {p.photo_data ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.photo_data}
                              alt={p.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-2xl font-medium tracking-wider"
                              style={{ color: "#94A3B8" }}
                            >
                              {initials(p.name)}
                            </div>
                          )}
                        </div>
                        <span
                          className="inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium"
                          style={{
                            background: p.has_new_updates
                              ? "#FEF08A"
                              : "#BBF7D0",
                            color: "#0F172A",
                          }}
                        >
                          {p.has_new_updates ? "New" : "Current"}
                        </span>
                      </div>

                      {/* Bottom row: name + admitted + arrow */}
                      <div className="mt-6 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-medium text-[#0F172A] truncate">
                            {p.name}
                          </div>
                          <div className="text-base mt-1.5 text-[#9CA3AF]">
                            Admitted{" "}
                            {new Date(p.admitted_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </div>
                        </div>
                        <span className="text-xl text-[#D1D5DB] transition-transform group-hover:translate-x-0.5 group-hover:text-[#6B7280] shrink-0">
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
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-full transition-all bg-white/90 text-[#9CA3AF] hover:text-[#0F172A] hover:bg-white shadow-sm backdrop-blur-md"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 13 13"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      >
                        <path d="M1.5 1.5l10 10M11.5 1.5l-10 10" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
