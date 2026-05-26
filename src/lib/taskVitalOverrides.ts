export type VitalOverrideType = 'bp' | 'heart-rate';

export interface VitalOverride {
  patientId: string;
  type: VitalOverrideType;
  /** Original FHIR observation timestamp */
  effectiveDateTime: string;
  reason: string;
  heartRate?: number;
  systolic?: number;
  diastolic?: number;
}

export interface DataPoint {
  date: Date;
  dateStr: string;
  value: number;
}

export interface BPDataPoint {
  date: Date;
  dateStr: string;
  systolic: number;
  diastolic: number;
}

const STORAGE_KEY = 'prohealth_task_vital_overrides';

function readAll(): VitalOverride[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(overrides: VitalOverride[]): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

/** Replace stored overrides (e.g. after cardiac overnight vitals task). */
export function saveTaskVitalOverrides(overrides: VitalOverride[]): void {
  writeAll(overrides);
}

export function clearTaskVitalOverrides(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getTaskVitalOverridesForPatient(patientId: string): VitalOverride[] {
  return readAll().filter((override) => override.patientId === patientId);
}

/**
 * Ensures task-flagged vitals appear as the most recent reading in charts/tables.
 * Values come from the flagged observation; timestamp is placed after all existing data.
 */
export function applyTaskVitalOverrides(
  patientId: string,
  vitals: Record<string, DataPoint[]>,
  bpVitals: BPDataPoint[]
): { vitals: Record<string, DataPoint[]>; bpVitals: BPDataPoint[] } {
  const overrides = getTaskVitalOverridesForPatient(patientId);
  if (overrides.length === 0) {
    return { vitals, bpVitals };
  }

  const nextVitals: Record<string, DataPoint[]> = {
    ...vitals,
    '8867-4': [...(vitals['8867-4'] ?? [])],
  };
  let nextBp = [...bpVitals];

  const existingLatest = Math.max(
    0,
    ...nextBp.map((point) => point.date.getTime()),
    ...(nextVitals['8867-4'] ?? []).map((point) => point.date.getTime())
  );

  let bumpMs = existingLatest;

  overrides.forEach((override) => {
    bumpMs += 60_000;
    const date = new Date(bumpMs);
    const dateStr = date.toISOString();

    if (override.type === 'bp' && override.systolic != null) {
      nextBp = nextBp.filter(
        (point) =>
          !(
            point.systolic === override.systolic &&
            point.diastolic === (override.diastolic ?? 0) &&
            point.date.getTime() >= bumpMs - 120_000
          )
      );
      nextBp.push({
        date,
        dateStr,
        systolic: override.systolic,
        diastolic: override.diastolic ?? 0,
      });
    }

    if (override.type === 'heart-rate' && override.heartRate != null) {
      const hrSeries = nextVitals['8867-4'] ?? [];
      nextVitals['8867-4'] = hrSeries.filter(
        (point) =>
          !(point.value === override.heartRate && point.date.getTime() >= bumpMs - 120_000)
      );
      nextVitals['8867-4'].push({
        date,
        dateStr,
        value: override.heartRate,
      });
    }
  });

  Object.keys(nextVitals).forEach((code) => {
    nextVitals[code].sort((a, b) => a.date.getTime() - b.date.getTime());
  });
  nextBp.sort((a, b) => a.date.getTime() - b.date.getTime());

  return { vitals: nextVitals, bpVitals: nextBp };
}
