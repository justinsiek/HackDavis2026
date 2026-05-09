-- HackDavis Patient Continuity System — schema
-- Run in the Supabase SQL editor (or via `supabase db execute --file db/schema.sql`).
-- Flask connects with the service-role key, which bypasses RLS, so no policies are needed.

-- ---------------------------------------------------------------------------
-- 1. doctors
-- ---------------------------------------------------------------------------
create table if not exists doctors (
  id          uuid primary key default gen_random_uuid(),
  username    text unique not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. patients
-- ---------------------------------------------------------------------------
create table if not exists patients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  dob          date,
  sex          text,
  height_cm    numeric,
  weight_kg    numeric,
  admitted_at  timestamptz not null default now(),
  admitted_by  uuid not null references doctors(id)
);

-- ---------------------------------------------------------------------------
-- 3. visits
-- ---------------------------------------------------------------------------
create table if not exists visits (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references patients(id) on delete cascade,
  doctor_id             uuid not null references doctors(id),
  started_at            timestamptz not null default now(),
  ended_at              timestamptz,
  status                text not null default 'active'
                          check (status in ('active', 'processing', 'complete')),
  transcript            text,
  llm_extracted_fields  jsonb,
  final_fields          jsonb
);

-- Most patient-detail queries pull recent visits for one patient.
create index if not exists visits_patient_started_idx
  on visits (patient_id, started_at desc);

-- ---------------------------------------------------------------------------
-- 4. patient_state (source of truth — one row per patient)
-- ---------------------------------------------------------------------------
create table if not exists patient_state (
  patient_id           uuid primary key references patients(id) on delete cascade,
  long_term_goals      text,
  active_diagnoses     jsonb not null default '[]'::jsonb,
  current_medications  jsonb not null default '[]'::jsonb,
  recent_vitals        jsonb,
  treatment_plan       text,
  updated_at           timestamptz not null default now(),
  updated_by_visit_id  uuid references visits(id)
);

-- ---------------------------------------------------------------------------
-- 5. doctor_patient_snapshots (each doctor's "last understanding" per patient)
-- ---------------------------------------------------------------------------
create table if not exists doctor_patient_snapshots (
  doctor_id      uuid not null references doctors(id) on delete cascade,
  patient_id     uuid not null references patients(id) on delete cascade,
  snapshot       jsonb not null,
  snapshot_at    timestamptz not null default now(),
  last_visit_id  uuid references visits(id),
  primary key (doctor_id, patient_id)
);
