"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { api, Patient } from "@/lib/api";

type Props = {
  onClose: () => void;
  onAdmitted: (patient: Patient) => void;
};

const inputStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  color: "var(--text-1)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "14px",
  width: "100%",
  outline: "none",
  display: "block",
  marginTop: "6px",
};

export default function AdmitPatientModal({ onClose, onAdmitted }: Props) {
  const [name, setName] = useState("");
  const [sex, setSex] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!photo) {
      setError("Please take a photo before admitting.");
      return;
    }
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
          photo_data: photo,
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
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      style={{ background: "rgba(15,23,42,0.4)" }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 60px rgba(15,23,42,0.15)",
        }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--text-1)" }}>
              Admit patient
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
              Take a photo and fill in the basics.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
            style={{ color: "var(--text-3)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <PhotoCapture photo={photo} onChange={setPhoto} />

          <div className="space-y-4">
            <Field label="Full name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                required
              />
            </Field>

            <Field label="Sex">
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                style={inputStyle}
              >
                <option value="">—</option>
                <option value="F">Female</option>
                <option value="M">Male</option>
                <option value="other">Other</option>
              </select>
            </Field>

            <div>
              <span className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
                Height
              </span>
              <div className="mt-1.5 grid grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={feet}
                    onChange={(e) => setFeet(e.target.value)}
                    style={{ ...inputStyle, paddingRight: "36px" }}
                    placeholder="0"
                  />
                  <span
                    className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm"
                    style={{ color: "var(--text-3)" }}
                  >
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
                    style={{ ...inputStyle, paddingRight: "36px" }}
                    placeholder="0"
                  />
                  <span
                    className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm"
                    style={{ color: "var(--text-3)" }}
                  >
                    in
                  </span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm" style={{ color: "#dc2626" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t flex justify-end gap-2"
          style={{ borderColor: "var(--border)", background: "#f8fafc" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-bold transition-colors hover:bg-slate-100"
            style={{ color: "var(--text-2)", border: "1px solid var(--border-strong)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim() || !photo}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {isSubmitting ? "Admitting…" : "Admit patient"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PhotoCapture({
  photo,
  onChange,
}: {
  photo: string | null;
  onChange: (photo: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [restartCount, setRestartCount] = useState(0);

  useEffect(() => {
    if (photo) return;
    let cancelled = false;
    setIsReady(false);
    setError(null);

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: "user" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          if (!cancelled) setIsReady(true);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? `Camera unavailable: ${err.message}` : "Camera unavailable");
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [photo, restartCount]);

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const size = 480;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    onChange(canvas.toDataURL("image/jpeg", 0.85));
  }

  function retake() {
    onChange(null);
    setRestartCount((c) => c + 1);
  }

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl" style={{ background: "#0f172a" }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="Patient" className="h-full w-full object-cover" />
      ) : (
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      )}
      <canvas ref={canvasRef} className="hidden" />
      {error && !photo && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white" style={{ background: "rgba(15,23,42,0.8)" }}>
          {error}
        </div>
      )}
      {!photo && !error && !isReady && (
        <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          Starting camera…
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        {photo ? (
          <button
            type="button"
            onClick={retake}
            className="pointer-events-auto rounded-full px-5 py-2 text-sm font-bold shadow-lg transition-opacity hover:opacity-90"
            style={{ background: "var(--surface)", color: "var(--text-1)" }}
          >
            Retake
          </button>
        ) : (
          <button
            type="button"
            onClick={capture}
            disabled={!isReady}
            className="pointer-events-auto rounded-full px-5 py-2 text-sm font-bold shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--surface)", color: "var(--text-1)" }}
          >
            Take photo
          </button>
        )}
      </div>
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
      <span className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
        {label}
        {required && <span style={{ color: "#dc2626" }}> *</span>}
      </span>
      {children}
    </label>
  );
}
