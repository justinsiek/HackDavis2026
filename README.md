# 👑 Winner at HackDavis 2026 - Anthropic's "Best use of AI/ML" 👑

# Clair

## Inspiration
Patient handoff in hospitals is informal and unstandardized, and patients pay the price. A grandmother who spent weeks telling one doctor she "just wants to walk her dog again" finds the next provider has no idea that goal exists, and her plan quietly drifts away from it. A man recovering from a fall repeats the same story of how it happened to four different people in two days, each time reliving the moment. A diabetic patient gets prescribed an NSAID for back pain because the doctor on call never saw the kidney note buried in yesterday's chart. Families sit in waiting rooms watching their loved ones answer the same questions over and over, wondering if anyone is actually holding the whole picture. We built Clair so that every doctor who walks into the room already knows what the patient has been through, what matters to them, and what has changed since the last visit, so the patient never has to carry that weight themselves.

## What it does

Clair is a medical-grade visit continuity platform built around six core features that map onto how clinicians actually work:

- Voice-to-text in the background
  - Every doctor-patient visit is recorded and transcribed live with speaker diarization using Deepgram's nova-3-medical model, so Clair sits inside existing workflows instead of interrupting them.

- Change snapshots.
  - Each doctor carries their own per-patient snapshot of what they last knew, and Clair generates a 2 to 4 sentence handoff narrative of exactly what has changed since their last visit. The fields surfaced were chosen using SOAP and NOVA University documentation protocols, narrowed to the six that matter most at handoff.

- Live charts and document representation.
  - A bento patient page surfaces the full SOAP record at a glance: Subjective (current presentation), Objective (recent vitals, physical exam, labs with live-updating charts), Assessment (active diagnoses, synopsis), and Plan (treatment plan, color-coded next steps, medications).

- Todo lists.
  - Color-coded plan items (URGENT, Follow-up, Tests/Labs, Medication, Monitoring, Lifestyle) capture key points to cover in appointments and track interventions toward long-term goals without losing context across providers.

- Per-patient chatbot.
  - Doctors can ask any clarifying question grounded in all prior visit states and uploaded medical documents, including prior medical history, family history, social observations, and pending tests or consultations.

- Manual safeguards and simple UI.
  - Every field is manually editable with a full audit ledger of who changed what and when, so clinicians stay in control of the record rather than the LLM.

The schema, prompts, and bento layout were shaped by research into clinical documentation standards and a consultation with a Harvard physician, who reframed the problem around the "clearing house" of patient information that real handoffs lack and pushed us toward a structure clinicians can scan in seconds.

## How we built it
- Frontend:
  - Next.js App Router, React 19, and TailwindCSS, with a bento patient page laid out around the SOAP framework.
- Backend:
  - Flask (Python) over Supabase Postgres, wrapped in a retry layer that handles dropped HTTP/2 connections.
- Streaming transcription: Deepgram nova-3-medical via @deepgram/sdk, opened directly from the browser with diarization, interim results, and VAD tuned for two-speaker clinical conversations.
- LLM: Anthropic Claude (claude-sonnet-4-6). One tool-use call with a strict input_schema extracts the full SOAP-structured patient state from the transcript, carrying unchanged fields forward and refusing to invent clinical facts. A second call writes the per-doctor diff narrative, short-circuited when nothing has changed. Schema: nine Postgres tables covering patients, the SOAP-aligned state row, visits, per-doctor snapshots, structured plan items, uploaded documents, chatbot history, and an append-only changelog of manual edits. Clinical grounding: prompts, field choices, and UI hierarchy were shaped by SOAP documentation guidelines and a consultation with a Harvard physician on how clinicians actually scan a chart.

## Challenges we ran into

- Dual-voice recognition.
  - We initially tried to identify which specific person was speaking (Doctor vs the patient) using voice biometrics and speaker enrollment, so the system could attribute turns to a named clinician without anyone having to label them. In practice this fell apart fast: enrollment audio was short and noisy, and Deepgram's diarization couldn't consistently identify separate identities. After burning real time on it, we fell back to transcript-level diarization with processing both doctor and patient texts and abstracting the separation to the LLM. The fallback worked surprisingly well in practice, identifying key information 100% of the time.
- Choosing the right fields to surface.
  - Deciding what a doctor actually wants to see in the first ten seconds of a handoff turned out to be the hardest design problem in the project. We started by reading published clinical documentation and datasets, and tried to derive the schema from what was prioritized in them. The result felt comprehensive but unprioritized. We then consulted a Harvard physician, who walked us through how doctors actually scan a chart at shift change: synopsis first, then active problems and meds, then plan, with vitals and exam available but not dominant. That conversation is what produced the SOAP-aligned bento layout, the one-sentence synopsis at the top, the dedicated "long-term goals" field, and the decision to cut allergies as a separate section in v1. Field choice ended up mattering as much as the LLM extraction itself.

## Accomplishments that we're proud of

- A full end-to-end loop where a real conversation gets transcribed live with speaker bubbles, and a SOAP-structured patient record updates from it in seconds.
- The per-doctor "what's changed since you last saw this patient" narrative, which directly addresses the handoff information loss that motivated the project.
- A clinically grounded bento layout that surfaces a patient's whole picture at a glance and gracefully expands long content into modals.
- Pragmatic resilience choices (retry wrapper, StrictMode-safe visit creation, short-circuit narrator) that kept the app stable without over-engineering.
  
## What we learned

- Consulting a Harvard physician reframed the entire ideation process - revealing our incorrect assumptions and guiding us to an industry-standard project.
- LLM tool use with a fully specified input_schema is far more reliable than free-form JSON for structured medical extraction.
- Real-time diarized transcription delivers a great UX, but leaks complexity (interim vs. final results, speaker numbering, MediaRecorder edge cases) that has to be designed around.
- Hackathon scoping is its own skill. Every feature we cut bought time for the parts that actually moved the demo.
## What's next for Clair

- Real time-series for vitals and labs, with the LLM appending measurements rather than overwriting them.
- Per-section "last updated by Dr. X" attribution on the patient page.
- Auto-drafted clinical documentation (admission notes, discharge summaries) generated from the transcript and current state.
- Voice enrollment for reliable speaker labeling, replacing the first-speaker heuristic.
- Server-minted Deepgram tokens before any deployment outside a local demo.
- A live "transfer of knowledge" mode that listens to a handoff conversation between providers and checks topics off as they are covered.

