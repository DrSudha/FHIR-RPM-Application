export const VITAL_WARNING_THRESHOLDS = {
  bpSystolicMax: 130,
  bpDiastolicMax: 95,
  heartRateMax: 100,
  glucoseMax: 130,
  o2Min: 90,
  respiratoryRateMax: 25,
  weightDailyIncreaseKg: 1,
} as const;

export const VITAL_CRITICAL_THRESHOLDS = {
  bpSystolicMax: 150,
  bpDiastolicMax: 110,
  heartRateMax: 140,
  glucoseMax: 200,
  o2Min: 80,
  respiratoryRateMax: 30,
} as const;

/** @deprecated Use VITAL_WARNING_THRESHOLDS */
export const VITAL_ALERT_THRESHOLDS = VITAL_WARNING_THRESHOLDS;

export type VitalAlertType = 'hr' | 'bp' | 'glucose' | 'rr' | 'o2' | 'weight';
export type VitalAlertSeverity = 'none' | 'warning' | 'critical';

function severityRank(severity: VitalAlertSeverity): number {
  if (severity === 'critical') return 2;
  if (severity === 'warning') return 1;
  return 0;
}

function maxSeverity(...severities: VitalAlertSeverity[]): VitalAlertSeverity {
  return severities.reduce((max, current) =>
    severityRank(current) > severityRank(max) ? current : max
  , 'none' as VitalAlertSeverity);
}

export function isHeartRateCritical(value: number): boolean {
  return value > VITAL_CRITICAL_THRESHOLDS.heartRateMax;
}

export function isHeartRateWarning(value: number): boolean {
  return value > VITAL_WARNING_THRESHOLDS.heartRateMax;
}

export function isBloodPressureCritical(systolic: number, diastolic: number): boolean {
  return (
    systolic > VITAL_CRITICAL_THRESHOLDS.bpSystolicMax ||
    diastolic > VITAL_CRITICAL_THRESHOLDS.bpDiastolicMax
  );
}

export function isBloodPressureWarning(systolic: number, diastolic: number): boolean {
  return (
    systolic > VITAL_WARNING_THRESHOLDS.bpSystolicMax ||
    diastolic > VITAL_WARNING_THRESHOLDS.bpDiastolicMax
  );
}

export function isGlucoseCritical(value: number): boolean {
  return value > VITAL_CRITICAL_THRESHOLDS.glucoseMax;
}

export function isGlucoseWarning(value: number): boolean {
  return value > VITAL_WARNING_THRESHOLDS.glucoseMax;
}

export function isWeightDailyIncreaseWarning(deltaKg: number): boolean {
  return deltaKg >= VITAL_WARNING_THRESHOLDS.weightDailyIncreaseKg;
}

export function isO2Critical(value: number): boolean {
  return value < VITAL_CRITICAL_THRESHOLDS.o2Min;
}

export function isO2Warning(value: number): boolean {
  return value < VITAL_WARNING_THRESHOLDS.o2Min;
}

export function isRespiratoryRateCritical(value: number): boolean {
  return value > VITAL_CRITICAL_THRESHOLDS.respiratoryRateMax;
}

export function isRespiratoryRateWarning(value: number): boolean {
  return value > VITAL_WARNING_THRESHOLDS.respiratoryRateMax;
}

/** @deprecated Use getVitalReadingSeverity */
export function isHeartRateOutOfRange(value: number): boolean {
  return isHeartRateWarning(value);
}

/** @deprecated Use getVitalReadingSeverity */
export function isBloodPressureOutOfRange(systolic: number, diastolic: number): boolean {
  return isBloodPressureWarning(systolic, diastolic);
}

/** @deprecated Use getVitalReadingSeverity */
export function isGlucoseOutOfRange(value: number): boolean {
  return isGlucoseWarning(value);
}

/** @deprecated Use getVitalReadingSeverity */
export function isO2OutOfRange(value: number): boolean {
  return isO2Warning(value);
}

/** @deprecated Use getVitalReadingSeverity */
export function isRespiratoryRateOutOfRange(value: number): boolean {
  return isRespiratoryRateWarning(value);
}

