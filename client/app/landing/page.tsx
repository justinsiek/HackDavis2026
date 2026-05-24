"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionTemplate,
  useInView,
  AnimatePresence,
} from "framer-motion";
import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────


const FEATURES = [
  {
    id: "transcription",
    label: "Medical-grade transcription",
    dot: "#4780ff",
    badge: "LIVE TRANSCRIPTION",
    heading: "Every word, exactly as spoken.",
    body: "Deepgram nova-3-medical separates doctor from patient in real time. Every word of every visit, captured exactly as spoken.",
  },
  {
    id: "soap",
    label: "SOAP via Claude Sonnet 4.6",
    dot: "#10B981",
    badge: "SOAP EXTRACTION",
    heading: "The framework that trained doctors use.",
    body: "Subjective, Objective, Assessment, Plan — the clinical framework taught at Harvard Medical School. Claude reads the transcript and writes it all.",
  },
  {
    id: "snapshots",
    label: "Per-doctor change snapshots",
    dot: "#F59E0B",
    badge: "HANDOFF SNAPSHOTS",
    heading: "Every shift inherits the last.",
    body: "Every doctor leaves a delta: what changed, what they found, what they ordered. The next shift inherits the full picture.",
  },
  {
    id: "diarization",
    label: "Speaker diarization",
    dot: "#8B5CF6",
    badge: "DIARIZATION",
    heading: "Clair knows who is talking.",
    body: "Clair knows who is talking. The transcript stays clean even when three people are in the room.",
  },
];

const PROBLEM_BULLETS = [
  {
    title: "She says the dog's name to every new doctor who walks in",
    body: "A grandmother with cognitive decline still remembers her dog. The doctors who walk into her room don't remember her. Every shift, she starts from scratch.",
  },
  {
    title: "He has told the story of his fall four times today",
    body: "A man repeats his history from the top with every new resident. Each shift resets to zero. The patient carries the context because the chart doesn't.",
  },
  {
    title: "The prescription that never should have been written",
    body: "A diabetic patient was given NSAIDs for back pain. Context was lost at handoff. One detail, missed once, nearly caused serious harm.",
  },
  {
    title: "Families become the chart",
    body: "When handoffs fail, families fill the gap. They repeat the same answers to the same questions all day. That burden belongs to Clair, not them.",
  },
];

const STATS = [
  { value: 9, prefix: "", suffix: "", label: "SOAP tables per visit" },
  { value: 2, prefix: "<", suffix: " min", label: "Full summary generated" },
  { value: 100, prefix: "", suffix: "%", label: "Key clinical info captured" },
  { value: 1000, prefix: "", suffix: "+", label: "Patient interactions captured" },
];

// ─── CountUp ──────────────────────────────────────────────────────────────────

function CountUp({
  target,
  prefix = "",
  suffix = "",
}: {
  target: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView || target === 0) return;
    const duration = 3000;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [isInView, target]);

  return (
    <span ref={ref}>
      {prefix}
      {count}
      {suffix}
    </span>
  );
}

// ─── Blob loop timings ────────────────────────────────────────────────────────

