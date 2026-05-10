// Mock clinical data, deterministically seeded from patient_id.
// Vitals trends and labs are not yet pulled from real transcripts — the LLM
// gives us the latest values via patient_state.recent_vitals; trends and labs
// here are visual placeholders that stay stable per patient across renders.

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

export type VitalSeries = {
  bp_sys: number[];
  bp_dia: number[];
  hr: number[];
  temp_c: number[];
  o2_sat: number[];
  days: string[];
};

export function mockVitalsSeries(patientId: string): VitalSeries {
  const rand = seededRandom(patientId);
  const days = 7;
  const today = new Date();
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  const sysBase = 118 + rand() * 30;
  const diaBase = 72 + rand() * 18;
  const hrBase = 62 + rand() * 25;
  const tempBase = 36.6 + rand() * 0.6;
  const o2Base = 95 + rand() * 4;

  const drift = (base: number, magnitude: number) =>
    Array.from({ length: days }, () => base + (rand() - 0.5) * magnitude);

  return {
    bp_sys: drift(sysBase, 12).map((v) => Math.round(v)),
    bp_dia: drift(diaBase, 8).map((v) => Math.round(v)),
    hr: drift(hrBase, 10).map((v) => Math.round(v)),
    temp_c: drift(tempBase, 0.5).map((v) => +v.toFixed(1)),
    o2_sat: drift(o2Base, 2).map((v) => Math.min(100, Math.round(v))),
    days: labels,
  };
}

export type Lab = {
  name: string;
  value: number;
  unit: string;
  range: string;
  abnormal: boolean;
  trend: number[];
};

const LAB_DEFINITIONS: { name: string; unit: string; range: string; lo: number; hi: number }[] = [
  { name: "A1C", unit: "%", range: "<7.0", lo: 4.5, hi: 8.5 },
  { name: "Hemoglobin", unit: "g/dL", range: "12.0-17.0", lo: 10, hi: 17 },
  { name: "WBC", unit: "K/μL", range: "4.0-11.0", lo: 3.5, hi: 13 },
  { name: "Creatinine", unit: "mg/dL", range: "0.6-1.2", lo: 0.6, hi: 1.6 },
  { name: "Potassium", unit: "mEq/L", range: "3.5-5.0", lo: 3.3, hi: 5.3 },
];

function isAbnormal(value: number, range: string): boolean {
  const lt = range.match(/^<\s*(\d+(?:\.\d+)?)/);
  if (lt) return value >= parseFloat(lt[1]);
  const gt = range.match(/^>\s*(\d+(?:\.\d+)?)/);
  if (gt) return value <= parseFloat(gt[1]);
  const dash = range.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (dash) {
    const lo = parseFloat(dash[1]);
    const hi = parseFloat(dash[2]);
    return value < lo || value > hi;
  }
  return false;
}

export function mockLabs(patientId: string): Lab[] {
  const rand = seededRandom(patientId + "labs");
  return LAB_DEFINITIONS.map((d) => {
    const value = +(d.lo + rand() * (d.hi - d.lo)).toFixed(1);
    const trend = Array.from({ length: 5 }, () =>
      +(value + (rand() - 0.5) * (d.hi - d.lo) * 0.15).toFixed(1)
    );
    return {
      name: d.name,
      value,
      unit: d.unit,
      range: d.range,
      abnormal: isAbnormal(value, d.range),
      trend,
    };
  });
}
