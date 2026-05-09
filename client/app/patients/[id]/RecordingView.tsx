"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DeepgramClient } from "@deepgram/sdk";
import { api, Patient } from "@/lib/api";

type Props = {
  patient: Patient;
  visitId: string;
  onDone: () => void;
};

const DEEPGRAM_API_KEY = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;

type Status = "connecting" | "recording" | "paused" | "saving" | "error";

type DGSocket = Awaited<
  ReturnType<DeepgramClient["listen"]["v1"]["connect"]>
>;

export default function RecordingView({ patient, visitId, onDone }: Props) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [finals, setFinals] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);

  const dgRef = useRef<DGSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  // Boot: create visit, mint Deepgram token, open mic + WS, start recording.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        if (!DEEPGRAM_API_KEY) {
          throw new Error(
            "Missing NEXT_PUBLIC_DEEPGRAM_API_KEY. Add it to client/.env.local and restart npm run dev."
          );
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        const client = new DeepgramClient({ apiKey: DEEPGRAM_API_KEY });
        const socket = await client.listen.v1.connect({
          model: "nova-3-medical",
          language: "en-US",
          smart_format: "true",
          interim_results: "true",
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
        });
        if (cancelled) return;
        dgRef.current = socket;

        socket.on("open", () => {
          if (cancelled) return;
          const mimeType = MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
          const recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
          recorder.ondataavailable = (e) => {
            if (e.data.size === 0) return;
            try {
              socket.sendMedia(e.data);
            } catch {
              // Socket closed (e.g., StrictMode cleanup or visit ended) — drop chunk.
            }
          };
          recorder.start(250);
          mediaRecorderRef.current = recorder;
          segmentStartRef.current = Date.now();
          setStatus("recording");
        });

        socket.on("message", (msg) => {
          if (msg.type !== "Results") return;
          const text = msg.channel.alternatives[0]?.transcript ?? "";
          if (!text) return;
          if (msg.is_final) {
            setFinals((prev) => [...prev, text]);
            setInterim("");
          } else {
            setInterim(text);
          }
        });

        socket.on("error", (err) => {
          if (cancelled) return;
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setStatus("error");
        });

        socket.connect();
        await socket.waitForOpen();
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    boot();
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  // Elapsed timer (only counts while recording).
  useEffect(() => {
    if (status !== "recording") return;
    segmentStartRef.current = Date.now();
    const interval = setInterval(() => {
      const start = segmentStartRef.current ?? Date.now();
      setElapsedMs(accumulatedMsRef.current + (Date.now() - start));
    }, 200);
    return () => {
      clearInterval(interval);
      const start = segmentStartRef.current ?? Date.now();
      accumulatedMsRef.current += Date.now() - start;
      segmentStartRef.current = null;
      setElapsedMs(accumulatedMsRef.current);
    };
  }, [status]);

  const togglePause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (status === "recording") {
      recorder.pause();
      setStatus("paused");
    } else if (status === "paused") {
      recorder.resume();
      setStatus("recording");
    }
  }, [status]);

  // Spacebar: toggle pause/resume.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (status === "recording" || status === "paused") togglePause();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [status, togglePause]);

  function cleanup() {
    try {
      mediaRecorderRef.current?.stop();
    } catch {}
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      dgRef.current?.close();
    } catch {}
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    dgRef.current = null;
  }

  async function handleDone() {
    setStatus("saving");
    cleanup();
    const finalText = [...finals, interim].filter(Boolean).join(" ").trim();
    try {
      await api(`/api/visits/${visitId}/finalize`, {
        method: "POST",
        body: JSON.stringify({ transcript: finalText }),
      });
      onDone();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save transcript"
      );
      setStatus("error");
    }
  }

  const transcriptText = finals.join(" ");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Recording with
            </div>
            <div className="font-medium text-zinc-900">{patient.name}</div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <span className="font-mono text-sm tabular-nums text-zinc-600">
              {formatTime(elapsedMs)}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <div className="min-h-[300px] rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          {transcriptText || interim ? (
            <p className="text-base leading-7 text-zinc-900">
              {transcriptText}
              {interim && <span className="text-zinc-400"> {interim}</span>}
            </p>
          ) : (
            <p className="text-sm italic text-zinc-400">
              {status === "connecting" ? "Connecting…" : "Start speaking…"}
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Press{" "}
            <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">
              Space
            </kbd>{" "}
            to {status === "paused" ? "resume" : "pause"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={togglePause}
              disabled={status !== "recording" && status !== "paused"}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {status === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              onClick={handleDone}
              disabled={status === "connecting" || status === "saving"}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {status === "saving" ? "Saving…" : "Done"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "recording")
    return (
      <span className="flex items-center gap-1.5 text-sm text-red-600">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />
        Recording
      </span>
    );
  if (status === "paused")
    return (
      <span className="flex items-center gap-1.5 text-sm text-zinc-500">
        <span className="inline-block h-2 w-2 rounded-full bg-zinc-400" />
        Paused
      </span>
    );
  if (status === "connecting")
    return <span className="text-sm text-zinc-500">Connecting…</span>;
  if (status === "saving")
    return <span className="text-sm text-zinc-500">Saving…</span>;
  return <span className="text-sm text-red-600">Error</span>;
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
