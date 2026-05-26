import type { CareCategory } from '@/lib/careCategory';
import type { TaskHighlight } from '@/lib/dailyTaskActions';
import {
  findLatestDailyWeightIncrease,
} from '@/lib/patientAnthropometrics';
import { isWeightDailyIncreaseWarning } from '@/lib/vitalRangeAlerts';

export interface NotificationActionResult {
  expandCategories: CareCategory[];
  highlights: TaskHighlight[];
  /** When set, navigate directly to this patient instead of opening the list. */
  navigateToPatientId?: string;
}

const MISSED_GLUCOSE_MS = 48 * 60 * 60 * 1000;
const GLUCOSE_CODES = '15074-8,2339-0,2345-7';

async function fetchBundleResources(url: string): Promise<any[]> {
  const response = await fetch(url);
  if (!response.ok) return [];
  const bundle = await response.json();
  if (!bundle.entry) return [];
  return bundle.entry.map((entry: any) => entry.resource).filter(Boolean);
}

function observationTimestamp(observation: any): number {
  const raw = observation.effectiveDateTime || observation.issued;
  if (!raw) return 0;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isGlucoseObservation(observation: any): boolean {
  const codes = observation.code?.coding?.map((coding: any) => coding.code) || [];
  const label = (observation.code?.text || '').toLowerCase();
  return (
    codes.some((code: string) => ['15074-8', '2339-0', '2345-7'].includes(code)) ||
    label.includes('glucose') ||
    label.includes('blood sugar')
  );
}

async function hasRecentGlucoseReading(patientId: string): Promise<boolean> {
  const observations = await fetchBundleResources(
    `/api/fhir/Observation?subject=Patient/${patientId}&code=${GLUCOSE_CODES}&_sort=-date&_count=10`
  );

  const glucoseReadings = observations.filter(isGlucoseObservation);
  if (glucoseReadings.length === 0) {
    return false;
  }

  const latestTs = Math.max(...glucoseReadings.map(observationTimestamp));
  return Date.now() - latestTs <= MISSED_GLUCOSE_MS;
}

export async function resolveMissedGlucoseNotification(
  diabeticPatients: { id: string; clinicalCategory: CareCategory }[]
): Promise<NotificationActionResult> {
  const highlights: TaskHighlight[] = [];

  await Promise.all(
    diabeticPatients.map(async (patient) => {
      const hasRecent = await hasRecentGlucoseReading(patient.id);
      if (!hasRecent) {
        highlights.push({
          patientId: patient.id,
          category: 'diabetic',
          reason: 'No glucose reading in the past 48 hours',
        });
      }
    })
  );

  if (highlights.length === 1) {
    return {
      expandCategories: [],
      highlights,
      navigateToPatientId: highlights[0].patientId,
    };
  }

  return {
    expandCategories: highlights.length > 0 ? ['diabetic'] : [],
    highlights,
  };
}

function parseWeightObservations(observations: any[]) {
  return observations
    .map((observation) => {
      const dateStr = observation.effectiveDateTime || observation.issued;
      if (!dateStr) return null;
      const date = new Date(dateStr);
      const value = observation.valueQuantity?.value;
      if (Number.isNaN(date.getTime()) || typeof value !== 'number') return null;
      return { date, dateStr, value };
    })
    .filter((point): point is { date: Date; dateStr: string; value: number } => point !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function findPatientsWithWeightGainWarning(
  patients: { id: string; clinicalCategory: CareCategory }[]
): Promise<TaskHighlight[]> {
  const highlights: TaskHighlight[] = [];

  await Promise.all(
    patients.map(async (patient) => {
      const observations = await fetchBundleResources(
        `/api/fhir/Observation?subject=Patient/${patient.id}&code=29463-7&_sort=-date&_count=30`
      );
      const points = parseWeightObservations(observations);
      const latestIncrease = findLatestDailyWeightIncrease(points);
      if (!latestIncrease || !isWeightDailyIncreaseWarning(latestIncrease.deltaKg)) {
        return;
      }

      highlights.push({
        patientId: patient.id,
        category: patient.clinicalCategory,
        reason: `Weight increased ${latestIncrease.deltaKg} kg in 1 day (${latestIncrease.previousKg} → ${latestIncrease.currentKg} kg)`,
      });
    })
  );

  return highlights;
}

export async function resolveWeightGainNotification(
  patients: { id: string; clinicalCategory: CareCategory }[]
): Promise<NotificationActionResult> {
  const highlights = await findPatientsWithWeightGainWarning(patients);

  if (highlights.length === 1) {
    return {
      expandCategories: [],
      highlights,
      navigateToPatientId: highlights[0].patientId,
    };
  }

  const expandCategories = [...new Set(highlights.map((highlight) => highlight.category))];

  return {
    expandCategories,
    highlights,
  };
}