export function parseBloodPressureValue(bp: string): { systolic: number; diastolic: number } | null {
  const parts = bp.split('/');
  if (parts.length !== 2) return null;
  const systolic = Number.parseFloat(parts[0]);
  const diastolic = Number.parseFloat(parts[1]);
  if (Number.isNaN(systolic) || Number.isNaN(diastolic)) return null;
  return { systolic, diastolic };
}

export function getVitalReadingSeverity(type: VitalAlertType, raw?: string): VitalAlertSeverity {
  if (!raw) return 'none';

  const value = Number.parseFloat(raw);
  if (Number.isNaN(value) && type !== 'bp') return 'none';

  switch (type) {
    case 'hr':
      if (isHeartRateCritical(value)) return 'critical';
      if (isHeartRateWarning(value)) return 'warning';
      return 'none';
    case 'bp': {
      const bp = parseBloodPressureValue(raw);
      if (!bp) return 'none';
      return maxSeverity(
        isBloodPressureCritical(bp.systolic, bp.diastolic) ? 'critical' : 'none',
        isBloodPressureWarning(bp.systolic, bp.diastolic) ? 'warning' : 'none'
      );
    }
    case 'glucose':
      if (isGlucoseCritical(value)) return 'critical';
      if (isGlucoseWarning(value)) return 'warning';
      return 'none';
    case 'o2':
      if (isO2Critical(value)) return 'critical';
      if (isO2Warning(value)) return 'warning';
      return 'none';
    case 'weight':
      if (isWeightDailyIncreaseWarning(value)) return 'warning';
      return 'none';
    case 'rr':
      if (isRespiratoryRateCritical(value)) return 'critical';
      if (isRespiratoryRateWarning(value)) return 'warning';
      return 'none';
    default:
      return 'none';
  }
}

/** @deprecated Use getVitalReadingSeverity */
export function isVitalReadingOutOfRange(type: VitalAlertType, raw?: string): boolean {
  return getVitalReadingSeverity(type, raw) !== 'none';
}

export function vitalAlertTitle(type: VitalAlertType, severity: VitalAlertSeverity): string {
  if (severity === 'critical') {
    switch (type) {
      case 'hr':
        return `Critical: heart rate above ${VITAL_CRITICAL_THRESHOLDS.heartRateMax} bpm`;
      case 'bp':
        return `Critical: BP above ${VITAL_CRITICAL_THRESHOLDS.bpSystolicMax}/${VITAL_CRITICAL_THRESHOLDS.bpDiastolicMax} mmHg`;
      case 'glucose':
        return `Critical: blood glucose above ${VITAL_CRITICAL_THRESHOLDS.glucoseMax} mg/dL`;
      case 'o2':
        return `Critical: O₂ saturation below ${VITAL_CRITICAL_THRESHOLDS.o2Min}%`;
      case 'rr':
        return `Critical: respiratory rate above ${VITAL_CRITICAL_THRESHOLDS.respiratoryRateMax}/min`;
      default:
        return 'Critical reading';
    }
  }

  if (severity === 'warning') {
    switch (type) {
      case 'hr':
        return `Heart rate above ${VITAL_WARNING_THRESHOLDS.heartRateMax} bpm`;
      case 'bp':
        return `BP above ${VITAL_WARNING_THRESHOLDS.bpSystolicMax}/${VITAL_WARNING_THRESHOLDS.bpDiastolicMax} mmHg`;
      case 'glucose':
        return `Blood glucose above ${VITAL_WARNING_THRESHOLDS.glucoseMax} mg/dL`;
      case 'o2':
        return `O₂ saturation below ${VITAL_WARNING_THRESHOLDS.o2Min}%`;
      case 'weight':
        return `Weight increased by ${VITAL_WARNING_THRESHOLDS.weightDailyIncreaseKg} kg or more in 1 day`;
      case 'rr':
        return `Respiratory rate above ${VITAL_WARNING_THRESHOLDS.respiratoryRateMax}/min`;
      default:
        return 'Reading outside normal range';
    }
  }

  return '';
}

/** @deprecated Use vitalAlertTitle */
export function vitalOutOfRangeTitle(type: VitalAlertType): string {
  return vitalAlertTitle(type, 'warning');
}
