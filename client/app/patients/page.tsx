"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, Patient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AdmitPatientModal from "./AdmitPatientModal";

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
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">
            Patient Continuity
          </h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-600">
              Logged in as <span className="font-medium text-zinc-900">{doctor.name}</span>
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Patients</h2>
          <button
            onClick={() => setAdmitOpen(true)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Admit patient
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoadingPatients ? (
          <div className="rounded-xl bg-white px-6 py-10 text-center text-sm text-zinc-500 shadow-sm ring-1 ring-zinc-200">
            Loading…
          </div>
        ) : patients.length === 0 ? (
          <div className="rounded-xl bg-white px-6 py-10 text-center text-sm text-zinc-500 shadow-sm ring-1 ring-zinc-200">
            No patients yet. Click{" "}
            <span className="font-medium">Admit patient</span> to add one.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((p) => (
              <li key={p.id} className="relative">
                <Link
                  href={`/patients/${p.id}`}
                  className={`group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition hover:shadow-md ${
                    p.has_new_updates
                      ? "ring-2 ring-amber-300 hover:ring-amber-400"
                      : "ring-zinc-200 hover:ring-zinc-300"
                  }`}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-zinc-100">
                    {p.photo_data ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photo_data}
                        alt={p.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-4xl font-semibold text-zinc-500">
                        {initials(p.name)}
                      </div>
                    )}
                    {p.has_new_updates && (
                      <span
                        title="New updates since your last visit"
                        className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-medium text-white shadow-sm"
                      >
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                        New
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium text-zinc-900">
                        {p.name}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        Admitted {new Date(p.admitted_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500">
                      →
                    </span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id, p.name)}
                  aria-label={`Delete ${p.name}`}
                  title={`Delete ${p.name}`}
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900/60 text-white opacity-90 backdrop-blur-sm transition hover:bg-red-600 hover:opacity-100"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M2 2l10 10M12 2L2 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
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
