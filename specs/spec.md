# Project Spec — Patient Continuity System

> A system that makes patient information explicit, structured, and actively maintained across multiple doctors, so each doctor walking into a room knows exactly what's changed since they last saw the patient.

---

## 1. Problem

Patient handoff in hospitals is informal and unstandardized. Doctor B walks into a room without a precise picture of what Doctor A learned, prescribed, or planned. This causes:

- Discrepancies in understanding of patient status
- Repeated questions to the patient
- Missed updates to the care plan
- Lost long-term goals as patients move between providers

**Our solution:** A web app where every doctor visit is recorded, transcribed, and used to automatically update a structured "source of truth" for the patient. Each doctor has their own per-patient snapshot of "what I last knew," so the next time they open the patient, the system shows them exactly what's changed since their last visit — both as a narrative and as a per-field diff.

---

## 2. Core User Flow

1. **Admission.** A doctor opens "Admit patient," fills out a form (name, DOB, sex, height, weight). A patient row is created with empty source-of-truth fields.
2. **First visit (Doctor A).** Doctor A opens the patient → hits "Start visit" → app records audio, streams it to a transcription service, displays a live transcript. Doctor A hits "End visit."
3. **Update.** Backend finalizes the transcript, calls an LLM to extract structured field updates (goals, diagnoses, meds, vitals, plan), and **auto-applies them** to the patient's source of truth. Doctor A sees the updated fields in a review screen and can edit any field inline if the LLM got it wrong.
4. **Snapshot.** When the visit closes, Doctor A's per-patient snapshot is set equal to the current source of truth.
5. **Second visit (Doctor B).** Doctor B opens the same patient. Because Doctor B has no prior snapshot, they see the full current state with a "first time seeing this patient" banner. They start a visit, the same flow runs, the source of truth is updated, and Doctor B's snapshot is created.
6. **Doctor A returns.** Doctor A opens the patient. The page shows:
   - **"What's changed since you last saw this patient"** — an LLM-generated narrative summary at the top, followed by a per-field old → new diff for every field that changed between Doctor A's snapshot and the current state.
   - The full current source of truth below.
   Doctor A starts a visit; the cycle repeats.

---

## 3. Decisions (locked)

| Area | Decision |
|---|---|
| Frontend | Next.js (App Router) + TailwindCSS |
| Backend | Flask (Python) |
| DB | Supabase Postgres |
| Auth | Hardcoded login by username; username maps 1:1 to a doctor row. No password verification beyond presence-check for the hackathon. |
| Admission | Any logged-in doctor can admit via a form |
| Recording | Browser microphone → real-time streaming transcription (Deepgram or AssemblyAI streaming WebSocket) |
| Field-update mechanism | LLM auto-extracts and overwrites at end-of-visit; doctor can edit any field inline afterward |
| Diff view | LLM-generated narrative + per-field old → new diff |
| Initial source-of-truth fields | `long_term_goals`, `active_diagnoses`, `current_medications`, `recent_vitals`, `treatment_plan` (the schema may store more than is displayed; start with this displayed set) |
| Concurrency | One active visit per patient at a time. Starting a visit takes a soft lock; UI prevents a second doctor from starting one. |

---

## 4. Architecture

```
┌────────────────────┐     HTTPS / WS     ┌────────────────────┐
│   Next.js (web)    │ ─────────────────► │   Flask backend    │
│  - login           │                    │  - REST endpoints  │
│  - patient list    │ ◄──────────────────│  - WS for STT      │
│  - patient detail  │                    │  - LLM calls       │
│  - record visit    │                    └──────────┬─────────┘
└────────────────────┘                               │
         │                                           │
         │ direct browser ► STT provider WS          │ Postgres
         ▼ (streaming audio + transcript)            ▼
┌────────────────────┐                    ┌────────────────────┐
│  Deepgram /        │                    │     Supabase       │
│  AssemblyAI        │                    │     (Postgres)     │
└────────────────────┘                    └────────────────────┘
```

**Audio path.** Browser captures mic → opens a WebSocket either (a) directly to the STT provider with a short-lived token minted by Flask, or (b) through Flask which proxies to STT. **Default to (a)** to keep Flask out of the audio hot path. Flask receives only the finalized transcript at end-of-visit.

**LLM calls.** Flask calls the LLM (OpenAI or Anthropic) for two operations:
1. **Extract** — given current patient state + transcript, return a structured JSON of updated fields.
2. **Narrate diff** — given a doctor's snapshot + current patient state, return a 2–4 sentence summary of what changed.

---

## 5. Data Model

All tables live in Supabase Postgres. UUID primary keys.

### `doctors`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `username` | `text` UNIQUE | used for hardcoded login |
| `name` | `text` | display name (e.g., "Dr. Patel") |
| `created_at` | `timestamptz` | default `now()` |

Seeded with ~3–5 doctors for the demo.

### `patients`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | |
| `dob` | `date` | |
| `sex` | `text` | |
| `height_cm` | `numeric` | |
| `weight_kg` | `numeric` | |
| `admitted_at` | `timestamptz` | default `now()` |
| `admitted_by` | `uuid` FK → doctors | |

