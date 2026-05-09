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

        <div className="rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
          {isLoadingPatients ? (
            <div className="px-6 py-10 text-center text-sm text-zinc-500">
              Loading…
            </div>
          ) : patients.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-zinc-500">
              No patients yet. Click <span className="font-medium">Admit patient</span> to add one.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {patients.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/patients/${p.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-zinc-50"
                  >
                    <div>
                      <div className="font-medium text-zinc-900">{p.name}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {formatPatientMeta(p)}
                      </div>
                    </div>
                    <span className="text-zinc-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
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

function formatPatientMeta(p: Patient): string {
  const parts: string[] = [];
  if (p.dob) parts.push(`DOB ${p.dob}`);
  if (p.sex) parts.push(p.sex);
  parts.push(`admitted ${new Date(p.admitted_at).toLocaleDateString()}`);
  return parts.join(" · ");
}
