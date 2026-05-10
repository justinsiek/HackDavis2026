"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  Diagnosis,
  EditableField,
  FieldChange,
  Medication,
  Vitals,
  getFieldChanges,
} from "@/lib/api";

const FIELD_TITLES: Record<EditableField, string> = {
  synopsis: "Synopsis",
  current_presentation: "Subjective",
  active_diagnoses: "Active problems",
  current_medications: "Current medications",
  recent_vitals: "Recent vitals",
  treatment_plan: "Plan & next steps",
  long_term_goals: "Long-term goals",
};

type Pair = {
  label: { red: string; green: string };
  red: unknown;
  green: unknown;
};

export function FieldHistoryPopup({
  patientId,
  field,
  viewerSnapshotValue,
  currentValue,
  onClose,
}: {
  patientId: string;
  field: EditableField;
  viewerSnapshotValue: unknown;
  currentValue: unknown;
  onClose: () => void;
}) {
  const [changes, setChanges] = useState<FieldChange[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setChanges(null);
    getFieldChanges(patientId, field)
      .then((res) => {
        if (cancelled) return;
        setChanges(res.changes);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          // Auth expiry — let the page-level handler take over by closing.
          onClose();
          return;
        }
        setLoadError(
          err instanceof Error ? err.message : "Failed to load history"
        );
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, field, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedChange = useMemo(
    () => changes?.find((c) => c.id === selectedId) ?? null,
    [changes, selectedId]
  );

  const pair: Pair = selectedChange
    ? {
        label: { red: "Before this edit", green: "After this edit" },
        red: selectedChange.before_value,
        green: selectedChange.after_value,
      }
    : {
        label: {
          red: "When you last viewed this patient",
          green: "Current record",
        },
        red: viewerSnapshotValue,
        green: currentValue,
      };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-history-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4 py-8 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-zinc-200"
      >
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-3">
          <div>
            <h2
              id="field-history-title"
              className="text-base font-semibold text-[#0F172A]"
            >
              {FIELD_TITLES[field]} · history
            </h2>
            <p className="text-xs text-[#0F172A]">
              {selectedChange
                ? "Showing a single past edit. Click ‘Back to current’ to compare with what you last saw."
                : "Compare what you last saw with the current record."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-[#0F172A] transition hover:bg-zinc-100 hover:text-[#0F172A]"
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

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto px-5 py-4 md:grid-cols-2">
          <DiffPanel tone="red" label={pair.label.red} field={field} value={pair.red} />
          <DiffPanel tone="green" label={pair.label.green} field={field} value={pair.green} />
        </div>

        <div className="flex max-h-[40vh] min-h-0 flex-col border-t border-zinc-200">
          <div className="flex items-center justify-between gap-2 px-5 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#0F172A]">
              Prior edits
            </h3>
            {selectedChange && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-[#0F172A] hover:bg-zinc-50"
              >
                ← Back to current
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">
            <ChangeList
              changes={changes}
              loadError={loadError}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffPanel({
  tone,
  label,
  field,
  value,
}: {
  tone: "red" | "green";
  label: string;
  field: EditableField;
  value: unknown;
}) {
  const ring =
    tone === "red"
      ? "ring-[#FECACA] bg-[#FEF2F2]"
      : "ring-[#A7F3D0] bg-[#ECFDF5]";
  const dotColor = tone === "red" ? "#EF4444" : "#10B981";
  return (
    <section className={`rounded-lg p-3 ring-1 ${ring}`}>
      <h4 className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#0F172A]">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
        {label}
      </h4>
      <FieldValueDisplay field={field} value={value} />
    </section>
  );
}

function ChangeList({
  changes,
  loadError,
  selectedId,
  onSelect,
}: {
  changes: FieldChange[] | null;
  loadError: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (loadError) {
    return (
      <p
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm"
        style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#EF4444" }} />
        {loadError}
      </p>
    );
  }
  if (changes === null) {
    return <p className="text-sm italic text-[#0F172A]">Loading…</p>;
  }
  if (changes.length === 0) {
    return (
      <p className="text-sm italic text-[#0F172A]">
        No prior edits to this field.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-100 text-sm">
      {changes.map((c) => {
        const isSelected = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-baseline justify-between gap-3 py-2 text-left transition ${
                isSelected ? "bg-zinc-50" : "hover:bg-zinc-50"
              }`}
            >
              <span className="truncate font-medium text-[#0F172A]">
                {c.changed_by_name ?? "Unknown doctor"}
              </span>
              <span className="shrink-0 text-xs text-[#0F172A]">
                {formatTimestamp(c.changed_at)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Read-only renderers for each editable field. Inputs are unknown because
// changelog values are jsonb — we narrow defensively.
// ---------------------------------------------------------------------------

function FieldValueDisplay({
  field,
  value,
}: {
  field: EditableField;
  value: unknown;
}) {
  switch (field) {
    case "synopsis":
    case "current_presentation":
    case "treatment_plan":
    case "long_term_goals":
      return <ProseValue value={value} />;
    case "active_diagnoses":
      return <DiagnosesValue value={value} />;
    case "current_medications":
      return <MedicationsValue value={value} />;
    case "recent_vitals":
      return <VitalsValue value={value} />;
  }
}

function ProseValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <EmptyValue />;
  if (typeof value !== "string") return <RawJsonFallback value={value} />;
  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-[#0F172A]">
      {value}
    </p>
  );
}

function DiagnosesValue({ value }: { value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return <EmptyValue />;
  const items = value as Partial<Diagnosis>[];
  return (
    <ul className="divide-y divide-zinc-200/60 text-sm">
      {items.map((d, i) => (
        <li key={i} className="py-1.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-[#0F172A]">
              {d.condition || "—"}
            </span>
            {d.since && (
              <span className="shrink-0 text-xs text-[#0F172A]">
                since {d.since}
              </span>
            )}
          </div>
          {d.notes && (
            <p className="mt-0.5 text-sm leading-6 text-[#0F172A]">{d.notes}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function MedicationsValue({ value }: { value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return <EmptyValue />;
  const items = value as Partial<Medication>[];
  return (
    <ul className="divide-y divide-zinc-200/60 text-sm">
      {items.map((m, i) => (
        <li
          key={i}
          className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0"
        >
          <span className="font-medium text-[#0F172A]">{m.name || "—"}</span>
          <span className="text-right text-xs text-[#0F172A]">
            {[m.dose, m.frequency].filter(Boolean).join(" · ") || "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function VitalsValue({ value }: { value: unknown }) {
  if (value == null) return <EmptyValue />;
  if (typeof value !== "object") return <RawJsonFallback value={value} />;
  const v = value as Partial<Vitals>;
  const rows: { label: string; val: string | undefined }[] = [
    { label: "BP", val: v.bp },
    { label: "HR", val: v.hr },
    { label: "Temp", val: v.temp_c ? `${v.temp_c}°C` : undefined },
    { label: "O₂", val: v.o2_sat ? `${v.o2_sat}%` : undefined },
  ];
  return (
    <div className="text-sm">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between">
            <dt className="text-xs uppercase tracking-wide text-[#0F172A]">
              {r.label}
            </dt>
            <dd className="tabular-nums text-[#0F172A]">{r.val || "—"}</dd>
          </div>
        ))}
      </dl>
      {v.taken_at && (
        <p className="mt-2 text-xs text-[#0F172A]">
          taken {formatTimestamp(v.taken_at)}
        </p>
      )}
    </div>
  );
}

function EmptyValue() {
  return <p className="text-sm italic text-[#0F172A]">Empty</p>;
}

function RawJsonFallback({ value }: { value: unknown }): ReactNode {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[#0F172A]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