### `patient_state`  *(source of truth — one row per patient)*
| column | type | notes |
|---|---|---|
| `patient_id` | `uuid` PK FK → patients | |
| `long_term_goals` | `text` | nullable |
| `active_diagnoses` | `jsonb` | array of `{condition, since, notes}` |
| `current_medications` | `jsonb` | array of `{name, dose, frequency, started_at}` |
| `recent_vitals` | `jsonb` | `{bp, hr, temp_c, o2_sat, taken_at}` |
| `treatment_plan` | `text` | short-term plan / next steps |
| `updated_at` | `timestamptz` | bumped on every visit close |
| `updated_by_visit_id` | `uuid` FK → visits | last visit that wrote to this row |

Row is created (with all fields null/empty) at the moment a patient is admitted.

### `visits`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `patient_id` | `uuid` FK | |
| `doctor_id` | `uuid` FK | |
| `started_at` | `timestamptz` | |
| `ended_at` | `timestamptz` | nullable while active |
| `status` | `text` | `active` \| `processing` \| `complete` |
| `transcript` | `text` | finalized transcript |
| `llm_extracted_fields` | `jsonb` | what the LLM proposed before any manual edits |
| `final_fields` | `jsonb` | what was committed to `patient_state` (post-edit) |

### `doctor_patient_snapshots`
Captures what a given doctor last knew about a given patient. Created lazily.

| column | type | notes |
|---|---|---|
| `doctor_id` | `uuid` FK | composite PK with patient_id |
| `patient_id` | `uuid` FK | |
| `snapshot` | `jsonb` | full copy of `patient_state` at time of snapshot |
| `snapshot_at` | `timestamptz` | |
| `last_visit_id` | `uuid` FK → visits | the visit that produced this snapshot |

Snapshot is **upserted** at the end of every visit — `doctor_id` = the doctor who conducted the visit, `patient_id` = the patient.

---

## 6. Backend API (Flask)

All endpoints return JSON. Auth: client sends `X-Doctor-Username` header; Flask resolves it to a `doctor_id` and rejects unknown usernames.

### Auth
- `POST /api/login` — `{ username }` → `{ doctor: {id, username, name} }`. Looks up the username; 401 if not found. (No password.)

### Patients
- `GET /api/patients` — list of all patients (id, name, dob, admitted_at).
- `POST /api/patients` — admit a new patient. Body: `{ name, dob, sex, height_cm, weight_kg }`. Creates `patients` row + empty `patient_state` row.
- `GET /api/patients/:id` — returns:
  ```json
  {
    "patient": { ...patient row... },
    "current_state": { ...patient_state row... },
    "viewer_snapshot": { ...doctor_patient_snapshots row or null... },
    "diff": {
      "narrative": "string or null",
      "fields": [
        { "field": "current_medications", "before": [...], "after": [...] }
      ]
    },
    "is_first_view": true|false
  }
  ```
  Server computes the per-field diff between `viewer_snapshot.snapshot` and `current_state`. If no snapshot exists, `diff` is null and `is_first_view` is true.

### Visits
- `POST /api/visits/start` — `{ patient_id }` → `{ visit_id, stt_token }`. Creates a `visits` row with `status=active`. Mints a short-lived STT-provider token. Rejects with 409 if another active visit exists for this patient.
- `POST /api/visits/:id/finalize` — `{ transcript }`. Sets `status=processing`, stores transcript, calls the LLM extractor, writes `llm_extracted_fields`, applies them to `patient_state`, also writes `final_fields = llm_extracted_fields` initially. Returns the proposed update for the doctor's review screen.
- `PATCH /api/visits/:id/fields` — `{ fields: {...} }`. Doctor's manual edits during the review screen. Updates `final_fields` and re-applies to `patient_state`.
- `POST /api/visits/:id/close` — finalizes the visit: sets `status=complete`, `ended_at=now()`, and **upserts** the doctor's snapshot to match `patient_state`.

