import {
  simplifyMedicationDisplayName,
  resolveMedicationProfile,
  resolveMedicationForm,
  frequencyLabel,
} from '@/lib/medicationCatalog';
import { getConditionSnomedCoding } from '@/lib/snomedCodes';
import { findCoding, RXNORM_SYSTEM } from '@/lib/fhirTerminology';

export const CLINICAL_LIST_PREVIEW_COUNT = 4;
export const MAX_MEDICATIONS_PER_PATIENT = 10;

export function isEnrolmentCondition(condition: any): boolean {
  const label = (
    condition.code?.text ||
    condition.code?.coding?.[0]?.display ||
    ''
  ).toLowerCase();
  return label.includes('enrolment') || label.includes('enrollment');
}

export function getConditionName(condition: any): string {
  const snomed = getConditionSnomedCoding(condition);
  if (snomed?.display) return snomed.display;
  return (
    condition.code?.text ||
    condition.code?.coding?.[0]?.display ||
    'Unknown Condition'
  );
}

export function getConditionDisplayDate(condition: any): Date {
  const raw =
    condition.recordedDate ||
    condition.onsetDateTime ||
    condition.meta?.lastUpdated ||
    '';
  if (!raw) return new Date(0);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

/** Problem list items only, newest first. */
export function sortConditionsForDisplay(conditions: any[]): any[] {
  return conditions
    .filter((condition) => !isEnrolmentCondition(condition))
    .sort(
      (a, b) =>
        getConditionDisplayDate(b).getTime() - getConditionDisplayDate(a).getTime()
    );
}

export function getMedicationName(medication: any): string {
  const rxnorm = findCoding(medication.medicationCodeableConcept?.coding, RXNORM_SYSTEM);
  const raw =
    rxnorm?.display ||
    medication.medicationCodeableConcept?.text ||
    medication.medicationCodeableConcept?.coding?.[0]?.display ||
    medication.medicationReference?.display ||
    'Unknown Medication';
  return simplifyMedicationDisplayName(raw);
}

function getMedicationRawName(medication: any): string {
  return (
    medication.medicationCodeableConcept?.text ||
    medication.medicationCodeableConcept?.coding?.[0]?.display ||
    medication.medicationReference?.display ||
    ''
  );
}

export function getMedicationForm(medication: any): string {
  const dosageInstruction = medication.dosageInstruction?.[0];
  const fromResource =
    dosageInstruction?.doseAndRate?.[0]?.type?.text ||
    dosageInstruction?.doseAndRate?.[0]?.type?.coding?.[0]?.display;
  if (fromResource?.trim()) return fromResource.trim();

  const rawName = getMedicationRawName(medication);
  const route = getMedicationRoute(medication);
  return resolveMedicationForm(rawName, route);
}

export function getMedicationStartDate(medication: any): Date | null {
  const raw =
    medication.authoredOn ||
    medication.dispenseRequest?.validityPeriod?.start ||
    medication.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod?.start ||
    medication.meta?.lastUpdated;

  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getMedicationEndDate(medication: any): Date | null {
  const status = (medication.status || '').toLowerCase();
  const isCompleted =
    status === 'completed' ||
    status === 'stopped' ||
    status === 'cancelled' ||
    status === 'discontinued';

  if (!isCompleted) return null;

  const raw =
    medication.dispenseRequest?.validityPeriod?.end ||
    medication.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod?.end;

  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const MEDICATION_STATUS_ORDER: Record<string, number> = {
  active: 0,
  'on-hold': 1,
  draft: 2,
  completed: 3,
  stopped: 4,
  cancelled: 5,
  discontinued: 6,
  unknown: 7,
};

/** Active prescriptions first, then reverse chronological by start date. */
export function sortMedicationsForDisplay(medications: any[]): any[] {
  return [...medications]
    .filter((medication) => (medication.status || '').toLowerCase() !== 'entered-in-error')
    .sort((a, b) => {
    const statusA = MEDICATION_STATUS_ORDER[a.status] ?? 8;
    const statusB = MEDICATION_STATUS_ORDER[b.status] ?? 8;
    if (statusA !== statusB) return statusA - statusB;

    const dateA = getMedicationStartDate(a)?.getTime() ?? 0;
    const dateB = getMedicationStartDate(b)?.getTime() ?? 0;
    return dateB - dateA;
  });
}

function getResolvedMedicationFallback(medication: any) {
  const raw =
    medication.medicationCodeableConcept?.text ||
    medication.medicationCodeableConcept?.coding?.[0]?.display ||
    medication.medicationReference?.display ||
    '';
  return resolveMedicationProfile(raw);
}

export function getMedicationDosage(medication: any): string {
  const dosageInstruction = medication.dosageInstruction?.[0];
  const doseQuantity = dosageInstruction?.doseAndRate?.[0]?.doseQuantity;
  if (doseQuantity?.value != null) {
    return `${doseQuantity.value} ${doseQuantity.unit || ''}`.trim();
  }
  const fallback = getResolvedMedicationFallback(medication);
  return `${fallback.dose} ${fallback.unit}`.trim();
}

export function getMedicationFrequency(medication: any): string {
  const dosageInstruction = medication.dosageInstruction?.[0];
  const fromResource =
    dosageInstruction?.timing?.code?.text ||
    (dosageInstruction?.timing?.repeat?.frequency
      ? `${dosageInstruction.timing.repeat.frequency}x daily`
      : null);
  if (fromResource && fromResource !== '—') return fromResource;
  return frequencyLabel(getResolvedMedicationFallback(medication).frequency);
}

export function getMedicationRoute(medication: any): string {
  const dosageInstruction = medication.dosageInstruction?.[0];
  const fromResource =
    dosageInstruction?.route?.text ||
    dosageInstruction?.route?.coding?.[0]?.display;
  if (fromResource && fromResource !== '—') return fromResource;
  return getResolvedMedicationFallback(medication).route;
}

export function formatMedicationDate(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function formatClinicalDateFromString(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  return formatMedicationDate(new Date(dateStr));
}

export function isCompletedMedicationStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return (
    normalized === 'completed' ||
    normalized === 'stopped' ||
    normalized === 'cancelled' ||
    normalized === 'discontinued'
  );
}
