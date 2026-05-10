const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const STORAGE_KEY = "hackdavis.doctor";

export type Doctor = {
  id: string;
  username: string;
  name: string;
};

export type Patient = {
  id: string;
  name: string;
  dob: string | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  photo_data: string | null;
  admitted_at: string;
  has_new_updates?: boolean;
};

export type Diagnosis = {
  condition: string;
  since: string;
  notes: string;
};

export type Medication = {
  name: string;
  dose: string;
  frequency: string;
};

export type Vitals = {
  bp: string;
  hr: string;
  temp_c: string;
  o2_sat: string;
  taken_at: string;
};

export type PatientState = {
  patient_id: string;
  synopsis: string | null;
  current_presentation: string | null;
  active_diagnoses: Diagnosis[];
  current_medications: Medication[];
  treatment_plan: string | null;
  recent_vitals: Vitals | null;
  long_term_goals: string | null;
  updated_at: string;
};

export type Visit = {
  id: string;
  doctor_id: string;
  doctor_name: string;
  started_at: string;
  ended_at: string | null;
  status: "active" | "processing" | "complete";
  transcript: string | null;
  summary: string | null;
};

export type ViewerSnapshot = {
  doctor_id: string;
  patient_id: string;
  snapshot_at: string;
  snapshot: Partial<EditableValueMap> | null;
};

export type PatientDocument = {
  id: string;
  filename: string;
  mime_type: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
};

export type FieldDiffText = {
  field: string;
  label: string;
  kind: "text";
  before: string;
  after: string;
};

export type FieldDiffList = {
  field: string;
  label: string;
  kind: "list";
  added: string[];
  removed: string[];
  modified: { before: string; after: string }[];
};

export type FieldDiffVitals = {
  field: string;
  label: string;
  kind: "vitals";
  changes: { key: string; before: string; after: string }[];
};

export type FieldDiff = FieldDiffText | FieldDiffList | FieldDiffVitals;

export const PLAN_ITEM_CATEGORIES = [
  "URGENT",
  "Follow-up",
  "Tests/Labs",
  "Medication",
  "Monitoring",
  "Lifestyle",
] as const;
export type PlanItemCategory = (typeof PLAN_ITEM_CATEGORIES)[number];

export type PlanItem = {
  id: string;
  category: PlanItemCategory;
  text: string;
  done: boolean;
  created_at: string;
  created_by: string | null;
  created_during_visit_id: string | null;
  updated_at: string;
};


export type GetPatientResponse = {
  patient: Patient;
  current_state: PatientState | null;
  viewer_snapshot: ViewerSnapshot | null;
  narrative: string | null;
  field_diffs: FieldDiff[];
  is_first_view: boolean;
  documents: PatientDocument[];
  visits: Visit[];
  plan_items: PlanItem[];
};

export const EDITABLE_FIELDS = [
  "synopsis",
  "current_presentation",
  "active_diagnoses",
  "current_medications",
  "recent_vitals",
  "treatment_plan",
  "long_term_goals",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type EditableValueMap = {
  synopsis: string | null;
  current_presentation: string | null;
  active_diagnoses: Diagnosis[];
  current_medications: Medication[];
  recent_vitals: Vitals | null;
  treatment_plan: string | null;
  long_term_goals: string | null;
};

export type PublishEditsResponse = {
  current_state: PatientState;
  changed_fields: EditableField[];
};

export type FieldChange = {
  id: string;
  before_value: unknown;
  after_value: unknown;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  source: "edit";
};

export type FieldChangesResponse = {
  changes: FieldChange[];
};

export type FieldChangeCounts = Record<EditableField, number>;

export type FieldChangeCountsResponse = {
  counts: FieldChangeCounts;
};

export function getStoredDoctor(): Doctor | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Doctor;
  } catch {
    return null;
  }
}

export function setStoredDoctor(doctor: Doctor | null) {
  if (typeof window === "undefined") return;
  if (doctor) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doctor));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const doctor = getStoredDoctor();
  if (doctor) headers.set("X-Doctor-Username", doctor.username);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && data.error) ||
      `Request failed (${res.status})`;
    throw new ApiError(String(message), res.status);
  }
  return data as T;
}

export function getFieldChanges(patientId: string, field: EditableField) {
  return api<FieldChangesResponse>(
    `/api/patients/${patientId}/changes?field=${encodeURIComponent(field)}`
  );
}

export function getFieldChangeCounts(patientId: string) {
  return api<FieldChangeCountsResponse>(`/api/patients/${patientId}/changes`);
}