### Diff narrative
- The narrative is generated server-side inside `GET /api/patients/:id` (cached on the snapshot row keyed by `(snapshot_at, patient_state.updated_at)` so we don't re-call the LLM on every page load).

---

## 7. LLM Prompts

### Extractor (called in `finalize`)

**System:**
> You are a clinical scribe. Given a patient's current structured record and a new visit transcript, output the updated record as strict JSON matching the provided schema. Only change fields that the transcript clearly addresses; carry over unchanged fields verbatim. If a field is implied but not stated, leave it unchanged. Never invent vitals or medications not mentioned.

**User:**
```
CURRENT_STATE:
{json of patient_state}

TRANSCRIPT:
{full transcript}

Return JSON with keys: long_term_goals, active_diagnoses, current_medications, recent_vitals, treatment_plan.
```

Use the model's structured-output / JSON mode. Validate against a Pydantic schema before writing.

### Diff narrator

**System:**
> You write very short clinical handoff notes. Given a doctor's prior view of a patient and the current state, write 2–4 plain sentences describing what has changed since they last saw the patient. Do not list things that haven't changed. Speak directly to the doctor in second person.

**User:**
```
YOUR_LAST_VIEW (as of {snapshot_at}):
{json of snapshot}

CURRENT_STATE (as of {updated_at}):
{json of patient_state}
```

---

## 8. Frontend Pages (Next.js App Router)

### `/login`
Single text input for username + Continue button. On success, store `{doctor_id, username, name}` in a client-side context and a cookie. Redirect to `/patients`.

### `/patients`
- Header: "Logged in as Dr. X" + logout.
- "Admit patient" button → opens modal with admission form.
- List of all patients, each row links to `/patients/[id]`.
- Each row shows a small badge: "New changes" if the patient's `updated_at` is newer than the viewing doctor's snapshot for this patient.

### `/patients/[id]`
Sections, top to bottom:
1. **Patient header** — name, DOB/age, sex, height, weight, admitted date.
2. **Changes since you last saw this patient** *(only if `viewer_snapshot` exists and `diff.fields.length > 0`)*
   - Narrative paragraph (from LLM).
   - Per-field diff cards: field name, before (gray, strikethrough where appropriate), after (highlighted).
   - "First time seeing this patient" banner instead, if `is_first_view`.
3. **Current source of truth** — the structured fields rendered cleanly:
   - Long-term goals (text)
   - Active diagnoses (list)
   - Current medications (table: name, dose, frequency)
   - Recent vitals (BP / HR / Temp / O₂ with timestamp)
   - Treatment plan (text)
4. **"Start visit" button.** Opens the recording view in-place.
5. **Visit history** — collapsed list of prior visits for this patient (date, doctor, expandable transcript).

### Recording view (in-place on patient detail)
- Live transcript pane that fills with text as STT streams in.
- Mic level indicator.
- Big "End visit" button.
- On end: switch to "Review extracted updates" view.

### Review extracted updates view
- Side-by-side: "Before" (current state) vs "Proposed after" (LLM extraction).
- Each field is editable (textarea / structured editor for diagnoses, meds, vitals).
- "Save & close visit" button → calls `PATCH /fields` then `POST /close`. Returns to patient detail page, which now shows the updated state.

---

## 9. Streaming Transcription Integration

Use **Deepgram's** browser-side streaming SDK (or AssemblyAI's equivalent) for the demo because it's the lowest-latency path with the least Flask plumbing.

1. Doctor hits "Start visit" → frontend calls `POST /api/visits/start`.
2. Flask creates a visit row and mints a temporary Deepgram token (`/auth/grant` style endpoint, scoped to the project, valid for ~10 minutes).
3. Frontend opens a Deepgram WebSocket using that token, attaches the user's mic via `MediaRecorder` / `getUserMedia`.
4. Deepgram emits interim and final transcript chunks. Frontend appends finals to a local string and shows interims in italics.
5. On "End visit," frontend closes the WS and `POST /api/visits/:id/finalize` with the accumulated final transcript.

Fallback for poor connectivity: if streaming WS fails, frontend records audio with `MediaRecorder`, uploads the blob at end-of-visit to `POST /api/visits/:id/audio`, and Flask runs Whisper on it. (Stretch goal — not required for v1.)

---

## 10. Diffing Logic

`compute_diff(snapshot_json, current_json)` runs on the backend and:
- Returns one entry per top-level field in the patient state schema where `snapshot_json[field] != current_json[field]` (deep equality).
- For `jsonb` array fields (diagnoses, medications), also compute per-item adds/removes/changes by stable key (`name` for meds, `condition` for diagnoses) — return as `{ added: [...], removed: [...], changed: [{before, after}] }` so the UI can render granular badges.
- For `recent_vitals`, treat it as a single object swap (just before/after).
- Skip the diff entirely if `snapshot.snapshot_at >= current.updated_at` — nothing has changed.

---

## 11. Seed / Demo Data

A `seed.py` script that:
- Creates 3 doctors: `dr_patel`, `dr_chen`, `dr_okafor`.
- Creates 2 patients with realistic but fictional state.
- Creates 2 prior visits (one per doctor for the first patient) so the diff view has something to show on first demo open.

---

## 12. Out of Scope (v1)

- HIPAA / real PHI handling — **demo data only**, never use real patient information.
- Audit logs beyond the `visits` table.
- Multi-org / multi-hospital tenancy.
- Real-time push to other doctors viewing the patient (no live sockets between doctor sessions; refresh re-fetches).
- Speaker diarization.
- Editing or deleting past visits.
- Mobile-native app.
- Password-based auth, RBAC beyond "is a doctor."

---

## 14. Open Questions (defer until the above is built)

- Should `recent_vitals` be one slot or a small history? (Currently one slot.)
- Should the doctor be able to flag an LLM extraction as "wrong" so it doesn't get applied at all, vs. just edit it? (Currently edit-only.)
- Do we want field-level "confidence" from the LLM and surface it in the review UI?
- Should the patient itself ever be deletable / dischargeable? (Out of scope for v1.)
