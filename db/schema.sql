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
  photo_data   text,
  admitted_at  timestamptz not null default now(),
  admitted_by  uuid not null references doctors(id)
);

-- For projects already created before `photo_data` was added:
alter table patients add column if not exists photo_data text;

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
  summary               text,
  llm_extracted_fields  jsonb,
  final_fields          jsonb
);

-- For projects already created before `summary` was added:
alter table visits add column if not exists summary text;

-- Most patient-detail queries pull recent visits for one patient.
create index if not exists visits_patient_started_idx
  on visits (patient_id, started_at desc);

-- ---------------------------------------------------------------------------
-- 4. patient_state (source of truth — one row per patient)
-- ---------------------------------------------------------------------------
create table if not exists patient_state (
  patient_id            uuid primary key references patients(id) on delete cascade,
  synopsis              text,
  current_presentation  text,
  active_diagnoses      jsonb not null default '[]'::jsonb,
  current_medications   jsonb not null default '[]'::jsonb,
  recent_vitals         jsonb,
  treatment_plan        text,
  physical_exam         text,
  past_medical_history  text,
  long_term_goals       text,
  updated_at            timestamptz not null default now(),
  updated_by_visit_id   uuid references visits(id)
);

-- For projects already created before these were added:
alter table patient_state add column if not exists synopsis             text;
alter table patient_state add column if not exists current_presentation text;
alter table patient_state add column if not exists physical_exam        text;
alter table patient_state add column if not exists past_medical_history text;

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

-- ---------------------------------------------------------------------------
-- 6. patient_documents (uploaded prior medical records)
-- ---------------------------------------------------------------------------
create table if not exists patient_documents (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  filename     text not null,
  mime_type    text,
  file_data    text not null,
  uploaded_at  timestamptz not null default now(),
  uploaded_by  uuid references doctors(id)
);

create index if not exists patient_documents_patient_idx
  on patient_documents (patient_id, uploaded_at desc);
