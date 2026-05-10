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
  physical_exam: string | null;
  past_medical_history: string | null;
  long_term_goals: string | null;
  updated_at: string;
};

export type ViewerSnapshot = {
  doctor_id: string;
  patient_id: string;
  snapshot_at: string;
};

export type GetPatientResponse = {
  patient: Patient;
  current_state: PatientState | null;
  viewer_snapshot: ViewerSnapshot | null;
  narrative: string | null;
  is_first_view: boolean;
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
