"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, GetPatientResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import RecordingView from "./RecordingView";

type Props = { params: Promise<{ id: string }> };

export default function PatientDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { doctor, isLoading: authLoading, setDoctor } = useAuth();
  const [data, setData] = useState<GetPatientResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [isStartingVisit, setIsStartingVisit] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) router.replace("/login");
  }, [authLoading, doctor, router]);

  const loadPatient = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await api<GetPatientResponse>(`/api/patients/${id}`);
      setData(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setDoctor(null);
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load patient");
    } finally {
      setIsLoading(false);
    }
  }, [id, router, setDoctor]);

  useEffect(() => {
    if (!doctor) return;
    loadPatient();
  }, [doctor, loadPatient]);

  async function startRecording() {
    setError(null);
    setIsStartingVisit(true);
    try {
      const { visit_id } = await api<{ visit_id: string }>(
        "/api/visits/start",
        {
          method: "POST",
          body: JSON.stringify({ patient_id: id }),
        }
      );
      setActiveVisitId(visit_id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start visit"
      );
    } finally {
      setIsStartingVisit(false);
    }
  }

  if (authLoading || !doctor) return null;

  if (activeVisitId && data?.patient) {
    return (
      <RecordingView
        patient={data.patient}
        visitId={activeVisitId}
        onDone={() => {
          setActiveVisitId(null);
          loadPatient();
        }}
      />
    );
  }

  const patient = data?.patient;
  const goals = data?.current_state?.long_term_goals ?? "";

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/patients"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← All patients
          </Link>
          <span className="text-sm text-zinc-600">
            Logged in as{" "}
            <span className="font-medium text-zinc-900">{doctor.name}</span>
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {isLoading ? (
          <div className="text-center text-sm text-zinc-500">Loading…</div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : patient ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              {patient.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Admitted {new Date(patient.admitted_at).toLocaleDateString()}
              {patient.sex && ` · ${patient.sex}`}
              {patient.height_cm && ` · ${formatHeight(patient.height_cm)}`}
            </p>

            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Long-term goals
              </h2>
              <div className="mt-2 rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                {goals ? (
                  <p className="whitespace-pre-wrap text-base leading-7 text-zinc-900">
                    {goals}
                  </p>
                ) : (
                  <p className="text-sm italic text-zinc-500">
                    No long-term goals recorded yet.
                  </p>
                )}
              </div>
            </section>

            <div className="mt-10">
              <button
                onClick={startRecording}
                disabled={isStartingVisit}
                className="rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {isStartingVisit ? "Starting…" : "Record interaction"}
              </button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

function formatHeight(cm: number): string {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - ft * 12);
  return `${ft}′${inches}″`;
}
