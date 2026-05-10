# Project Spec — Patient Continuity System

> A system that makes patient information explicit, structured, and actively maintained across multiple doctors, so each doctor walking into a room knows exactly what's changed since they last saw the patient.

---

## 1. Problem

Patient handoff in hospitals is informal and unstandardized. Doctor B walks into a room without a precise picture of what Doctor A learned, prescribed, or planned. This causes:

- Discrepancies in understanding of patient status
- Repeated questions to the patient
- Missed updates to the care plan
- Lost long-term goals as patients move between providers

A clinical advisor we spoke with reframed the value: *"You're creating a clearing house where all that information is in one place — instead of clicking neurology, click nutrition, click..."*

**Our solution:** A web app where every doctor visit is recorded, transcribed (with speaker diarization so we know who said what), and used by an LLM to automatically update a structured "source of truth" for the patient. Each doctor has their own per-patient snapshot of "what I last knew," so the next time they open the patient, the system shows them a one-paragraph narrative of exactly what's changed since their last visit.

---

## 2. Core User Flow

1. **Admission.** Any logged-in doctor opens "Admit patient," **takes a photo via the browser camera**, and fills out a small form (name, sex, height in ft/in). A patient row is created with empty source-of-truth fields.
2. **First visit (Doctor A).** Doctor A opens the patient → hits "Record interaction" → the browser captures audio and streams it to Deepgram for **real-time diarized transcription**. Spacebar pauses/resumes; Done finalizes.
3. **Update.** Backend stores the transcript on the visit row and runs a single unified LLM call that extracts the structured patient state in one shot (Anthropic tool use). The new state is written to `patient_state` and Doctor A's snapshot is upserted to match.
4. **Snapshot.** Doctor A's per-patient `doctor_patient_snapshots` row now equals the current state.
5. **Second visit (Doctor B).** Doctor B opens the same patient. Because Doctor B has no prior snapshot, the page shows a "first time seeing this patient" message. They start a visit; the same flow runs; Doctor B's snapshot is created.
6. **Doctor A returns.** Doctor A opens the patient. The page shows:
   - **"What's changed since you last saw this patient"** — an LLM-generated 2-4 sentence narrative comparing Doctor A's snapshot to the current state.
   - The full current source of truth in a bento grid (synopsis, problems, meds, plan, vitals, labs, etc.).
   Doctor A starts a visit; the cycle repeats.

---

## 3. Decisions (locked)

| Area | Decision |
|---|---|
| Frontend | Next.js (App Router) + TailwindCSS, React 19 |
| Backend | Flask (Python) |
| DB | Supabase Postgres (`service_role` key on the server side, RLS bypassed) |
| LLM | Anthropic Claude (`claude-sonnet-4-6`), tool use for structured extraction |
| Streaming transcription | Deepgram (`@deepgram/sdk`, model `nova-3-medical`), with `diarize: "true"` |
| Auth | Hardcoded login by username only (no password verification). Two seeded usernames: `doctor1`, `doctor2`. |
| Admission | Any logged-in doctor admits via a modal that includes **a required browser-camera photo capture step** plus name, sex, height (ft/in). |
| Patient photo storage | Base64 JPEG (~30-50KB) stored in `patients.photo_data`. Hackathon-pragmatic; would swap to Supabase Storage at scale. |
| Field-update mechanism | LLM auto-extracts and overwrites at end-of-visit. **No review/edit step** — doctor's edits would happen by re-recording. |
| Diff view | LLM-generated narrative only — no per-field old→new diff cards. |
| Patient state fields | `synopsis`, `current_presentation`, `active_diagnoses`, `current_medications`, `treatment_plan`, `recent_vitals`, `physical_exam`, `past_medical_history`, `long_term_goals`. **No allergies field** (intentionally cut). |
| Vitals/labs trends | Mocked deterministically per-patient on the frontend (seeded from `patient_id`). The LLM still extracts the latest values; the trend graphs are visual scaffolding for the demo. |
| Speaker diarization | On. First final-result speaker becomes "Doctor"; second is "Patient". Tap-to-swap UI if the heuristic gets it wrong. Speakers ≥2 are clamped to 1 (only ever 2 voices in this product). |
| Recording UX | Spacebar toggles pause/resume; live transcript shown as colored speaker bubbles for finals + plain gray for interim. Done button finalizes the visit. |
| Concurrency | No DB-level lock. Hackathon scope assumes one doctor recording one patient at a time. |

