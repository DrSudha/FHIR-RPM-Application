import {
  getMedicationDosage,
  getMedicationName,
} from '@/lib/patientClinicalLists';

export const REFILL_DUE_DAYS = 25;

const REFILL_STORAGE_KEY = 'prohealth_refill_initiations';

export type RefillInitiation = {
  patientId: string;
  medicationRequestId: string;
  initiatedAt: string;
  initiatedByUserId: string;
};

export type RefillTaskPatient = {
  patientId: string;
  dueMedicationIds: string[];
};

export function getMedicationAuthoredDays(medication: any): number {
  const raw = medication.authoredOn;
  if (!raw) return 0;
  const authored = new Date(raw).getTime();
  if (Number.isNaN(authored)) return 0;
  return (Date.now() - authored) / (24 * 60 * 60 * 1000);
}

export function isMedicationDueForRefill(medication: any): boolean {
  const status = (medication.status || '').toLowerCase();
  if (status !== 'active') return false;
  return getMedicationAuthoredDays(medication) >= REFILL_DUE_DAYS;
}

export function getDueActiveMedications(medications: any[]): any[] {
  return medications.filter(isMedicationDueForRefill);
}

function readRefillInitiations(): RefillInitiation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(REFILL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRefillInitiations(items: RefillInitiation[]): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(REFILL_STORAGE_KEY, JSON.stringify(items));
}

export function getRefillInitiations(): RefillInitiation[] {
  return readRefillInitiations();
}

export function isRefillInitiated(patientId: string, medicationRequestId: string): boolean {
  return readRefillInitiations().some(
    (entry) =>
      entry.patientId === patientId && entry.medicationRequestId === medicationRequestId
  );
}

export function recordRefillInitiation(
  patientId: string,
  medicationRequestId: string,
  initiatedByUserId: string
): RefillInitiation {
  const entry: RefillInitiation = {
    patientId,
    medicationRequestId,
    initiatedAt: new Date().toISOString(),
    initiatedByUserId,
  };
  const stored = readRefillInitiations();
  writeRefillInitiations([...stored, entry]);
  return entry;
}

export function areAllRefillTasksComplete(refillPatients: RefillTaskPatient[]): boolean {
  if (refillPatients.length === 0) return true;
  return refillPatients.every((patient) =>
    patient.dueMedicationIds.every((medicationId) =>
      isRefillInitiated(patient.patientId, medicationId)
    )
  );
}

export function countPendingRefillInitiations(refillPatients: RefillTaskPatient[]): number {
  return refillPatients.reduce((total, patient) => {
    const pending = patient.dueMedicationIds.filter(
      (medicationId) => !isRefillInitiated(patient.patientId, medicationId)
    ).length;
    return total + pending;
  }, 0);
}

export function buildMedicationRefillNoteText(medication: any): string {
  const name = getMedicationName(medication);
  const dosage = getMedicationDosage(medication);
  return `Medication refill initiated for ${name} (${dosage}). Refill request submitted to pharmacy for processing and patient notification.`;
}
