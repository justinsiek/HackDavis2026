"use client";

import { motion, MotionValue, useTransform } from "framer-motion";

export type OrbState = "connecting" | "recording" | "paused" | "error";

type Props = {
  amplitude: MotionValue<number>;
  state: OrbState;
  size?: number;
};

const LOOP_8  = { duration: 8,   repeat: Infinity, ease: "easeInOut" as const };
const LOOP_9  = { duration: 9.5, repeat: Infinity, ease: "easeInOut" as const };
const LOOP_11 = { duration: 11,  repeat: Infinity, ease: "easeInOut" as const };
const LOOP_12 = { duration: 12,  repeat: Infinity, ease: "easeInOut" as const };
const LOOP_7  = { duration: 7.5, repeat: Infinity, ease: "easeInOut" as const };

export default function SoftOrb({ amplitude, state, size = 300 }: Props) {
  const isActive  = state === "recording";
  const isQuiet   = state === "paused" || state === "error";

  const orbScale    = useTransform(amplitude, [0, 1], [1, 1.08]);
  const glowOpacity = useTransform(amplitude, [0, 1], [0.22, 0.7]);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
      aria-hidden="true"
    >
      {/* Orb + full 360° glow group — floating */}
      <motion.div
        animate={{ y: [0, -18, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "relative", width: size, height: size, willChange: "transform" }}
      >

        {/* 360° glow — blurred circle behind the orb, bleeds out on all sides */}
        <motion.div
          style={{
            position: "absolute",
            inset: "-25%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(71,128,255,0.75) 0%, rgba(71,128,255,0.45) 45%, transparent 70%)",
            filter: "blur(32px)",
            opacity: isActive ? glowOpacity : isQuiet ? 0.15 : 0.45,
            pointerEvents: "none",
          }}
          animate={
            !isActive && !isQuiet
              ? { opacity: [0.38, 0.55, 0.38] }
              : undefined
          }
          transition={
            !isActive && !isQuiet
              ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
              : undefined
          }
        />

        {/* Orb shell */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow: isActive
              ? "0 12px 50px rgba(71,128,255,0.2), 0 0 0 1px rgba(71,128,255,0.12)"
              : "0 8px 32px rgba(71,128,255,0.08)",
            opacity: isQuiet ? 0.6 : 1,
            scale: isActive ? orbScale : undefined,
          }}
          animate={!isActive ? { scale: [1, 1.016, 1] } : undefined}
          transition={
            !isActive
              ? { duration: state === "connecting" ? 3.2 : 6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.1 }
          }
        >
          {/* Base gradient */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(145deg, #DBEAFE 0%, #BFDBFE 50%, #93C5FD 100%)",
            }}
          />

          {/* blob 1 — top-left, sky blue */}
          <motion.div
            animate={{ opacity: [0.82, 1, 0.72, 0.9, 0.82] }}
            transition={{ opacity: LOOP_8 }}
            style={{ position: "absolute", width: "72%", height: "72%", top: "-6%", left: "-6%", background: "#60A5FA", filter: "blur(62px)", borderRadius: "50%" }}
          />

          {/* blob 2 — top-right, deep accent */}
          <motion.div
            animate={{ opacity: [0.68, 0.88, 0.58, 0.78, 0.68] }}
            transition={{ opacity: LOOP_9 }}
            style={{ position: "absolute", width: "66%", height: "66%", top: "-6%", right: "-6%", background: "#4780ff", filter: "blur(56px)", borderRadius: "50%" }}
          />

          {/* blob 3 — bottom-right, teal-sky */}
          <motion.div
            animate={{ opacity: [0.6, 0.8, 0.52, 0.72, 0.6] }}
            transition={{ opacity: LOOP_11 }}
            style={{ position: "absolute", width: "62%", height: "62%", bottom: "-6%", right: "-6%", background: "#38BDF8", filter: "blur(58px)", borderRadius: "50%" }}
          />

          {/* blob 4 — bottom-left, pale blue */}
          <motion.div
            animate={{ opacity: [0.64, 0.84, 0.5, 0.74, 0.64] }}
            transition={{ opacity: LOOP_12 }}
            style={{ position: "absolute", width: "60%", height: "60%", bottom: "-6%", left: "-6%", background: "#93C5FD", filter: "blur(52px)", borderRadius: "50%" }}
          />

          {/* blob 5 — center pulse, indigo depth */}
          <motion.div
            animate={{ opacity: [0.42, 0.62, 0.32, 0.55, 0.42], scale: [1, 1.18, 0.88, 1.12, 1] }}
            transition={{ opacity: LOOP_7, scale: LOOP_7 }}
            style={{ position: "absolute", width: "46%", height: "46%", top: "27%", left: "27%", background: "#1D4ED8", filter: "blur(44px)", borderRadius: "50%" }}
          />

          {/* Specular highlight */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 34% 27%, rgba(255,255,255,0.44) 0%, transparent 52%)" }} />
          {/* Edge vignette */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 50%, transparent 42%, rgba(15,40,100,0.16) 100%)" }} />
        </motion.div>
      </motion.div>

      {/* Ground glow — pulses inverse to float */}
      <motion.div
        animate={{ scaleX: [1, 0.78, 1], opacity: [0.8, 0.35, 0.8] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: size * 0.75,
          height: 32,
          background: "radial-gradient(ellipse, rgba(71,128,255,0.65) 0%, transparent 70%)",
          filter: "blur(22px)",
          borderRadius: "50%",
          marginTop: -8,
        }}
      />
    </div>
  );
}
