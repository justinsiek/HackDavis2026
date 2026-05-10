"use client";

import { useEffect } from "react";
import { MotionValue, useMotionValue } from "framer-motion";

/**
 * Reads RMS amplitude from a MediaStream and exposes it as a framer MotionValue
 * (so the consumer can drive animations without per-frame React re-renders).
 *
 * Returns a MotionValue normalized roughly to 0–1, where 0 ≈ silence and
 * speech typically lives in the 0.2–0.8 range.
 */
export function useMicAmplitude(
  stream: MediaStream | null,
  active: boolean
): MotionValue<number> {
  const amp = useMotionValue(0);

  useEffect(() => {
    if (!stream || !active) {
      amp.set(0);
      return;
    }

    const Ctor =
      (window.AudioContext as typeof AudioContext | undefined) ??
      ((window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext as typeof AudioContext | undefined);
    if (!Ctor) return;

    const ctx = new Ctor();
    let src: MediaStreamAudioSourceNode | null = null;
    try {
      src = ctx.createMediaStreamSource(stream);
    } catch {
      ctx.close();
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let smooth = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      analyser.getByteTimeDomainData(data);
      // RMS over the time-domain window.
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      // Speech RMS is typically 0.05–0.25 — boost so we get a usable 0–1 range,
      // then exponential smoothing so the orb doesn't jitter.
      const normalized = Math.min(1, rms * 5);
      smooth = smooth * 0.7 + normalized * 0.3;
      amp.set(smooth);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try {
        src?.disconnect();
      } catch {
        // ignore
      }
      ctx.close().catch(() => {
        // ignore
      });
      amp.set(0);
    };
  }, [stream, active, amp]);

  return amp;
}
