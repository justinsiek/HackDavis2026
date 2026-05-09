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
  admitted_at: string;
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
