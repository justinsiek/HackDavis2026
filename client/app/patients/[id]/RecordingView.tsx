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

type Word = {
  word: string;
  punctuated_word?: string;
  speaker?: number;
};

type Turn = {
  speaker: number;
  text: string;
};

const SPEAKER_STYLES: { label: string; bubble: string; dot: string }[] = [
  { label: "text-[#0F172A]", bubble: "bg-[#EFF6FF] ring-[#BFDBFE]", dot: "#3B82F6" },
  { label: "text-[#0F172A]", bubble: "bg-[#ECFDF5] ring-[#A7F3D0]", dot: "#10B981" },
  { label: "text-[#0F172A]", bubble: "bg-[#F5F3FF] ring-[#DDD6FE]", dot: "#8B5CF6" },
  { label: "text-[#0F172A]", bubble: "bg-[#FFFBEB] ring-[#FDE68A]", dot: "#F59E0B" },
];

function speakerStyle(speaker: number, doctorSpeaker: number | null) {
  // If we know who the doctor is, lock styles: doctor → first style, patient → second.
  if (doctorSpeaker !== null) {
    return speaker === doctorSpeaker ? SPEAKER_STYLES[0] : SPEAKER_STYLES[1];
  }
  return SPEAKER_STYLES[speaker % SPEAKER_STYLES.length];
}

function speakerLabel(speaker: number, doctorSpeaker: number | null): string {
  if (doctorSpeaker === null) return `Speaker ${speaker}`;
  return speaker === doctorSpeaker ? "Doctor" : "Patient";
}

function wordsToTurns(words: Word[]): Turn[] {
  const turns: Turn[] = [];
  for (const w of words) {
    // Only ever 2 speakers in a doctor-patient session — clamp any stray
    // extra speakers Deepgram occasionally hallucinates back to speaker 1.
    const speaker = Math.min(w.speaker ?? 0, 1);
    const text = w.punctuated_word ?? w.word;
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.speaker === speaker) {
      last.text += " " + text;
    } else {
      turns.push({ speaker, text });
    }
  }
  return turns;
}

function appendTurns(prev: Turn[], incoming: Turn[]): Turn[] {
  if (incoming.length === 0) return prev;
  const result = prev.slice();
  for (const t of incoming) {
    const last = result[result.length - 1];
    if (last && last.speaker === t.speaker) {
      result[result.length - 1] = {
        speaker: last.speaker,
        text: last.text + " " + t.text,
      };
    } else {
      result.push(t);
    }
  }
  return result;
}

export default function RecordingView({ patient, visitId, onDone }: Props) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [finalTurns, setFinalTurns] = useState<Turn[]>([]);
  const [interimText, setInterimText] = useState("");
  const [doctorSpeaker, setDoctorSpeaker] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const dgRef = useRef<DGSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  // Boot: open mic + Deepgram WS, start recording.
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
          endpointing: "300",
          vad_events: "true",
          diarize: "true",
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
          recorder.start(100);
          mediaRecorderRef.current = recorder;
          segmentStartRef.current = Date.now();
          setStatus("recording");
        });

        socket.on("message", (msg) => {
          if (msg.type !== "Results") return;
          const alt = msg.channel.alternatives[0];
          if (!alt) return;
          if (msg.is_final) {
            const words = (alt.words ?? []) as Word[];
            const turns = wordsToTurns(words);
            if (turns.length === 0) return;
            setDoctorSpeaker((curr) => curr ?? turns[0].speaker);
            setFinalTurns((prev) => appendTurns(prev, turns));
            setInterimText("");
          } else {
            // Interim results don't carry reliable speaker tags — render flat.
            setInterimText(alt.transcript ?? "");
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
    const transcriptParts = finalTurns.map(
      (t) => `${speakerLabel(t.speaker, doctorSpeaker)}: ${t.text}`
    );
    const tail = interimText.trim();
    if (tail) transcriptParts.push(tail);
    const transcript = transcriptParts.join("\n");
    try {
      await api(`/api/visits/${visitId}/finalize`, {
        method: "POST",
        body: JSON.stringify({ transcript }),
      });
      onDone();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save transcript"
      );
      setStatus("error");
    }
  }

  const hasAnyText = finalTurns.length > 0 || interimText.length > 0;

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
          {hasAnyText ? (
            <div className="space-y-3">
              {doctorSpeaker !== null && (
                <div className="flex justify-end">
                  <button
                    onClick={() =>
                      setDoctorSpeaker((curr) => (curr === null ? null : 1 - curr))
                    }
                    className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline"
                  >
                    Swap doctor / patient
                  </button>
                </div>
              )}
              {finalTurns.map((turn, i) => (
                <TurnLine
                  key={`f-${i}`}
                  turn={turn}
                  doctorSpeaker={doctorSpeaker}
                />
              ))}
              {interimText && (
                <p className="px-3 text-base italic leading-7 text-zinc-400">
                  {interimText}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm italic text-zinc-400">
              {status === "connecting" ? "Connecting…" : "Start speaking…"}
            </p>
          )}
        </div>

        {errorMessage && (
          <div
            className="mt-4 flex items-start gap-2 rounded-md px-4 py-3 text-sm"
            style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
          >
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#EF4444" }} />
            <span>{errorMessage}</span>
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

function TurnLine({
  turn,
  doctorSpeaker,
}: {
  turn: Turn;
  doctorSpeaker: number | null;
}) {
  const style = speakerStyle(turn.speaker, doctorSpeaker);
  const label = speakerLabel(turn.speaker, doctorSpeaker);
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ring-inset ${style.bubble}`}>
      <div
        className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${style.label}`}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.dot }} />
        {label}
      </div>
      <div className="mt-0.5 text-base leading-7 text-zinc-900">
        {turn.text}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "recording")
    return (
      <span className="flex items-center gap-1.5 text-sm text-[#0F172A]">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#EF4444]" />
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
  return (
    <span className="flex items-center gap-1.5 text-sm text-[#0F172A]">
      <span className="inline-block h-2 w-2 rounded-full bg-[#EF4444]" />
      Error
    </span>
  );
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
