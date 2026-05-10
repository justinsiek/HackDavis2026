"use client";

import {
  ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  PatientDocument,
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
  const [isChatOpen, setIsChatOpen] = useState(false);

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
    <>
      <div
        className={`flex flex-1 flex-col transition-[margin-right] duration-200 ${
          isChatOpen ? "mr-[420px]" : ""
        }`}
      >
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
                onClick={() => setIsChatOpen((o) => !o)}
                disabled={!data?.patient}
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
              >
                {isChatOpen ? "Close chat" : "Ask AI"}
              </button>
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
            <Bento data={data} onChange={loadPatient} />
          ) : null}
        </main>
      </div>

      <ChatSidebar
        open={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        patientName={data?.patient?.name ?? ""}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Chat sidebar
// ---------------------------------------------------------------------------

function ChatSidebar({
  open,
  onClose,
  patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientName: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      aria-hidden={!open}
      className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-[420px] flex-col border-l border-zinc-200 bg-white shadow-xl transition-transform duration-200 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Ask AI
          </div>
          <div className="font-medium text-zinc-900">
            {patientName || "Patient"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
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
      </header>
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-zinc-400">
        Chat coming soon.
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Bento layout
// ---------------------------------------------------------------------------

function Bento({
  data,
  onChange,
}: {
  data: GetPatientResponse;
  onChange: () => void;
}) {
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

      {/* Row 2: what's-changed (only after the first visit) */}
      {!data.is_first_view && (
        <div className="lg:col-span-12">
          <ChangedCard narrative={data.narrative} />
        </div>
      )}

      {/* Row 3: problems / subjective */}
      <div className="lg:col-span-6">
        <ProblemsCard diagnoses={state?.active_diagnoses ?? []} />
      </div>
      <div className="lg:col-span-6">
        <TextCard
          title="Subjective"
          content={state?.current_presentation ?? ""}
          emptyText="Nothing reported yet."
        />
      </div>

      {/* Row 4: vitals + labs + past medical documents */}
      <div className="lg:col-span-4">
        <VitalsCard vitals={state?.recent_vitals ?? null} series={vitalsSeries} />
      </div>
      <div className="lg:col-span-4">
        <LabsCard labs={labs} />
      </div>
      <div className="lg:col-span-4">
        <DocumentsCard
          patientId={patient.id}
          documents={data.documents}
          onChange={onChange}
        />
      </div>

      {/* Row 5: physical exam + plan & next steps */}
      <div className="lg:col-span-6">
        <TextCard
          title="Physical exam"
          content={state?.physical_exam ?? ""}
          emptyText="No exam findings."
        />
      </div>
      <div className="lg:col-span-6">
        <TextCard
          title="Plan & next steps"
          content={state?.treatment_plan ?? ""}
          emptyText="No plan recorded yet."
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

function ChangedCard({ narrative }: { narrative: string | null }) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm ring-1 ring-amber-100">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
        What&rsquo;s changed since you last saw this patient
      </h2>
      {narrative ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-amber-950">
          {narrative}
        </p>
      ) : (
        <p className="text-sm italic text-amber-900/80">
          Nothing new since your last visit.
        </p>
      )}
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
// Documents
// ---------------------------------------------------------------------------

function DocumentsCard({
  patientId,
  documents,
  onChange,
}: {
  patientId: string;
  documents: PatientDocument[];
  onChange: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const file_data = await fileToBase64(file);
      await api(`/api/patients/${patientId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          file_data,
        }),
      });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleView(doc: PatientDocument) {
    try {
      const result = await api<{
        document: { file_data: string; mime_type: string | null; filename: string };
      }>(`/api/patients/${patientId}/documents/${doc.id}`);
      const blob = base64ToBlob(
        result.document.file_data,
        result.document.mime_type || "application/octet-stream"
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open document");
    }
  }

  async function handleDelete(doc: PatientDocument) {
    if (!window.confirm(`Delete ${doc.filename}?`)) return;
    try {
      await api(`/api/patients/${patientId}/documents/${doc.id}`, {
        method: "DELETE",
      });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <BentoCard>
      <CardHeader
        title="Past medical documents"
        action={
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {busy ? "Uploading…" : "+ Upload"}
          </button>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {documents.length === 0 ? (
        <Empty>No documents uploaded yet.</Empty>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="group flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <DocIcon />
              <button
                type="button"
                onClick={() => handleView(doc)}
                className="min-w-0 flex-1 truncate text-left font-medium text-zinc-900 hover:text-zinc-600 hover:underline"
              >
                {doc.filename}
              </button>
              <span className="shrink-0 text-xs text-zinc-500">
                {new Date(doc.uploaded_at).toLocaleDateString()}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(doc)}
                aria-label={`Delete ${doc.filename}`}
                className="shrink-0 text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
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
    </BentoCard>
  );
}

function DocIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="shrink-0 text-zinc-400"
    >
      <path d="M3 1.5h6.5L13 5v9.5H3z" />
      <path d="M9.5 1.5V5H13" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

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
