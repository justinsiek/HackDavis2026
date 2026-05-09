"use client";

import { FormEvent, useState } from "react";
import { api, Patient } from "@/lib/api";

type Props = {
  onClose: () => void;
  onAdmitted: (patient: Patient) => void;
};

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

export default function AdmitPatientModal({ onClose, onAdmitted }: Props) {
  const [name, setName] = useState("");
  const [sex, setSex] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const ft = feet ? Number(feet) : 0;
      const inch = inches ? Number(inches) : 0;
      const heightCm = feet || inches ? ft * 30.48 + inch * 2.54 : null;
      const { patient } = await api<{ patient: Patient }>("/api/patients", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          sex: sex || null,
          height_cm: heightCm,
        }),
      });
      onAdmitted(patient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to admit patient");
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4 py-8"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg ring-1 ring-zinc-200"
      >
        <h2 className="text-lg font-semibold tracking-tight">Admit patient</h2>
        <p className="mt-1 text-sm text-zinc-500">
          A new patient will be created with empty source-of-truth fields.
        </p>

        <div className="mt-5 space-y-3">
          <Field label="Name" required>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Sex">
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              <option value="F">F</option>
              <option value="M">M</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <div>
            <span className="text-sm font-medium text-zinc-700">Height</span>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                  className={`${inputClass} pr-10`}
                  placeholder="0"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-500">
                  ft
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="11"
                  value={inches}
                  onChange={(e) => setInches(e.target.value)}
                  className={`${inputClass} pr-10`}
                  placeholder="0"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-500">
                  in
                </span>
              </div>
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {isSubmitting ? "Admitting…" : "Admit"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
