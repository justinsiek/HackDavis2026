"use client";

import {
  ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  ApiError,
  Diagnosis,
  GetPatientResponse,
  Medication,
  Patient,
  Vitals,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Lab, mockLabs, mockVitalsSeries, VitalSeries } from "@/lib/mockClinical";
import RecordingView from "./RecordingView";
import Sparkline from "./Sparkline";

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
      setError(err instanceof Error ? err.message : "Failed to start visit");
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/patients"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← All patients
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-600">
              Logged in as{" "}
              <span className="font-medium text-zinc-900">{doctor.name}</span>
            </span>
            <button
              onClick={startRecording}
              disabled={isStartingVisit || !data?.patient}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {isStartingVisit ? "Starting…" : "Record interaction"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4">
        {isLoading ? (
          <div className="text-center text-sm text-zinc-500">Loading…</div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : data?.patient ? (
          <Bento data={data} />
        ) : null}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bento layout
// ---------------------------------------------------------------------------

function Bento({ data }: { data: GetPatientResponse }) {
  const { patient } = data;
  const state = data.current_state;
  const vitalsSeries = useMemo(() => mockVitalsSeries(patient.id), [patient.id]);
  const labs = useMemo(() => mockLabs(patient.id), [patient.id]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Row 1: header + medications + long-term goals */}
      <div className="lg:col-span-6">
        <PatientHeaderCard patient={patient} synopsis={state?.synopsis ?? ""} />
      </div>
      <div className="lg:col-span-3">
        <MedicationsCard medications={state?.current_medications ?? []} />
      </div>
      <div className="lg:col-span-3">
        <TextCard
          title="Long-term goals"
          content={state?.long_term_goals ?? ""}
          emptyText="No long-term goals set."
        />
      </div>

      {/* Row 2: full-width what's-changed */}
      <div className="lg:col-span-12">
        <ChangedCard
          narrative={data.narrative}
          isFirstView={data.is_first_view}
        />
      </div>

      {/* Row 3: problems / plan */}
      <div className="lg:col-span-6">
        <ProblemsCard diagnoses={state?.active_diagnoses ?? []} />
      </div>
      <div className="lg:col-span-6">
        <TextCard
          title="Plan & next steps"
          content={state?.treatment_plan ?? ""}
          emptyText="No plan recorded yet."
        />
      </div>

      {/* Row 4: vitals + labs + subjective */}
      <div className="lg:col-span-4">
        <VitalsCard vitals={state?.recent_vitals ?? null} series={vitalsSeries} />
      </div>
      <div className="lg:col-span-4">
        <LabsCard labs={labs} />
      </div>
      <div className="lg:col-span-4">
        <TextCard
          title="Subjective"
          content={state?.current_presentation ?? ""}
          emptyText="Nothing reported yet."
        />
      </div>

      {/* Row 5: physical exam + PMH */}
      <div className="lg:col-span-6">
        <TextCard
          title="Physical exam"
          content={state?.physical_exam ?? ""}
          emptyText="No exam findings."
        />
      </div>
      <div className="lg:col-span-6">
        <TextCard
          title="Past medical history"
          content={state?.past_medical_history ?? ""}
          emptyText="No prior history documented."
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card primitives
// ---------------------------------------------------------------------------

function BentoCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex h-full flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 ${className}`}
    >
      {children}
    </section>
  );
}

function CardHeader({
  title,
  action,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-2 flex items-center justify-between gap-2 ${className}`}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {action}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm italic text-zinc-400">{children}</p>;
}

// ---------------------------------------------------------------------------
// Patient header & What's changed
// ---------------------------------------------------------------------------

function PatientHeaderCard({
  patient,
  synopsis,
}: {
  patient: Patient;
  synopsis: string;
}) {
  const meta: string[] = [];
  if (patient.dob) meta.push(`${calcAge(patient.dob)} y`);
  if (patient.sex) meta.push(patient.sex);
  if (patient.height_cm) meta.push(formatHeight(patient.height_cm));
  meta.push(`admitted ${new Date(patient.admitted_at).toLocaleDateString()}`);
  return (
    <section className="flex h-full flex-col rounded-xl bg-gradient-to-br from-white to-zinc-50 p-3 shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-start gap-4">
        {patient.photo_data ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={patient.photo_data}
            alt={patient.name}
            className="h-44 w-44 shrink-0 rounded-xl object-cover ring-1 ring-zinc-200"
          />
        ) : (
          <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-3xl font-semibold text-zinc-500">
            {initials(patient.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            {patient.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{meta.join(" · ")}</p>
          {synopsis ? (
            <p className="mt-3 text-base leading-7 text-zinc-700">
              {synopsis}
            </p>
          ) : (
            <p className="mt-3 text-sm italic text-zinc-400">
              Synopsis will appear here after the first visit.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ChangedCard({
  narrative,
  isFirstView,
}: {
  narrative: string | null;
  isFirstView: boolean;
}) {
  let body: ReactNode;
  if (isFirstView) {
    body = (
      <p className="text-sm italic text-amber-900/80">
        First time seeing this patient — start with the synopsis.
      </p>
    );
  } else if (!narrative) {
    body = (
      <p className="text-sm italic text-amber-900/80">
        Nothing new since your last visit.
      </p>
    );
  } else {
    body = (
      <p className="whitespace-pre-wrap text-sm leading-6 text-amber-950">
        {narrative}
      </p>
    );
  }
  return (
    <section className="flex h-full flex-col rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm ring-1 ring-amber-100">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
        What&rsquo;s changed since you last saw this patient
      </h2>
      {body}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Problems / Medications
// ---------------------------------------------------------------------------

function ProblemsCard({ diagnoses }: { diagnoses: Diagnosis[] }) {
  return (
    <BentoCard>
      <CardHeader title="Active problems" />
      {diagnoses.length === 0 ? (
        <Empty>No active problems.</Empty>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {diagnoses.map((d, i) => (
            <li key={i} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-zinc-900">{d.condition}</span>
                {d.since && (
                  <span className="shrink-0 text-xs text-zinc-500">
                    since {d.since}
                  </span>
                )}
              </div>
              {d.notes && (
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {d.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

function MedicationsCard({ medications }: { medications: Medication[] }) {
  return (
    <BentoCard>
      <CardHeader title="Current medications" />
      {medications.length === 0 ? (
        <Empty>No medications recorded.</Empty>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {medications.map((m, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="font-medium text-zinc-900">{m.name}</span>
              <span className="text-right text-xs text-zinc-500">
                {[m.dose, m.frequency].filter(Boolean).join(" · ") || "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

// ---------------------------------------------------------------------------
// Generic text card
// ---------------------------------------------------------------------------

function TextCard({
  title,
  content,
  emptyText,
}: {
  title: string;
  content: string;
  emptyText: string;
}) {
  return (
    <BentoCard>
      <CardHeader title={title} />
      {content ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700">
          {content}
        </p>
      ) : (
        <Empty>{emptyText}</Empty>
      )}
    </BentoCard>
  );
}

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

function VitalsCard({
  vitals,
  series,
}: {
  vitals: Vitals | null;
  series: VitalSeries;
}) {
  const cards: { label: string; value: string; values: number[]; color: string }[] = [
    {
      label: "BP",
      value: vitals?.bp || `${last(series.bp_sys)}/${last(series.bp_dia)}`,
      values: series.bp_sys.map((s, i) => s - series.bp_dia[i]),
      color: "text-rose-500",
    },
    {
      label: "HR",
      value: vitals?.hr || String(last(series.hr)),
      values: series.hr,
      color: "text-blue-500",
    },
    {
      label: "Temp",
      value: vitals?.temp_c
        ? `${vitals.temp_c}°C`
        : `${last(series.temp_c).toFixed(1)}°`,
      values: series.temp_c,
      color: "text-amber-500",
    },
    {
      label: "O₂",
      value: vitals?.o2_sat ? `${vitals.o2_sat}%` : `${last(series.o2_sat)}%`,
      values: series.o2_sat,
      color: "text-emerald-500",
    },
  ];
  return (
    <BentoCard>
      <CardHeader title="Vitals · last 7 days" />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        {cards.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100"
          >
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                {c.label}
              </div>
              <div className="text-base font-semibold tabular-nums leading-tight text-zinc-900">
                {c.value}
              </div>
            </div>
            <Sparkline values={c.values} width={70} height={22} className={c.color} />
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------

function LabsCard({ labs }: { labs: Lab[] }) {
  const abnormalCount = labs.filter((l) => l.abnormal).length;
  return (
    <BentoCard>
      <CardHeader
        title={`Labs · ${abnormalCount} abnormal`}
      />
      <ul className="min-h-0 flex-1 divide-y divide-zinc-100 overflow-hidden text-sm">
        {labs.map((l) => (
          <li
            key={l.name}
            className="flex items-center justify-between gap-2 py-1.5"
          >
            <span className="w-24 shrink-0 text-zinc-600">{l.name}</span>
            <span
              className={`flex-1 truncate text-right tabular-nums ${
                l.abnormal ? "font-semibold text-rose-600" : "text-zinc-900"
              }`}
            >
              {l.value} {l.unit}
            </span>
            <span className="hidden w-16 shrink-0 text-right text-xs text-zinc-400 sm:block">
              {l.range}
            </span>
            <Sparkline
              values={l.trend}
              width={48}
              height={18}
              className={l.abnormal ? "text-rose-500" : "text-zinc-400"}
            />
          </li>
        ))}
      </ul>
    </BentoCard>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHeight(cm: number): string {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - ft * 12);
  return `${ft}′${inches}″`;
}

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
