import { getConditionName } from '@/lib/patientClinicalLists';

export function isMultipleSclerosisConditionText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('multiple sclerosis') ||
    normalized.includes('multiples sclerosis') ||
    /\bms\b/.test(normalized)
  );
}

export function hasMultipleSclerosisCondition(conditions: any[]): boolean {
  return conditions.some((condition) => {
    const name = getConditionName(condition);
    return name ? isMultipleSclerosisConditionText(name) : false;
  });
}

export function getMultipleSclerosisOnsetDate(conditions: any[]): Date | null {
  for (const condition of conditions) {
    const name = getConditionName(condition);
    if (!name || !isMultipleSclerosisConditionText(name)) continue;
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