---

## 4. Architecture

```
┌────────────────────┐     HTTPS         ┌────────────────────┐
│   Next.js (web)    │ ─────────────────►│   Flask backend    │
│  - login           │                   │  - REST endpoints  │
│  - patient cards   │ ◄─────────────────│  - LLM (Anthropic) │
│  - bento detail    │                   │  - Supabase client │
│  - record visit    │                   └──────────┬─────────┘
└─────────┬──────────┘                              │
          │                                         │ Postgres
          │ direct browser ►  Deepgram WS           ▼
          ▼ (audio + diarized transcript)  ┌────────────────────┐
┌────────────────────┐                     │     Supabase       │
│  Deepgram          │                     │     (Postgres)     │
│  nova-3-medical    │                     └────────────────────┘
└────────────────────┘
```

**Audio path.** Browser captures mic via `MediaRecorder` (webm/opus, 100ms timeslice). The Deepgram SDK opens a WS directly from the browser, authenticated with the **raw Deepgram API key** exposed via `NEXT_PUBLIC_DEEPGRAM_API_KEY`. Flask is *not* in the audio hot path — it only receives the finalized transcript at end-of-visit.

> **Security caveat.** Putting the key in the browser bundle exposes it to anyone with access to the running app. Acceptable for a local hackathon demo; for any deployment we'd switch back to server-side token minting via Deepgram's `/v1/auth/grant` endpoint (this requires an API key with Member-or-higher scope, which our key didn't have at the time).

**LLM calls.** Flask calls Anthropic for two operations:
1. **Extract** — one tool-use call (`update_patient_state`) that takes the current state + new transcript and returns the full updated state. Schema-enforced via the tool's `input_schema`.
2. **Narrate diff** — given a doctor's snapshot + current state, return 2-4 sentences. Plain text response.

**Stale-connection retry.** Supabase HTTP/2 connections occasionally drop. Every Supabase call goes through a `db_call()` wrapper that retries once on `httpx.RemoteProtocolError`, `httpx.ReadError`, or `httpx.ConnectError`.

---

## 5. Data Model

All tables live in Supabase Postgres. UUID primary keys. Service-role key bypasses RLS. Schema lives in [db/schema.sql](../db/schema.sql).

### `doctors`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `username` | `text` UNIQUE | hardcoded login |
| `name` | `text` | display name |
| `created_at` | `timestamptz` | default `now()` |

Seeded with `doctor1` and `doctor2` (any password works at login — we don't validate).

### `patients`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | |
| `dob` | `date` | nullable |
| `sex` | `text` | nullable |
| `height_cm` | `numeric` | nullable; admission form collects ft+in, converts |
| `weight_kg` | `numeric` | nullable; reserved, not collected today |
| `photo_data` | `text` | base64 JPEG data URL captured at admission |
| `admitted_at` | `timestamptz` | default `now()` |
| `admitted_by` | `uuid` FK → doctors | |

### `patient_state`  *(source of truth — one row per patient)*
| column | type | notes |
|---|---|---|
| `patient_id` | `uuid` PK FK → patients ON DELETE CASCADE | |
| `synopsis` | `text` | one-sentence clinical summary ("65yo F with HTN, here for SOB") |
| `current_presentation` | `text` | the patient's subjective account this admission |
| `active_diagnoses` | `jsonb` | array of `{condition, since, notes}` |
| `current_medications` | `jsonb` | array of `{name, dose, frequency}` |
| `treatment_plan` | `text` | plan & next steps |
| `recent_vitals` | `jsonb` | `{bp, hr, temp_c, o2_sat, taken_at}` — latest values only |
| `physical_exam` | `text` | brief narrative of exam findings |
| `past_medical_history` | `text` | pre-existing conditions, prior surgeries, family history |
| `long_term_goals` | `text` | forward-looking care goals |
| `updated_at` | `timestamptz` | bumped on every visit finalize |
| `updated_by_visit_id` | `uuid` FK → visits | last visit that wrote to this row |

Row is created (with all fields null/empty) when the patient is admitted.

### `visits`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `patient_id` | `uuid` FK ON DELETE CASCADE | |
| `doctor_id` | `uuid` FK | |
| `started_at` | `timestamptz` | default `now()` |
| `ended_at` | `timestamptz` | nullable while active |
| `status` | `text` | `active` \| `processing` \| `complete` (CHECK constraint) |
| `transcript` | `text` | finalized diarized transcript (`Doctor: ...\nPatient: ...`) |
| `llm_extracted_fields` | `jsonb` | reserved for future review-step UI; currently unused |
| `final_fields` | `jsonb` | reserved; currently unused |

Index: `visits(patient_id, started_at desc)`.

### `doctor_patient_snapshots`
What a given doctor last knew about a given patient. Created lazily on visit finalize.

| column | type | notes |
|---|---|---|
| `doctor_id` | `uuid` FK ON DELETE CASCADE | composite PK with patient_id |
| `patient_id` | `uuid` FK ON DELETE CASCADE | |
| `snapshot` | `jsonb` | the full state subset captured at the moment the visit closed |
| `snapshot_at` | `timestamptz` | default `now()` |
| `last_visit_id` | `uuid` FK → visits | the visit that produced this snapshot |

The snapshot is **upserted** at the end of every visit — `doctor_id` = the doctor who conducted the visit.

---

## 6. Backend API (Flask)

All endpoints return JSON. Auth: client sends `X-Doctor-Username` header; Flask resolves it and rejects unknown usernames with 401.

### Auth
- `POST /api/login` — `{ username }` → `{ doctor: {id, username, name} }`. Looks up the username; 401 if not found.

### Patients
- `GET /api/patients` — list of all patients (id, name, dob, sex, height_cm, weight_kg, **photo_data**, admitted_at).
- `POST /api/patients` — admit. Body: `{ name, sex, height_cm, photo_data }`. Creates `patients` row + empty `patient_state` row.
- `GET /api/patients/:id` — returns:
  ```json
  {
    "patient": { ...patient row... },
    "current_state": { ...patient_state row or null... },
    "viewer_snapshot": { ...doctor_patient_snapshots row or null... },
    "narrative": "string or null",
    "is_first_view": true | false
  }
  ```
  If the viewer has no snapshot, `is_first_view: true` and `narrative: null`. If they have one and it's older than `current_state.updated_at`, `narrative` is the LLM-generated 2-4 sentence summary. If snapshot equals current state, `narrative` is `null`.
- `DELETE /api/patients/:id` — deletes the patient. Cascades remove `patient_state`, all `visits`, and all snapshots. Used by the trash button on patient cards.

### Visits
- `POST /api/visits/start` — `{ patient_id }` → `{ visit_id }`. Creates a `visits` row with `status='active'`. (Earlier the spec called for minting a Deepgram temp token here; we currently expose the raw key in the browser instead — see §9.)
- `POST /api/visits/:id/finalize` — `{ transcript }`. Single-shot endpoint that:
  1. Saves transcript and marks the visit `complete`.
  2. Loads current `patient_state`.
  3. Calls the LLM extractor.
  4. Writes the new state to `patient_state` (`updated_at`, `updated_by_visit_id`).
  5. **Upserts the doctor's snapshot** to match the new state.

  Returns `{ ok: true }`. (The spec's earlier two-step `/finalize` + `/close` design with a doctor-review screen was collapsed into this single endpoint.)

### Health
- `GET /api/health` — smoke test. Selects count from `doctors`, returns `{ ok, doctors_count }`.

---

## 7. LLM

**Model.** `claude-sonnet-4-6` for both extraction and narration.

### Extractor — `update_patient_state` tool

A Claude tool whose `input_schema` enforces the full state shape:
```python
{
  "synopsis": str,
  "current_presentation": str,
  "active_diagnoses": [ {condition, since, notes}, … ],
  "current_medications": [ {name, dose, frequency}, … ],
  "treatment_plan": str,
  "recent_vitals": { bp, hr, temp_c, o2_sat, taken_at } | null,
  "physical_exam": str,
  "past_medical_history": str,
  "long_term_goals": str
}
```

**System prompt:**
> You are a clinical scribe. Update the patient's structured medical record based on a new visit transcript. Carry forward all unchanged fields verbatim. Only modify fields the transcript clearly addresses. Do NOT invent vitals, medications, diagnoses, or history that aren't explicitly mentioned. If a field has no information yet and the transcript doesn't mention it, use empty string for strings, empty array for lists, and null for objects. Always return a complete record using the update_patient_state tool.

**User content:** JSON-stringified current state + the diarized transcript.

`tool_choice` is forced to `{type: "tool", name: "update_patient_state"}` so we always get a valid structured response. Tool input is read directly from `block.input`; no manual parsing.

### Diff narrator

**System prompt:**
> You write short clinical handoff notes. Given a doctor's prior view of a patient and the current state, write 2-4 plain sentences describing what has changed since they last saw the patient. Speak directly to the doctor in second person. If nothing meaningful has changed, return an empty string. No preamble, no markdown, no labels — just the prose.

**User content:** snapshot subset + current state subset, both JSON-stringified.

A short-circuit equality check skips the LLM call entirely if `snapshot == current_state`.

---

## 8. Frontend Pages (Next.js App Router)

### `/login`
Username + password fields. Password is captured but ignored server-side. On success, store `{id, username, name}` in `localStorage` and a small React context. Redirect to `/patients`.

### `/patients`
- Header: "Logged in as Dr. X" + logout.
- "Admit patient" button → modal.
- **Card grid**: 1 column on mobile, 2 on small, 3 on large. Each card has a square photo at top (or initials gradient if missing), name + admitted date below, and a small ✕ button overlaid on the top-right of the photo for quick delete (browser confirm prompt → `DELETE /api/patients/:id` → optimistic remove).

### Admit Patient modal
- **Camera capture step at the top** using `getUserMedia({video})`. Live square preview with a "Take photo" button; once captured, freeze and show "Retake". The captured frame is center-cropped to 480×480 and converted to a JPEG base64 data URL via canvas.
- Fields below: name (required), sex (dropdown), height (ft + in inputs).
- Submit is disabled until a photo is captured AND a name is filled.
- Camera tracks are cleaned up on unmount and on retake.

### `/patients/[id]` — bento layout
A 12-column grid (single column on mobile), 4 rows tall. Most sections are visible at a glance; long content shows a "Show all →" link in the card header that opens a centered modal.

| Row | Contents |
|---|---|
| 1 | **Patient header** (col-7): photo, name, age/sex/height/admitted date, synopsis sentence. **What's changed** (col-5, amber accent): narrative, "first time" message, or "nothing new". |
| 2 | **Active problems** (col-4) · **Current medications** (col-4) · **Plan & next steps** (col-4) |
| 3 | **Vitals** (col-7): 4 sparkline tiles (BP, HR, Temp, O₂). **Labs** (col-5): compact list with abnormal flags + per-row sparkline. |
| 4 | **Subjective** (col-3) · **Physical exam** (col-3) · **Past medical history** (col-3) · **Long-term goals** (col-3) |

- Text cards use `line-clamp-4` and only show "Show all" if content > ~90 chars.
- List cards (problems, medications) show top 3 + "+ N more" → modal with the full list/table.
- Vitals/labs trends are mocked deterministically per patient (see §10).
- The "Record interaction" button lives in the page header, not the bento grid.

### Recording view (in-place; replaces the bento)
- Patient name + status badge + elapsed timer in a header strip.
- Live transcript pane: each finalized turn renders as a colored speaker bubble ("Doctor" in blue, "Patient" in emerald). Interim text (from Deepgram) renders below as plain gray italics — Deepgram doesn't include speaker tags on interim results.
- "Swap doctor / patient" link appears once a first turn lands; flips the labels & colors for the whole session.
- Spacebar (and a Pause button) toggle `MediaRecorder.pause()` / `resume()`. Recording timer pauses with it.
- Done button: stops mic, closes Deepgram socket, posts the transcript to `/finalize`. The patient detail page then re-fetches and shows the updated bento.

There is **no separate "review extracted updates" screen** in v1 — the LLM's output is committed directly. The doctor's only correction loop is to record another visit and re-state things.

---

## 9. Streaming Transcription Integration

**Library.** `@deepgram/sdk` v5 (browser side). `DeepgramClient.listen.v1.connect()` opens a WS to Deepgram.

**Connect args we use:**
```ts
{
  model: "nova-3-medical",
  language: "en-US",
  smart_format: "true",
  interim_results: "true",
  endpointing: "300",
  vad_events: "true",
  diarize: "true",
  Authorization: `Token ${DEEPGRAM_API_KEY}`,
}
```

**Auth.** Currently using the raw API key from `NEXT_PUBLIC_DEEPGRAM_API_KEY`. The original spec planned to mint short-lived tokens server-side via `/v1/auth/grant`, but the Deepgram key we received returned 403 there (key scope issue). Acceptable trade-off for the hackathon; revisit before any deployment.

**Audio.** `MediaRecorder` with `audio/webm` (opus), 100ms timeslice. Each `dataavailable` chunk is sent via `socket.sendMedia(blob)`. Send is wrapped in try/catch — `MediaRecorder` flushes a final chunk after `stop()`, which can land on a closed socket during cleanup.

**Diarization handling.** On `is_final` messages, words are grouped by `speaker` into turns. Speakers are clamped via `Math.min(speaker, 1)` since we always have exactly 2 voices. The first final speaker number is stored as `doctorSpeaker`; everything else becomes "Patient." Interim messages don't include speaker tags, so they render flat.

**StrictMode resilience.** The `/api/visits/start` call is in a click handler (not a useEffect) so React StrictMode's double-mount doesn't create two visit rows. The mic + WS setup *is* in a useEffect — its cleanup tears down both, so the second mount creates a fresh stream and socket.

---

## 10. Mocked clinical data

`client/lib/mockClinical.ts` generates plausible vitals trends (7 days × 5 metrics) and a fixed lab panel (A1C, Hgb, WBC, Creatinine, K+) **deterministically per patient**, seeded from `patient_id`.

This is intentional — the LLM extractor populates `recent_vitals` (the latest values) but trends and labs would require real instrumentation we don't have. The mock generators give every patient a stable, clinical-looking dashboard from the moment they're admitted.

**To make this real later:** vitals would need a time-series schema (append-only `{value, taken_at}` per metric), the extractor would need to *append* rather than overwrite, and labs would come from an actual integration.

---

## 11. Seed Data

Two doctors, inserted manually:

```sql
insert into doctors (username, name) values
  ('doctor1', 'Dr. One'),
  ('doctor2', 'Dr. Two')
on conflict (username) do nothing;
```

No patients are seeded — we admit them through the UI. There's no `seed.py` script in v1.

---

## 12. Out of Scope (v1)

- HIPAA / real PHI handling — **demo data only**, never real patient information.
- Audit logs beyond the `visits` table.
- Multi-org / multi-hospital tenancy.
- Real-time push to other doctors viewing the patient (no live sockets between doctor sessions; refresh re-fetches).
- Editing or deleting past visits.
- Mobile-native app.
- Password-based auth, RBAC beyond "is a doctor."
- Voice biometrics / speaker enrollment (we only do anonymous diarization + the first-speaker-is-doctor heuristic).
- Real lab/imaging integrations (mocked — see §10).
- Real time-series for vitals (mocked).
- A doctor-review screen between LLM extraction and committing to `patient_state` (cut for hackathon — we auto-apply).
- Visit history list on the patient page.
- Any "alerts / sticky notes" catch-all bucket (considered, deferred).

---

## 13. Open Questions

- **Trends** — should we build a real time-series for vitals/labs and have the LLM append measurements? The clinical advisor explicitly called this out as the most-missed feature in real EMRs. It'd be the single biggest upgrade in v2.
- **Per-section "last updated by Dr. X"** — cheap to add (we already store `updated_by_visit_id`) and pulls weight against the "click neurology, click nutrition" pain the advisor named. Worth a small UX pass.
- **Auto-fill clinical documentation** — the advisor said "people are overburdened by documentation." Once we have transcripts + structured state, generating draft notes (admission notes, discharge summaries) from the same transcript is a natural extension.
- **Chatbot over prior transcripts** — natural-language Q&A against the full visit history of a patient. Mentioned as a possible feature.
- **Speaker labeling reliability** — the "first voice = doctor" heuristic will be wrong some of the time. The tap-to-swap mitigates it, but voice enrollment (see §12) is a real fix.
- **Deepgram key minting** — switch to server-minted short-lived tokens before any non-local deployment.
- **Photo storage at scale** — base64 in row works for hackathon; would migrate to Supabase Storage if patient counts grow.
