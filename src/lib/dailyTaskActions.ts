import type { CareCategory } from '@/lib/careCategory';
import type { VitalOverride } from '@/lib/taskVitalOverrides';
import {
  getDueActiveMedications,
  getMedicationAuthoredDays,
  type RefillTaskPatient,
} from '@/lib/medicationRefillWorkflow';

export type DailyTaskAction = 'cardiac-vitals' | 'med-refills';

export interface TaskHighlight {
  patientId: string;
  reason: string;
  category: CareCategory;
  vitalOverride?: VitalOverride;
}

export interface TaskActionResult {
  expandCategories: CareCategory[];
  highlights: TaskHighlight[];
  refillPatients?: RefillTaskPatient[];
}

const OVERNIGHT_MS = 24 * 60 * 60 * 1000;
const MAX_HIGHLIGHTS = 3;

async function fetchBundleResources(url: string): Promise<any[]> {
  const response = await fetch(url);
  if (!response.ok) return [];
  const bundle = await response.json();
  if (!bundle.entry) return [];
  return bundle.entry.map((entry: any) => entry.resource).filter(Boolean);
}

function parsePatientId(reference?: string): string | null {
  if (!reference) return null;
  return reference.replace(/^Patient\//, '');
}

function observationTimestamp(observation: any): number {
  const raw = observation.effectiveDateTime || observation.issued;
  if (!raw) return 0;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isRecent(timestamp: number, windowMs: number): boolean {
  if (timestamp <= 0) return false;
  return Date.now() - timestamp <= windowMs;
}

function getMedicationName(medication: any): string {
  return (
    medication.medicationCodeableConcept?.text ||
    medication.medicationCodeableConcept?.coding?.[0]?.display ||
    medication.medicationReference?.display ||
    'Active medication'
  );
}

function extractBloodPressure(observation: any): { systolic: number; diastolic: number } | null {
  let systolic: number | null = null;
  let diastolic: number | null = null;

  if (observation.component) {
    observation.component.forEach((component: any) => {
      const codes = component.code?.coding?.map((coding: any) => coding.code) || [];
      if (codes.includes('8480-6')) systolic = component.valueQuantity?.value ?? null;
      if (codes.includes('8462-4')) diastolic = component.valueQuantity?.value ?? null;
    });
  }

  if (systolic == null && observation.valueQuantity?.value != null) {
    systolic = observation.valueQuantity.value;
  }

  if (systolic == null) return null;
  return { systolic, diastolic: diastolic ?? 0 };
}

function abnormalVitalReason(observation: any, windowMs: number): string | null {
  const at = observationTimestamp(observation);
  if (!isRecent(at, windowMs)) return null;

  const codes = observation.code?.coding?.map((coding: any) => coding.code) || [];
  const label = (observation.code?.text || '').toLowerCase();

  if (codes.includes('8867-4') && observation.valueQuantity?.value != null) {
    const heartRate = Math.round(observation.valueQuantity.value);
    if (heartRate > 100) return `Elevated heart rate (${heartRate} bpm)`;
    if (heartRate < 50) return `Low heart rate (${heartRate} bpm)`;
  }

  if (codes.includes('55284-4') || label.includes('blood pressure')) {
    const bp = extractBloodPressure(observation);
    if (bp && bp.systolic >= 140) {
      return bp.diastolic
        ? `High BP (${Math.round(bp.systolic)}/${Math.round(bp.diastolic)} mmHg)`
        : `High BP (${Math.round(bp.systolic)} mmHg)`;
    }
  }

  return null;
}

function buildVitalOverride(
  patientId: string,
  observation: any,
  reason: string
): VitalOverride | undefined {
  const codes = observation.code?.coding?.map((coding: any) => coding.code) || [];
  const label = (observation.code?.text || '').toLowerCase();
  const effectiveDateTime =
    observation.effectiveDateTime || observation.issued || new Date().toISOString();

  if (codes.includes('8867-4') && observation.valueQuantity?.value != null) {
    return {
      patientId,
      type: 'heart-rate',
      effectiveDateTime,
      reason,
      heartRate: Math.round(observation.valueQuantity.value),
    };
  }

  if (codes.includes('55284-4') || label.includes('blood pressure')) {
    const bp = extractBloodPressure(observation);
    if (bp) {
      return {
        patientId,
        type: 'bp',
        effectiveDateTime,
        reason,
        systolic: Math.round(bp.systolic),
        diastolic: Math.round(bp.diastolic),
      };
    }
  }

  return undefined;
}

async function findAbnormalCardiacPatients(
  cardiacPatients: { id: string }[],
  windowMs: number
): Promise<TaskHighlight[]> {
  const highlights: TaskHighlight[] = [];

  await Promise.all(
    cardiacPatients.map(async (patient) => {
      const observations = await fetchBundleResources(
        `/api/fhir/Observation?subject=Patient/${patient.id}&code=8867-4,55284-4&_sort=-date&_count=30`
      );

      for (const observation of observations) {
        const reason = abnormalVitalReason(observation, windowMs);
        if (reason) {
          highlights.push({
            patientId: patient.id,
            reason,
            category: 'cardiac',
            vitalOverride: buildVitalOverride(patient.id, observation, reason),
          });
          break;
        }
      }
    })
  );

  return highlights;
}

export async function resolveCardiacVitalsTask(
  cardiacPatients: { id: string; clinicalCategory: CareCategory }[]
): Promise<TaskActionResult> {
  let highlights = await findAbnormalCardiacPatients(cardiacPatients, OVERNIGHT_MS);

  // Widen to recent readings if overnight window has no flags
  if (highlights.length === 0) {
    highlights = await findAbnormalCardiacPatients(cardiacPatients, 7 * OVERNIGHT_MS);
  }

  return {
    expandCategories: ['cardiac'],
    highlights: highlights.slice(0, 2),
  };
}

export async function resolveMedicationRefillsTask(
  patients: { id: string; clinicalCategory: CareCategory }[]
): Promise<TaskActionResult> {
  const medications = await fetchBundleResources(
    '/api/fhir/MedicationRequest?status=active&_count=200'
  );

  const medsByPatient = new Map<string, any[]>();
  medications.forEach((medication) => {
    const patientId = parsePatientId(medication.subject?.reference);
    if (!patientId) return;
    const list = medsByPatient.get(patientId) ?? [];
    list.push(medication);
    medsByPatient.set(patientId, list);
  });

  const patientCategoryById = new Map(
    patients.map((patient) => [patient.id, patient.clinicalCategory])
  );

  const candidates: TaskHighlight[] = [];

  medsByPatient.forEach((patientMeds, patientId) => {
    const category = patientCategoryById.get(patientId);
    if (!category) return;

    const sorted = [...patientMeds].sort(
      (a, b) => getMedicationAuthoredDays(b) - getMedicationAuthoredDays(a)
    );
    const medication = sorted[0];
    const medName = getMedicationName(medication);
    const dueMeds = getDueActiveMedications(patientMeds);

    candidates.push({
      patientId,
      category,
      reason:
        dueMeds.length > 0
          ? `${getMedicationName(dueMeds[0])} — refill due`
          : `${medName} — confirm refill`,
    });
  });

  candidates.sort((a, b) => {
    const daysA = Math.max(
      ...(medsByPatient.get(a.patientId) ?? []).map(getMedicationAuthoredDays)
    );
    const daysB = Math.max(
      ...(medsByPatient.get(b.patientId) ?? []).map(getMedicationAuthoredDays)
    );
    return daysB - daysA;
  });

  const highlights = candidates.slice(0, MAX_HIGHLIGHTS);
  const expandCategories = [
    ...new Set(highlights.map((highlight) => highlight.category)),
  ] as CareCategory[];

  const refillPatients: RefillTaskPatient[] = highlights.map((highlight) => {
    const patientMeds = medsByPatient.get(highlight.patientId) ?? [];
    const dueMeds = getDueActiveMedications(patientMeds);
    return {
      patientId: highlight.patientId,
      dueMedicationIds: dueMeds.map((med) => med.id).filter(Boolean),
    };
  });

  return { expandCategories, highlights, refillPatients };
}
