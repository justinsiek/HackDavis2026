"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useMotionTemplate,
  useInView,
  AnimatePresence,
} from "framer-motion";
import Link from "next/link";
import SoftOrb from "@/components/SoftOrb";

// ─── Data ─────────────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  { big: "Deepgram", small: "NOVA-3-MEDICAL" },
  { big: "SOAP", small: "FRAMEWORK" },
  { big: "Per-doctor", small: "SNAPSHOTS" },
  { big: "Harvard", small: "GROUNDED" },
  { big: "Real-time", small: "DIARIZATION" },
  { big: "Claude", small: "SONNET 4.6" },
];

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const orbAmplitude = useMotionValue(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const productRef = useRef<HTMLDivElement>(null);

  // Scroll-driven navbar morph
  const { scrollY } = useScroll();
  const navPT    = useTransform(scrollY, [0, 110], [0, 12]);
  const navPX    = useTransform(scrollY, [0, 110], [0, 16]);
  const innerRadius = useTransform(scrollY, [0, 110], [0, 9999]);
  const innerMaxW   = useTransform(scrollY, [0, 110], [3000, 680]);
  const innerPX     = useTransform(scrollY, [0, 110], [40, 20]);
  const innerPY     = useTransform(scrollY, [0, 110], [14, 10]);
  const bgAlpha     = useTransform(scrollY, [0, 110], [1, 0.88]);
  const blurAmt     = useTransform(scrollY, [0, 110], [0, 14]);
  const logoH       = useTransform(scrollY, [0, 110], [40, 32]);
  const borderBottomA = useTransform(scrollY, [0, 80], [0.07, 0]);
  const pillShadowA   = useTransform(scrollY, [30, 110], [0, 0.06]);
  const pillBorderA   = useTransform(scrollY, [30, 110], [0, 0.07]);

  const navBg      = useMotionTemplate`rgba(255,255,255,${bgAlpha})`;
  const navBlur    = useMotionTemplate`blur(${blurAmt}px)`;
  const navShadow  = useMotionTemplate`0 1px 0 rgba(0,0,0,${borderBottomA}), 0 2px 20px rgba(0,0,0,${pillShadowA}), 0 0 0 1px rgba(0,0,0,${pillBorderA})`;

  // Feature auto-cycle
  useEffect(() => {
    const id = setInterval(() => {
      setActiveFeature((i) => (i + 1) % FEATURES.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  // Product reveal scroll
  const { scrollYProgress: productProgress } = useScroll({
    target: productRef,
    offset: ["start end", "end center"],
  });
  const mockupRotateX = useTransform(productProgress, [0, 1], [32, 0]);
  const circleScale = useTransform(productProgress, [0, 1], [0.5, 1.5]);
  const circleOpacity = useTransform(productProgress, [0, 0.25, 1], [0, 1, 1]);

  return (
    <div
      className="min-h-screen bg-white text-[#0F172A] overflow-x-hidden"
      style={{ fontFamily: "'PPNeueMontreal', system-ui, sans-serif" }}
    >
      {/* ─── NAVBAR ─────────────────────────────────────────── */}
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
            gap: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img
            src="/clair-logo.png"
            alt="Clair"
            draggable={false}
            className="shrink-0 w-auto"
            style={{ height: logoH }}
          />
          <div className="flex items-center gap-7 flex-1">
            <a href="#how-it-works" className="text-sm text-[#0F172A] hover:opacity-60 transition-opacity">
              How it works
            </a>
            <a href="#the-problem" className="text-sm text-[#0F172A] hover:opacity-60 transition-opacity">
              The problem
            </a>
            <a href="#demo" className="text-sm text-[#0F172A] hover:opacity-60 transition-opacity">
              Demo
            </a>
          </div>
          <Link
            href="/login"
            className="shrink-0 rounded-full px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ background: "#4780ff" }}
          >
            Try Clair
          </Link>
        </motion.div>
      </motion.nav>

      {/* ─── HERO ───────────────────────────────────────────── */}
      <section className="min-h-screen flex items-center pt-24 pb-16 px-10 max-w-7xl mx-auto">
        <div className="flex items-center justify-between w-full gap-12">
          {/* Left: text */}
          <div className="flex-1 max-w-2xl">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-xs font-bold tracking-widest uppercase mb-4"
              style={{ color: "#4780ff" }}
            >
              Built at HackDavis 2026
            </motion.p>

            <div className="overflow-hidden">
              <motion.h1
                initial={{ y: 70, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                className="font-bold leading-[1.06] tracking-tight text-[#0F172A]"
                style={{ fontSize: "clamp(2.4rem, 4vw, 3.5rem)" }}
              >
                No patient tells<br />their story twice.
              </motion.h1>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-6 text-lg leading-relaxed"
              style={{ color: "#0F172A" }}
            >
              Clair listens during every visit, extracts clinical state in SOAP format, and hands off complete context to every incoming shift.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.52, duration: 0.5 }}
              className="mt-8 flex items-center gap-3 flex-wrap"
            >
              <Link
                href="/login"
                className="rounded-full px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "#4780ff" }}
              >
                Try Clair →
              </Link>
              <Link
                href="/patients"
                className="rounded-full px-6 py-3 text-sm font-semibold transition-colors hover:bg-[#F8FAFC]"
                style={{ border: "1px solid #E2E8F0", color: "#0F172A" }}
              >
                Live demo
              </Link>
              <a
                href="https://github.com/justinsiek/HackDavis2026"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full px-6 py-3 text-sm font-semibold transition-colors hover:bg-[#F8FAFC]"
                style={{ border: "1px solid #E2E8F0", color: "#0F172A" }}
              >
                GitHub
              </a>
            </motion.div>
          </div>

          {/* Right: orb */}
          <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="shrink-0 hidden md:flex items-center justify-center"
          >
            <SoftOrb amplitude={orbAmplitude} state="connecting" size={360} />
          </motion.div>
        </div>
      </section>

      {/* ─── TICKER ─────────────────────────────────────────── */}
      <div
        className="overflow-hidden py-5"
        style={{ borderTop: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", background: "#F8FAFC" }}
      >
        <div
          className="flex whitespace-nowrap"
          style={{ animation: "clairMarquee 32s linear infinite" }}
        >
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="mx-10 inline-flex items-baseline gap-2.5 shrink-0">
              <span className="text-xl font-semibold text-[#0F172A]">{item.big}</span>
              <span
                className="text-[10px] font-bold tracking-widest uppercase"
                style={{ color: "#0F172A" }}
              >
                {item.small}
              </span>
            </span>
          ))}
        </div>
        <style>{`
          @keyframes clairMarquee {
            0%   { transform: translateX(0) }
            100% { transform: translateX(-50%) }
          }
        `}</style>
      </div>

      {/* ─── PRODUCT REVEAL ─────────────────────────────────── */}
      <section id="demo" ref={productRef} className="relative py-32 overflow-hidden">
        {/* Scroll-driven glow circle */}
        <motion.div
          style={{
            scale: circleScale,
            opacity: circleOpacity,
          }}
          className="absolute pointer-events-none"
          css-comment="centered via inset trick"
          aria-hidden
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 800,
              height: 800,
              marginLeft: -400,
              marginTop: -400,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(71,128,255,0.08) 0%, rgba(71,128,255,0.03) 50%, transparent 70%)",
            }}
          />
        </motion.div>

        {/* Centered glow positioned absolutely */}
        <div
          className="pointer-events-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden
        >
          <motion.div
            style={{
              scale: circleScale,
              opacity: circleOpacity,
              width: 800,
              height: 800,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(71,128,255,0.08) 0%, rgba(71,128,255,0.03) 50%, transparent 70%)",
            }}
          />
        </div>

        {/* Text */}
        <div className="max-w-4xl mx-auto px-10 text-center relative z-10">
          <p
            className="text-xs font-bold tracking-widest uppercase mb-4"
            style={{ color: "#4780ff" }}
          >
            See it in action
          </p>
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-[#0F172A]">
            Clinical documentation,<br />handled.
          </h2>
          <p className="mt-4 text-lg max-w-lg mx-auto" style={{ color: "#0F172A" }}>
            Clair listens, transcribes, and populates your patient record all while you focus on the person in front of you.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#4780ff" }}
          >
            Try a live visit
          </Link>
        </div>

        {/* Scroll-driven mockup */}
        <div
          className="mt-14 max-w-4xl mx-auto px-10 relative z-10"
          style={{ perspective: 900 }}
        >
          <motion.div style={{ rotateX: mockupRotateX, transformOrigin: "top center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/demo-screenshot.jpg"
              alt="Clair patient detail view"
              draggable={false}
              className="w-full rounded-2xl shadow-2xl"
              style={{ border: "1px solid #E2E8F0" }}
            />
          </motion.div>
        </div>
      </section>

      {/* ─── FEATURE SECTION ────────────────────────────────── */}
      <section id="how-it-works" className="py-28 px-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          {/* Left: problem */}
          <div id="the-problem">
            <p
              className="text-xs font-bold tracking-widest uppercase mb-4"
              style={{ color: "#4780ff" }}
            >
              The problem
            </p>
            <h2 className="text-4xl font-bold leading-tight tracking-tight text-[#0F172A] mb-10">
              The patient remembers.<br />The chart doesn't.
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

          {/* Right: feature card */}
          <div className="relative">
            {/* Backglow */}
            <motion.div
              animate={{ opacity: [0.4, 0.75, 0.4] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none"
              style={{
                position: "absolute",
                inset: "-28%",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(71,128,255,0.13) 0%, transparent 65%)",
              }}
              aria-hidden
            />

            <div
              className="relative rounded-2xl p-6"
              style={{ background: "#FAFAFA", border: "1px solid #E5E7EB" }}
            >
              <p
                className="text-[10px] font-bold tracking-widest uppercase mb-5"
                style={{ color: "#0F172A" }}
              >
                How it works
              </p>

              {/* Feature tabs */}
              <div className="space-y-1 mb-5">
                {FEATURES.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFeature(i)}
                    className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all"
                    style={{
                      background: activeFeature === i ? "white" : "transparent",
                      boxShadow:
                        activeFeature === i
                          ? "0 1px 6px rgba(0,0,0,0.06)"
                          : "none",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: f.dot }}
                    />
                    <span className="text-sm font-medium text-[#0F172A]">{f.label}</span>
                    {activeFeature === i && (
                      <span className="ml-auto text-xs" style={{ color: "#0F172A" }}>
                        Active
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Feature detail */}
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
        {/* Soft orb bloom behind */}
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
            background:
              "radial-gradient(circle, rgba(71,128,255,0.07) 0%, transparent 65%)",
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
