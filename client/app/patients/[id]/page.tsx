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
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3">
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

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-4">
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
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:auto-rows-[minmax(0,1fr)]">
      {/* Row 1 */}
      <div className="lg:col-span-7 lg:row-span-1">
        <PatientHeaderCard patient={patient} synopsis={state?.synopsis ?? ""} />
      </div>
      <div className="lg:col-span-5 lg:row-span-1">
        <ChangedCard
          narrative={data.narrative}
          isFirstView={data.is_first_view}
        />
      </div>

      {/* Row 2 */}
      <div className="lg:col-span-4">
        <ProblemsCard diagnoses={state?.active_diagnoses ?? []} />
      </div>
      <div className="lg:col-span-4">
        <MedicationsCard medications={state?.current_medications ?? []} />
      </div>
      <div className="lg:col-span-4">
        <TextCard
          title="Plan & next steps"
          content={state?.treatment_plan ?? ""}
          emptyText="No plan recorded yet."
        />
      </div>

      {/* Row 3 */}
      <div className="lg:col-span-7">
        <VitalsCard vitals={state?.recent_vitals ?? null} series={vitalsSeries} />
      </div>
      <div className="lg:col-span-5">
        <LabsCard labs={labs} />
      </div>

      {/* Row 4 */}
      <div className="lg:col-span-3">
        <TextCard
          title="Subjective"
          content={state?.current_presentation ?? ""}
          emptyText="Nothing reported yet."
        />
      </div>
      <div className="lg:col-span-3">
        <TextCard
          title="Physical exam"
          content={state?.physical_exam ?? ""}
          emptyText="No exam findings."
        />
      </div>
      <div className="lg:col-span-3">
        <TextCard
          title="Past medical history"
          content={state?.past_medical_history ?? ""}
          emptyText="No prior history documented."
        />
      </div>
      <div className="lg:col-span-3">
        <TextCard
          title="Long-term goals"
          content={state?.long_term_goals ?? ""}
          emptyText="No long-term goals set."
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
      className={`flex h-full min-h-[140px] flex-col overflow-hidden rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 ${className}`}
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

function ShowAllButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
    >
      Show all →
    </button>
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
    <BentoCard className="bg-gradient-to-br from-white to-zinc-50">
      <div className="flex h-full items-start gap-4">
        {patient.photo_data ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={patient.photo_data}
            alt={patient.name}
            className="h-20 w-20 shrink-0 rounded-full object-cover ring-1 ring-zinc-200"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-2xl font-semibold text-zinc-500">
            {initials(patient.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-900">
            {patient.name}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">{meta.join(" · ")}</p>
          {synopsis ? (
            <p className="mt-2 text-sm leading-6 text-zinc-700 line-clamp-3">
              {synopsis}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-zinc-400">
              Synopsis will appear here after the first visit.
            </p>
          )}
        </div>
      </div>
    </BentoCard>
  );
}

function ChangedCard({
  narrative,
  isFirstView,
}: {
  narrative: string | null;
  isFirstView: boolean;
}) {
  const [open, setOpen] = useState(false);
  const long = narrative && narrative.length > 220;
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
      <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-amber-950">
        {narrative}
      </p>
    );
  }
  return (
    <section className="flex h-full min-h-[140px] flex-col overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm ring-1 ring-amber-100">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
          What&rsquo;s changed since you last saw this patient
        </h2>
        {long && (
          <button
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-amber-800 hover:text-amber-950"
          >
            Show all →
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">{body}</div>
      {long && narrative && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="What's changed since you last saw this patient"
        >
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-900">
            {narrative}
          </p>
        </Modal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Problems / Medications
// ---------------------------------------------------------------------------

function ProblemsCard({ diagnoses }: { diagnoses: Diagnosis[] }) {
  const [open, setOpen] = useState(false);
  const visible = diagnoses.slice(0, 3);
  const overflow = diagnoses.length - visible.length;
  return (
    <BentoCard>
      <CardHeader
        title="Active problems"
        action={
          overflow > 0 ? (
            <ShowAllButton onClick={() => setOpen(true)} />
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1">
        {diagnoses.length === 0 ? (
          <Empty>No active problems.</Empty>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {visible.map((d, i) => (
              <li key={i}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-zinc-900">
                    {d.condition}
                  </span>
                  {d.since && (
                    <span className="shrink-0 text-xs text-zinc-500">
                      {d.since}
                    </span>
                  )}
                </div>
              </li>
            ))}
            {overflow > 0 && (
              <li className="text-xs text-zinc-500">+ {overflow} more</li>
            )}
          </ul>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Active problems">
        <ul className="divide-y divide-zinc-100">
          {diagnoses.map((d, i) => (
            <li key={i} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-zinc-900">{d.condition}</span>
                {d.since && (
                  <span className="text-xs text-zinc-500">since {d.since}</span>
                )}
              </div>
              {d.notes && (
                <p className="mt-1 text-sm text-zinc-600">{d.notes}</p>
              )}
            </li>
          ))}
        </ul>
      </Modal>
    </BentoCard>
  );
}

function MedicationsCard({ medications }: { medications: Medication[] }) {
  const [open, setOpen] = useState(false);
  const visible = medications.slice(0, 3);
  const overflow = medications.length - visible.length;
  return (
    <BentoCard>
      <CardHeader
        title="Current medications"
        action={
          overflow > 0 ? (
            <ShowAllButton onClick={() => setOpen(true)} />
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1">
        {medications.length === 0 ? (
          <Empty>No medications recorded.</Empty>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {visible.map((m, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="truncate font-medium text-zinc-900">
                  {m.name}
                </span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {[m.dose, m.frequency].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
            {overflow > 0 && (
              <li className="text-xs text-zinc-500">+ {overflow} more</li>
            )}
          </ul>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Current medications">
        <div className="overflow-hidden rounded-lg ring-1 ring-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Medication</th>
                <th className="px-4 py-2 font-medium">Dose</th>
                <th className="px-4 py-2 font-medium">Frequency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {medications.map((m, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    {m.name}
                  </td>
                  <td className="px-4 py-2 text-zinc-700">{m.dose || "—"}</td>
                  <td className="px-4 py-2 text-zinc-700">
                    {m.frequency || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
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
  const [open, setOpen] = useState(false);
  const long = content.length > 90;
  return (
    <BentoCard>
      <CardHeader
        title={title}
        action={long ? <ShowAllButton onClick={() => setOpen(true)} /> : undefined}
      />
      <div className="min-h-0 flex-1">
        {content ? (
          <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
            {content}
          </p>
        ) : (
          <Empty>{emptyText}</Empty>
        )}
      </div>
      {long && (
        <Modal open={open} onClose={() => setOpen(false)} title={title}>
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-900">
            {content}
          </p>
        </Modal>
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
// Modal
// ---------------------------------------------------------------------------

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-xl ring-1 ring-zinc-200"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 transition hover:text-zinc-900"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 3l12 12M15 3L3 15" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
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
