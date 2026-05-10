"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
          Take a photo and fill in the basics.
        </p>

        <div className="mt-5">
          <PhotoCapture photo={photo} onChange={setPhoto} />
        </div>

        <div className="mt-5 space-y-3">
          <Field label="Name" required>
            <input
              type="text"
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
            disabled={isSubmitting || !name.trim() || !photo}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {isSubmitting ? "Admitting…" : "Admit"}
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

  // Boot / restart camera when there's no photo yet.
  useEffect(() => {
    if (photo) return;
    let cancelled = false;
    setIsReady(false);
    setError(null);

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 640 },
            facingMode: "user",
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          if (!cancelled) setIsReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Camera unavailable: ${err.message}`
              : "Camera unavailable"
          );
        }
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
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onChange(dataUrl);
  }

  function retake() {
    onChange(null);
    setRestartCount((c) => c + 1);
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-900">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt="Patient"
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
        {error && !photo && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 p-4 text-center text-sm text-white">
            {error}
          </div>
        )}
        {!photo && !error && !isReady && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Starting camera…
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
          {photo ? (
            <button
              type="button"
              onClick={retake}
              className="pointer-events-auto rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-zinc-900 shadow hover:bg-white"
            >
              Retake
            </button>
          ) : (
            <button
              type="button"
              onClick={capture}
              disabled={!isReady}
              className="pointer-events-auto rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-zinc-900 shadow hover:bg-white disabled:opacity-60"
            >
              Take photo
            </button>
          )}
        </div>
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
      <span className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
