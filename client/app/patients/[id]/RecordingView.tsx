"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DeepgramClient } from "@deepgram/sdk";
import { api, Patient } from "@/lib/api";
import { motion } from "framer-motion";
import SoftOrb from "@/components/SoftOrb";
import { useMicAmplitude } from "@/lib/useMicAmplitude";

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

type FloatingWord = {
  id: number;
  text: string;
  x: number;
  xEnd: number;
  yStart: number;
};


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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [floatingWords, setFloatingWords] = useState<FloatingWord[]>([]);

  const amplitude = useMicAmplitude(stream, status === "recording");

  const dgRef = useRef<DGSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const floatingWordIdRef = useRef(0);
  const prevInterimWordCountRef = useRef(0);

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
        setStream(stream);

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

  // Float new words upward as they appear in the interim transcript.
  useEffect(() => {
    const words = interimText.trim().split(/\s+/).filter(Boolean);
    const prevCount = prevInterimWordCountRef.current;

    if (!interimText) {
      prevInterimWordCountRef.current = 0;
      return;
    }
    if (words.length <= prevCount) return;

    const newWords = words.slice(prevCount);
    prevInterimWordCountRef.current = words.length;

    newWords.forEach((word, i) => {
      const id = floatingWordIdRef.current++;
      const x = (Math.random() - 0.5) * 340;
      const xEnd = x + (Math.random() - 0.5) * 60;
      const yStart = 50 + Math.random() * 80;
      const delay = i * 220;
      setTimeout(() => {
        setFloatingWords((fw) => [...fw.slice(-30), { id, text: word, x, xEnd, yStart }]);
        setTimeout(() => setFloatingWords((fw) => fw.filter((w) => w.id !== id)), 4200);
      }, delay);
    });
  }, [interimText]);

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
    const transcriptParts = finalTurns.map((t) => {
      const label =
        doctorSpeaker === null
          ? `Speaker ${t.speaker}`
          : t.speaker === doctorSpeaker
            ? "Doctor"
            : "Patient";
      return `${label}: ${t.text}`;
    });
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-[#0F172A]">
              Recording with
            </div>
            <div className="font-medium text-[#0F172A]">{patient.name}</div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <span className="font-mono text-sm tabular-nums text-[#0F172A]">
              {formatTime(elapsedMs)}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Orb + floating words canvas */}
        <div className="relative flex items-center justify-center" style={{ width: 360, height: 420 }}>
          {/* Floating words */}
          {floatingWords.map((w) => (
            <motion.span
              key={w.id}
              initial={{ opacity: 0, y: w.yStart, x: w.x }}
              animate={{ opacity: [0, 0.85, 0.65, 0], y: w.yStart - 260, x: w.xEnd }}
              transition={{ duration: 4, ease: "easeOut", times: [0, 0.1, 0.68, 1] }}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                marginLeft: "-50%",
                width: "100%",
                textAlign: "center",
                fontSize: 15,
                fontWeight: 500,
                color: "#4780ff",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                letterSpacing: "0.01em",
              }}
            >
              {w.text}
            </motion.span>
          ))}

          {/* Orb — centered in the lower portion so words have room above */}
          <div style={{ position: "absolute", bottom: 20 }}>
            <SoftOrb
              amplitude={amplitude}
              state={status === "saving" ? "connecting" : status}
              size={260}
            />
          </div>
        </div>

        <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#9AA3BA]">
          Clair
        </div>

        {errorMessage && (
          <div
            className="mt-6 flex items-start gap-2 rounded-md px-4 py-3 text-sm max-w-sm w-full"
            style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
          >
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#EF4444" }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mt-10 flex w-full max-w-sm items-center justify-between">
          <p className="text-sm text-[#637089]">
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
              className="rounded-full border border-[#e2e8f0] bg-white px-4 py-1.5 text-[13px] font-bold text-[#0D1424] hover:bg-slate-50 disabled:opacity-50"
            >
              {status === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              onClick={handleDone}
              disabled={status === "connecting" || status === "saving"}
              className="rounded-full bg-[#4780ff] px-4 py-1.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60"
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
      <span className="flex items-center gap-1.5 text-sm text-[#0F172A]">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#EF4444]" />
        Recording
      </span>
    );
  if (status === "paused")
    return (
      <span className="flex items-center gap-1.5 text-sm text-[#0F172A]">
        <span className="inline-block h-2 w-2 rounded-full bg-zinc-400" />
        Paused
      </span>
    );
  if (status === "connecting")
    return <span className="text-sm text-[#0F172A]">Connecting…</span>;
  if (status === "saving")
    return <span className="text-sm text-[#0F172A]">Saving…</span>;
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
