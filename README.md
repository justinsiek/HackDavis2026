# HackDavis 2026 — Patient Continuity System

A web app that records doctor–patient visits, automatically updates a structured patient "source of truth," and shows each doctor exactly what's changed since the last time they saw the patient.

Full vision and data model: [specs/spec.md](specs/spec.md).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (App Router) + TailwindCSS |
| Backend | Flask (Python) |
| Database | Supabase (Postgres) |
| Transcription | Deepgram / AssemblyAI streaming (planned) |

---

## Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- A **Supabase** project (free tier is fine)

---

## 1. Clone & set up Supabase

```bash
git clone https://github.com/justinsiek/HackDavis2026.git
cd HackDavis2026
```

Then in your Supabase project:

1. Open the **SQL Editor**.
2. Paste the contents of [db/schema.sql](db/schema.sql) and run it. This creates the 5 tables: `doctors`, `patients`, `patient_state`, `visits`, `doctor_patient_snapshots`.
3. Grab your **Project URL** and **`service_role` key** from Project Settings → API. (Use `service_role`, not `anon` — Flask needs to bypass RLS.)

---

## 2. Backend (Flask)

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `server/.env` from the template:

```bash
cp .env.example .env
```

Then edit `.env` and fill in:

```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Run the server:

```bash
python server.py
```

Smoke test in another terminal:

```bash
curl http://localhost:8080/api/health
# → {"ok": true, "doctors_count": 0}
```

If you see `ok: true`, the database is wired up correctly.

---

## 3. Frontend (Next.js)

```bash
cd client
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

---

## Project layout

```
HackDavis/
├── client/        # Next.js + Tailwind frontend
├── server/        # Flask backend
│   ├── server.py
│   ├── requirements.txt
│   ├── .env.example
│   └── .venv/     # (gitignored) Python virtualenv
├── db/
│   └── schema.sql # Supabase DDL — run once in SQL editor
├── specs/
│   └── spec.md    # Full project spec — read this first
└── README.md
```

---

## Workflow notes

- **Never commit `.env`.** It's in `.gitignore`. Use `.env.example` to share variable names.
- **Service-role key bypasses RLS.** Keep it server-side only — never ship it to the browser.
- **Schema changes** go in [db/schema.sql](db/schema.sql) and need to be re-run in Supabase. Hackathon-style; no migration tooling.
- **Spec is the source of truth** for product decisions. If you're about to make an architectural call, check [specs/spec.md](specs/spec.md) first.
