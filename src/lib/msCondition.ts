import { getConditionName } from '@/lib/patientClinicalLists';
import { COMMON_DIAGNOSIS_SNOMED } from '@/lib/snomedCodes';
import { findCoding, SNOMED_SYSTEM } from '@/lib/fhirTerminology';

export function isMultipleSclerosisConditionText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('multiple sclerosis') ||
    normalized.includes('multiples sclerosis') ||
    /\bms\b/.test(normalized)
  );
}

function isMultipleSclerosisConditionResource(condition: any): boolean {
  const snomed = findCoding(condition.code?.coding, SNOMED_SYSTEM);
  if (snomed?.code === COMMON_DIAGNOSIS_SNOMED.multipleSclerosis.code) {
    return true;
  }
  const name = getConditionName(condition);
  return name ? isMultipleSclerosisConditionText(name) : false;
}

export function hasMultipleSclerosisCondition(conditions: any[]): boolean {
  return conditions.some(isMultipleSclerosisConditionResource);
}

export function getMultipleSclerosisOnsetDate(conditions: any[]): Date | null {
  for (const condition of conditions) {
    if (!isMultipleSclerosisConditionResource(condition)) continue;
    const raw = condition.onsetDateTime || condition.recordedDate;
    if (!raw) continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function formatMsDiagnosisLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