const L8  = { duration: 8,    repeat: Infinity, ease: "easeInOut" as const };
const L9  = { duration: 9.5,  repeat: Infinity, ease: "easeInOut" as const };
const L11 = { duration: 11,   repeat: Infinity, ease: "easeInOut" as const };
const L12 = { duration: 12,   repeat: Infinity, ease: "easeInOut" as const };
const L7  = { duration: 7.5,  repeat: Infinity, ease: "easeInOut" as const };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [activeFeature, setActiveFeature] = useState(0);
  const [viewportH, setViewportH] = useState(900);
  const heroRef      = useRef<HTMLElement>(null);

  useEffect(() => {
    setViewportH(window.innerHeight);
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Scroll-driven navbar morph
  const { scrollY } = useScroll();
  const navPT       = useTransform(scrollY, [60, 220], [16, 12]);
  const navPX       = useTransform(scrollY, [60, 220], [32, 16]);
  const innerMaxW   = useTransform(scrollY, [60, 220], [3000, 720]);
  const innerRadius = useTransform(scrollY, [60, 220], [0, 9999]);
  const innerPX     = useTransform(scrollY, [60, 220], [0, 20]);
  const innerPY     = useTransform(scrollY, [60, 220], [0, 10]);
  const bgAlpha     = useTransform(scrollY, [60, 220], [0, 0.88]);
  const blurAmt     = useTransform(scrollY, [60, 220], [0, 14]);
  const pillShadowA = useTransform(scrollY, [100, 220], [0, 0.07]);
  const pillBorderA = useTransform(scrollY, [100, 220], [0, 0.08]);
  const navBg     = useMotionTemplate`rgba(255,255,255,${bgAlpha})`;
  const navBlur   = useMotionTemplate`blur(${blurAmt}px)`;
  const navShadow = useMotionTemplate`0 2px 24px rgba(0,0,0,${pillShadowA}), 0 0 0 1px rgba(0,0,0,${pillBorderA})`;

  useEffect(() => {
    const id = setInterval(() => setActiveFeature((i) => (i + 1) % FEATURES.length), 3500);
    return () => clearInterval(id);
  }, []);

  // Hero scroll — drives orb fade + mockup peek-up (200vh section)
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end end"],
  });
  const headlineOpacity = useTransform(heroProgress, [0.35, 0.6], [1, 0.55]);
  const orbScaleRaw     = useTransform(heroProgress, [0.04, 0.45], [1, 8]);
  const orbScale        = useSpring(orbScaleRaw, { stiffness: 60, damping: 18 });
  const orbOpacity      = useTransform(heroProgress, [0.46, 0.62], [1, 0]);
  const heroBg          = useTransform(heroProgress, [0.13, 0.47, 0.48, 0.68], ["#FFFFFF", "#A5C8FF", "#A5C8FF", "#FFFFFF"]);
  const finalY       = -(viewportH * 0.80);
  const mockupPeekYRaw    = useTransform(heroProgress, [0, 1], [0, finalY]);
  const mockupRotateXRaw  = useTransform(heroProgress, [0, 0.8], [45, 0]);
  const springConfig      = { stiffness: 280, damping: 32 };
  const mockupPeekY       = useSpring(mockupPeekYRaw, springConfig);
  const mockupRotateX     = useSpring(mockupRotateXRaw, springConfig);


  return (
    <div className="min-h-screen bg-white text-[#0F172A]" style={{ overflowX: "clip" }}>

      {/* ─── NAVBAR (morphs from 3 floating pills → single glass pill) ── */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ paddingTop: navPT, paddingLeft: navPX, paddingRight: navPX }}
      >
        <motion.div
          style={{
            margin: "0 auto",
            maxWidth: innerMaxW,
            borderRadius: innerRadius,
            background: navBg,
            backdropFilter: navBlur,
            WebkitBackdropFilter: navBlur,
            boxShadow: navShadow,
            paddingLeft: innerPX,
            paddingRight: innerPX,
            paddingTop: innerPY,
            paddingBottom: innerPY,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left: Clair logo */}
          <img
            src="/clair-logo.png"
            alt="Clair"
            draggable={false}
            className="w-auto shrink-0"
            style={{ height: 32 }}
          />

          {/* Right: Live demo + GitHub + Try Clair */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/patients"
              className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-gray-50"
              style={{ border: "1.5px solid #D1D5DB", color: "#0F172A", background: "white" }}
            >
              Live demo
            </Link>
            <a
              href="https://github.com/justinsiek/HackDavis2026"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-gray-50"
              style={{ border: "1.5px solid #D1D5DB", color: "#0F172A", background: "white" }}
            >
              GitHub
            </a>
            <Link
              href="/login"
              className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-85 shrink-0"
              style={{ background: "#4780ff" }}
            >
              Try Clair →
            </Link>
          </div>
        </motion.div>
      </motion.nav>

      {/* ─── HERO ────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative bg-white"
        style={{ height: "158vh", overflow: "visible" }}
      >
        {/* Sticky viewport — stays pinned while user scrolls the 200vh section */}
        <div
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            paddingBottom: "10vh",
          }}
        >
        {/* Background — framer-motion owns this entirely, no React reconciliation conflicts */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: heroBg,
            zIndex: 0,
          }}
        />

        {/* Orb — outer layer: scroll-driven scale + fade-out; inner layer: entry animation */}
        <motion.div
          style={{ position: "relative", width: "62vh", height: "62vh", scale: orbScale, opacity: orbOpacity, zIndex: 1, marginTop: "-10vh" }}
        >
          {/* Entry animation wrapper */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: "absolute", inset: 0 }}
          >
          {/* Outer radial glow */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-42%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(167,207,255,0.32) 0%, rgba(167,207,255,0.10) 48%, transparent 70%)",
              filter: "blur(48px)",
              pointerEvents: "none",
            }}
          />

          {/* Orb shell */}
          <motion.div
            animate={{ scale: [1, 1.013, 1] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              overflow: "hidden",
              WebkitMaskImage:
                "radial-gradient(circle at 50% 50%, black 55%, transparent 78%)",
              maskImage:
                "radial-gradient(circle at 50% 50%, black 55%, transparent 78%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(150deg, #C7D2FE 0%, #93C5FD 40%, #60A5FA 70%, #38BDF8 100%)",
              }}
            />
            <motion.div animate={{ opacity: [0.78, 0.95, 0.68, 0.88, 0.78] }} transition={L8} style={{ position: "absolute", width: "76%", height: "76%", top: "-8%", left: "-8%", background: "#A5B4FC", filter: "blur(72px)", borderRadius: "50%" }} />
            <motion.div animate={{ opacity: [0.62, 0.82, 0.52, 0.74, 0.62] }} transition={L9} style={{ position: "absolute", width: "66%", height: "66%", top: "-8%", right: "-8%", background: "#6366F1", filter: "blur(62px)", borderRadius: "50%" }} />
            <motion.div animate={{ opacity: [0.56, 0.80, 0.46, 0.70, 0.56] }} transition={L11} style={{ position: "absolute", width: "66%", height: "66%", bottom: "-8%", right: "-8%", background: "#38BDF8", filter: "blur(66px)", borderRadius: "50%" }} />
            <motion.div animate={{ opacity: [0.62, 0.84, 0.50, 0.74, 0.62] }} transition={L12} style={{ position: "absolute", width: "60%", height: "60%", bottom: "-8%", left: "-8%", background: "#93C5FD", filter: "blur(56px)", borderRadius: "50%" }} />
            <motion.div animate={{ opacity: [0.36, 0.58, 0.28, 0.50, 0.36], scale: [1, 1.16, 0.9, 1.12, 1] }} transition={L7} style={{ position: "absolute", width: "48%", height: "48%", top: "26%", left: "26%", background: "#4780ff", filter: "blur(52px)", borderRadius: "50%" }} />
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 27%, rgba(255,255,255,0.46) 0%, transparent 52%)" }} />
          </motion.div>
          </motion.div>{/* end entry animation wrapper */}
        </motion.div>

        {/* Headline — fades out fast, not a child of orb so it doesn't scale */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.45 }}
          style={{
            position: "absolute",
            top: "38%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "100vw",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          <motion.h1
            style={{
              fontFamily: "var(--font-instrument-serif), Georgia, serif",
              fontSize: "clamp(5.67rem, 14.17vh, 9.92rem)",
              color: "#0F172A",
              textAlign: "center",
              lineHeight: 0.92,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
              opacity: headlineOpacity,
            }}
          >
            Every provider.
            <br />
            Always in context.
          </motion.h1>
        </motion.div>

        {/* Mockup — peeks up from bottom, slides fully into view on scroll */}
        <div
          style={{
            position: "absolute",
            top: "78%",
            left: 0,
            right: 0,
            margin: "0 auto",
            width: "76%",
            maxWidth: "960px",
            zIndex: 20,
            perspective: 1200,
          }}
        >
          <motion.div
            style={{
              y: mockupPeekY,
              rotateX: mockupRotateX,
              transformOrigin: "top center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/demo-screenshot.png"
              alt="Clair patient detail view"
              draggable={false}
              className="w-full rounded-2xl"
              style={{
                border: "1px solid rgba(0,0,0,0.12)",
              }}
            />
            <p
              style={{
                textAlign: "center",
                marginTop: "1.25rem",
                fontSize: "0.95rem",
                color: "#0F172A",
                fontWeight: 700,
                letterSpacing: "0.01em",
                fontFamily: "var(--font-app), sans-serif",
              }}
            >
              Voice transcription. SOAP documentation. Real-time handoffs.
            </p>
          </motion.div>
        </div>

        </div>{/* end sticky container */}
      </section>


      {/* ─── FEATURE SECTION ────────────────────────────────── */}
      <section id="how-it-works" className="py-28 px-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <div id="the-problem">
            <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: "#4780ff" }}>
              The problem
            </p>
            <h2 className="text-4xl font-bold leading-tight tracking-tight text-[#0F172A] mb-10">
              The patient remembers.
              <br />
              The chart doesn't.
            </h2>
            <div className="space-y-7">
              {PROBLEM_BULLETS.map((b) => (
                <div key={b.title}>
                  <div className="font-semibold text-[#0F172A] mb-1.5">· {b.title}</div>
                  <div className="text-sm leading-relaxed pl-4" style={{ color: "#0F172A" }}>
                    {b.body}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <motion.div
              animate={{ opacity: [0.4, 0.75, 0.4] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none"
              style={{
                position: "absolute",
                inset: "-28%",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(71,128,255,0.13) 0%, transparent 65%)",
              }}
              aria-hidden
            />
            <div
              className="relative rounded-2xl p-6"
              style={{ background: "#FAFAFA", border: "1px solid #E5E7EB" }}
            >
              <p className="text-[10px] font-bold tracking-widest uppercase mb-5" style={{ color: "#0F172A" }}>
                How it works
              </p>

              <div className="space-y-1 mb-5">
                {FEATURES.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFeature(i)}
                    className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all"
                    style={{
                      background: activeFeature === i ? "white" : "transparent",
                      boxShadow: activeFeature === i ? "0 1px 6px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.dot }} />
                    <span className="text-sm font-medium text-[#0F172A]">{f.label}</span>
                    {activeFeature === i && (
                      <span className="ml-auto text-xs" style={{ color: "#0F172A" }}>Active</span>
                    )}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFeature}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="rounded-xl p-5"
                  style={{ background: "white", border: "1px solid #E5E7EB" }}
                >
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest mb-3"
                    style={{ background: "#EEF3FF", color: "#4780ff" }}
                  >
                    {FEATURES[activeFeature].badge}
                  </span>
                  <div className="text-base font-semibold text-[#0F172A] mb-2">
                    {FEATURES[activeFeature].heading}
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "#0F172A" }}>
                    {FEATURES[activeFeature].body}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS ──────────────────────────────────────────── */}
      <section className="py-28 px-10 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3" style={{ color: "#0F172A" }}>
              <span className="inline-block" style={{ width: 24, height: 1, background: "#D1D5DB" }} />
              <span className="text-xs">Under the hood</span>
            </div>
            <h2 className="text-4xl font-bold leading-tight tracking-tight text-[#0F172A]">
              Built for speed.
            </h2>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "#0F172A" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "#10B981" }} />
            Production ready
          </div>
        </div>

        <div
          className="grid grid-cols-2"
          style={{ border: "1px solid #E5E7EB", borderRadius: 16, overflow: "hidden" }}
        >
          {STATS.map((s, i) => (
            <div
              key={i}
              className="p-10"
              style={{
                borderRight: i % 2 === 0 ? "1px solid #E5E7EB" : undefined,
                borderBottom: i < 2 ? "1px solid #E5E7EB" : undefined,
              }}
            >
              <div
                className="font-bold tracking-tight text-[#0F172A]"
                style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}
              >
                <CountUp target={s.value} prefix={s.prefix} suffix={s.suffix} />
              </div>
              <div className="mt-2 text-sm" style={{ color: "#0F172A" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FOOTER CTA ─────────────────────────────────────── */}
      <section className="py-32 px-10 text-center relative overflow-hidden">
        <div
          className="pointer-events-none"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 600,
            height: 600,
            marginLeft: -300,
            marginTop: -300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(71,128,255,0.07) 0%, transparent 65%)",
          }}
          aria-hidden
        />
        <div className="relative z-10">
          <h2
            className="font-bold tracking-tight text-[#0F172A]"
            style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}
          >
            Start your first visit.
          </h2>
          <p className="mt-4 text-lg" style={{ color: "#0F172A" }}>
            No setup required. Sign in and start speaking.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/login"
              className="rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#4780ff" }}
            >
              Try Clair →
            </Link>
            <Link
              href="/patients"
              className="rounded-full px-8 py-3.5 text-sm font-semibold transition-colors hover:bg-[#F8FAFC]"
              style={{ border: "1px solid #E2E8F0", color: "#0F172A" }}
            >
              See live demo
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────────── */}
      <footer
        className="flex items-center justify-between px-10 py-8"
        style={{ borderTop: "1px solid #E5E7EB" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/clair-logo.png" alt="Clair" className="h-8 w-auto" draggable={false} />
        <p className="text-sm" style={{ color: "#0F172A" }}>
          Built at HackDavis 2026
        </p>
      </footer>
    </div>
  );
}
