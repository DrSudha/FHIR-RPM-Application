/** CKD staging threshold — values below 60 mL/min/1.73m² are abnormal. */
export const EGFR_ABNORMAL_THRESHOLD = 60;

export function isEgfrAbnormal(value: number): boolean {
  return value < EGFR_ABNORMAL_THRESHOLD;
}

export function formatEgfrValue(value: number): string {
  return `${Math.round(value)} mL/min/1.73m²`;
}
