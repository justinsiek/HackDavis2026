"use client";

import { motion } from "framer-motion";

const LOOP_8  = { duration: 8,   repeat: Infinity, ease: "easeInOut" as const };
const LOOP_9  = { duration: 9.5, repeat: Infinity, ease: "easeInOut" as const };
const LOOP_11 = { duration: 11,  repeat: Infinity, ease: "easeInOut" as const };
const LOOP_12 = { duration: 12,  repeat: Infinity, ease: "easeInOut" as const };
const LOOP_7  = { duration: 7.5, repeat: Infinity, ease: "easeInOut" as const };

type Props = { size?: number };

// 4-pointed diamond sparkle matching the Clair logo icon.
// Control points at ~30% from center axis give the concave curved sides.
function sparkleClip(s: number): string {
  const h = s / 2;
  const c = 0.18; // how far inward the curve pinches (lower = wider/rounder sides)
  return [
    `M ${h} 0`,
    `C ${h + h * 0.06} ${s * c} ${s - s * c} ${h - h * 0.06} ${s} ${h}`,
    `C ${s - s * c} ${h + h * 0.06} ${h + h * 0.06} ${s - s * c} ${h} ${s}`,
    `C ${h - h * 0.06} ${s - s * c} ${s * c} ${h + h * 0.06} 0 ${h}`,
    `C ${s * c} ${h - h * 0.06} ${h - h * 0.06} ${s * c} ${h} 0 Z`,
  ].join(" ");
}

export default function StarOrb({ size = 300 }: Props) {
  const clip = sparkleClip(size);

  return (
    <div
      style={{ position: "relative", width: size, height: size }}
      aria-hidden="true"
    >
      {/* Ambient glow — bleeds out on all sides */}
      <motion.div
        animate={{ opacity: [0.28, 0.55, 0.28], scale: [1, 1.12, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: "-35%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(71,128,255,0.45) 0%, rgba(71,128,255,0.18) 45%, transparent 70%)",
          filter: "blur(28px)",
          pointerEvents: "none",
        }}
      />

      {/* Star shell — breathes + drift-rotate */}
      <motion.div
        animate={{ scale: [1, 1.06, 0.97, 1.04, 1], rotate: [0, 8, -5, 3, 0] }}
        transition={{
          scale: { duration: 5, repeat: Infinity, ease: "easeInOut" },
          rotate: { duration: 9, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        {/* Clipped blob container */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `path('${clip}')`,
          }}
        >
          {/* Base gradient */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(145deg, #DBEAFE 0%, #BFDBFE 50%, #93C5FD 100%)",
            }}
          />

          {/* Blob 1 — top-left, sky blue */}
          <motion.div
            animate={{ opacity: [0.82, 1, 0.72, 0.9, 0.82], x: [0, 26, -16, 12, 0], y: [0, -20, 16, -13, 0] }}
            transition={LOOP_8}
            style={{
              position: "absolute", width: "72%", height: "72%",
              top: "-6%", left: "-6%",
              background: "#60A5FA", filter: "blur(26px)", borderRadius: "50%",
            }}
          />

          {/* Blob 2 — top-right, accent #4780ff */}
          <motion.div
            animate={{ opacity: [0.68, 0.88, 0.58, 0.78, 0.68], x: [0, -28, 17, -20, 0], y: [0, 17, -24, 20, 0] }}
            transition={LOOP_9}
            style={{
              position: "absolute", width: "66%", height: "66%",
              top: "-6%", right: "-6%",
              background: "#4780ff", filter: "blur(22px)", borderRadius: "50%",
            }}
          />

          {/* Blob 3 — bottom-right, teal-sky */}
          <motion.div
            animate={{ opacity: [0.6, 0.8, 0.52, 0.72, 0.6], x: [0, 22, -24, 16, 0], y: [0, 28, -17, 24, 0] }}
            transition={LOOP_11}
            style={{
              position: "absolute", width: "62%", height: "62%",
              bottom: "-6%", right: "-6%",
              background: "#38BDF8", filter: "blur(22px)", borderRadius: "50%",
            }}
          />

          {/* Blob 4 — bottom-left, pale blue */}
          <motion.div
            animate={{ opacity: [0.64, 0.84, 0.5, 0.74, 0.64], x: [0, -22, 28, -17, 0], y: [0, -25, 20, -28, 0] }}
            transition={LOOP_12}
            style={{
              position: "absolute", width: "60%", height: "60%",
              bottom: "-6%", left: "-6%",
              background: "#93C5FD", filter: "blur(20px)", borderRadius: "50%",
            }}
          />

          {/* Blob 5 — center pulse, deep indigo */}
          <motion.div
            animate={{ opacity: [0.42, 0.68, 0.32, 0.6, 0.42], scale: [1, 1.32, 0.82, 1.22, 1] }}
            transition={LOOP_7}
            style={{
              position: "absolute", width: "46%", height: "46%",
              top: "27%", left: "27%",
              background: "#1D4ED8", filter: "blur(18px)", borderRadius: "50%",
            }}
          />

          {/* Specular highlight */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 34% 27%, rgba(255,255,255,0.52) 0%, transparent 52%)",
            }}
          />

          {/* Edge vignette */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 50% 50%, transparent 40%, rgba(15,40,100,0.14) 100%)",
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}
