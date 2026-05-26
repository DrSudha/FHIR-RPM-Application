import type { CareCategory, GeneralCareSubCategory } from '@/lib/careCategory';
import { getConditionName } from '@/lib/patientClinicalLists';
import { hasMultipleSclerosisCondition } from '@/lib/msCondition';
import type { DailyWeightIncrease } from '@/lib/patientAnthropometrics';

type VitalPoint = { date: Date; dateStr: string; value: number };
type BpPoint = { date: Date; dateStr: string; systolic: number; diastolic: number };
type StepReading = { date: Date; dateStr: string; steps: number };
type SleepReading = { date: Date; dateStr: string; hours: number };

export type ClinicalWorkspaceSnapshot = {
  patientId: string;
  careCategory: CareCategory;
  generalSubCategory: GeneralCareSubCategory | null;
  primaryCondition: string | null;
  secondaryConditions: string[];
  latestHeartRate: number | null;
  latestSystolic: number | null;
  latestDiastolic: number | null;
  latestO2: number | null;
  latestGlucose: number | null;
  glucoseSpread7d: number | null;
  latestLdl: number | null;
  latestHdl: number | null;
  latestTriglycerides: number | null;
  latestWeightKg: number | null;
  latestWeightIncrease: DailyWeightIncrease | null;
  latestSteps: number | null;
  avgSteps7d: number | null;
  latestSleepHours: number | null;
  avgSleep7d: number | null;
  hasElevatedBp: boolean;
  hasElevatedHr: boolean;
  hasLowO2: boolean;
  hasElevatedLdl: boolean;
  hasLowHdl: boolean;
  hasLowActivity: boolean;
  hasPoorSleep: boolean;
  hasMultipleSclerosis: boolean;
};

function latestVital(points: VitalPoint[] | undefined): number | null {
  if (!points?.length) return null;
  const value = points[points.length - 1]?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function glucoseSpread(points: VitalPoint[], days: number): number | null {
  if (!points.length) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const recent = points.filter((point) => point.date >= cutoff).map((point) => point.value);
  if (recent.length < 2) return null;
  return Math.max(...recent) - Math.min(...recent);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildClinicalWorkspaceSnapshot(input: {
  patientId: string;
  careCategory: CareCategory;
  generalSubCategory: GeneralCareSubCategory | null;
  conditions: any[];
  heartRateData: VitalPoint[];
  bpVitals: BpPoint[];
  glucoseData: VitalPoint[];
  ldlData: VitalPoint[];
  hdlData: VitalPoint[];
  triglycerideData: VitalPoint[];
  o2Data: VitalPoint[];
  weightData: VitalPoint[];
  latestWeightIncrease: DailyWeightIncrease | null;
  dailyStepCounts: StepReading[];
  sleepPattern: SleepReading[];
}): ClinicalWorkspaceSnapshot {
  const conditionNames = input.conditions.map(getConditionName).filter(Boolean);
  const latestBp = input.bpVitals[input.bpVitals.length - 1] ?? null;
  const latestHeartRate = latestVital(input.heartRateData);
  const latestSystolic = latestBp?.systolic ?? null;
  const latestDiastolic = latestBp?.diastolic ?? null;
  const latestO2 = latestVital(input.o2Data);
  const latestGlucose = latestVital(input.glucoseData);
  const latestLdl = latestVital(input.ldlData);
  const latestHdl = latestVital(input.hdlData);
  const latestTriglycerides = latestVital(input.triglycerideData);
  const latestWeightKg = latestVital(input.weightData);
  const latestSteps = input.dailyStepCounts[input.dailyStepCounts.length - 1]?.steps ?? null;
  const avgSteps7d = average(input.dailyStepCounts.map((reading) => reading.steps));
  const latestSleepHours = input.sleepPattern[input.sleepPattern.length - 1]?.hours ?? null;
  const avgSleep7d = average(input.sleepPattern.map((reading) => reading.hours));

  return {
    patientId: input.patientId,
    careCategory: input.careCategory,
    generalSubCategory: input.generalSubCategory,
    primaryCondition: conditionNames[0] ?? null,
    secondaryConditions: conditionNames.slice(1, 4),
    latestHeartRate,
    latestSystolic,
    latestDiastolic,
    latestO2,
    latestGlucose,
    glucoseSpread7d: glucoseSpread(input.glucoseData, 7),
    latestLdl,
    latestHdl,
    latestTriglycerides,
    latestWeightKg,
    latestWeightIncrease: input.latestWeightIncrease,
    latestSteps,
    avgSteps7d,
    latestSleepHours,
    avgSleep7d,
    hasElevatedBp:
      (latestSystolic != null && latestSystolic >= 130) ||
      (latestDiastolic != null && latestDiastolic >= 80),
    hasElevatedHr: latestHeartRate != null && latestHeartRate >= 100,
    hasLowO2: latestO2 != null && latestO2 < 94,
    hasElevatedLdl: latestLdl != null && latestLdl >= 100,
    hasLowHdl: latestHdl != null && latestHdl < 40,
    hasLowActivity: avgSteps7d != null && avgSteps7d < 4000,
    hasPoorSleep: avgSleep7d != null && avgSleep7d < 6,
    hasMultipleSclerosis: hasMultipleSclerosisCondition(input.conditions),
  };
}
