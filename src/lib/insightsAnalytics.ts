import {
  classifyCareCategoryFromResources,
  extractGeneralCareSubCategoryFromResources,
  getGeneralCareSubCategoryLabel,
  resolvePatientCareProfiles,
  type CareCategory,
  type GeneralCareSubCategory,
  type PatientCareProfile,
} from '@/lib/careCategory';
import {
  resolveCardiacVitalsTask,
  resolveMedicationRefillsTask,
  type TaskHighlight,
} from '@/lib/dailyTaskActions';
import {
  findPatientsWithWeightGainWarning,
  resolveMissedGlucoseNotification,
} from '@/lib/notificationActions';
import { fetchAllergySummariesForPatients, hasRecordedPatientAllergies } from '@/lib/patientAllergies';
import { isEgfrAbnormal } from '@/lib/egfr';
import {
  getVitalReadingSeverity,
  type VitalAlertSeverity,
} from '@/lib/vitalRangeAlerts';

export type InsightsPatient = {
  id: string;
  name: string;
  gender: string;
  ageYears: number | null;
  clinicalCategory: CareCategory;
  generalCareSubCategory: GeneralCareSubCategory | null;
  hasAllergies: boolean;
  lastUpdated: string | null;
};

export type PopulationStats = {
  total: number;
  byCareCategory: Record<CareCategory, number>;
  byGeneralSubCategory: Record<string, number>;
  ageBands: { label: string; count: number }[];
  genderCounts: { label: string; count: number }[];
  withAllergies: number;
  withoutAllergies: number;
  registeredLast7Days: number;
};

export type OperationalAlertCounts = {
  elevatedCardiacVitals: number;
  medicationRefillsDue: number;
  missedGlucose: number;
  weightGainWarning: number;
  totalOpenAlerts: number;
};

export type TaskSnapshotItem = {
  id: string;
  label: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
};

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export type PatientRiskProfile = {
  patientId: string;
  patientName: string;
  careCategory: CareCategory;
  score: number;
  tier: RiskTier;
  factors: string[];
};

export type InsightsSnapshot = {
  patients: InsightsPatient[];
  population: PopulationStats;
  alerts: OperationalAlertCounts;
  taskItems: TaskSnapshotItem[];
  alertHighlights: TaskHighlight[];
  riskProfiles: PatientRiskProfile[];
  riskTierCounts: Record<RiskTier, number>;
  generatedAt: string;
};

const AGE_BANDS = [
  { label: '0–17', min: 0, max: 17 },
  { label: '18–34', min: 18, max: 34 },
  { label: '35–49', min: 35, max: 49 },
  { label: '50–64', min: 50, max: 64 },
  { label: '65+', min: 65, max: 200 },
];

async function fetchBundleResources(url: string): Promise<any[]> {
  const response = await fetch(url);
  if (!response.ok) return [];
  const bundle = await response.json();
  if (!bundle.entry) return [];
  return bundle.entry.map((entry: any) => entry.resource).filter(Boolean);
}

export function getPatientDisplayName(patient: any): string {
  const name = patient.name?.[0];
  if (!name) return 'Unknown patient';
  const given = name.given?.join(' ') ?? '';
  const family = name.family ?? '';
  return `${given} ${family}`.trim() || 'Unknown patient';
}

export function calculateAgeYears(birthDateStr?: string): number | null {
  if (!birthDateStr) return null;
  let birthDate: Date;
  if (/^\d{2}-\d{2}-\d{4}$/.test(birthDateStr)) {
    const [day, month, year] = birthDateStr.split('-').map(Number);
    birthDate = new Date(year, month - 1, day);
  } else {
    birthDate = new Date(birthDateStr);
  }
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

function normalizeGender(patient: any): string {
  const raw = (patient.gender || 'unknown').toLowerCase();
  if (raw === 'male' || raw === 'female') {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return 'Other / unknown';
}

function isWithinDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= days * 24 * 60 * 60 * 1000;
}

export function buildPopulationStats(
  patients: InsightsPatient[],
  profiles: Record<string, PatientCareProfile>
): PopulationStats {
  const byCareCategory: Record<CareCategory, number> = {
    diabetic: 0,
    cardiac: 0,
    other: 0,
  };
  const byGeneralSubCategory: Record<string, number> = {};
  const ageBandCounts = AGE_BANDS.map((band) => ({ label: band.label, count: 0 }));
  const genderMap = new Map<string, number>();
  let withAllergies = 0;
  let registeredLast7Days = 0;

  for (const patient of patients) {
    byCareCategory[patient.clinicalCategory] += 1;

    const subCategory = profiles[patient.id]?.generalCareSubCategory;
    if (subCategory) {
      const label = getGeneralCareSubCategoryLabel(subCategory);
      byGeneralSubCategory[label] = (byGeneralSubCategory[label] ?? 0) + 1;
    }

    if (patient.ageYears != null) {
      const band = AGE_BANDS.find(
        (entry) => patient.ageYears! >= entry.min && patient.ageYears! <= entry.max
      );
      if (band) {
        const index = AGE_BANDS.indexOf(band);
        ageBandCounts[index].count += 1;
      }
    }

    genderMap.set(patient.gender, (genderMap.get(patient.gender) ?? 0) + 1);

    if (patient.hasAllergies) withAllergies += 1;
    if (isWithinDays(patient.lastUpdated, 7)) registeredLast7Days += 1;
  }

  return {
    total: patients.length,
    byCareCategory,
    byGeneralSubCategory,
    ageBands: ageBandCounts,
    genderCounts: [...genderMap.entries()].map(([label, count]) => ({ label, count })),
    withAllergies,
    withoutAllergies: patients.length - withAllergies,
    registeredLast7Days,
  };
}

function riskTierFromScore(score: number, hasCritical: boolean): RiskTier {
  if (hasCritical || score >= 60) return 'critical';
  if (score >= 35) return 'high';
  if (score >= 15) return 'medium';
  return 'low';
}

async function fetchLatestEgfrAbnormal(patientId: string): Promise<boolean> {
  const observations = await fetchBundleResources(
    `/api/fhir/Observation?subject=Patient/${patientId}&code=33914-3&_sort=-date&_count=1`
  );
  const latest = observations[0];
  const value = latest?.valueQuantity?.value;
  return typeof value === 'number' && isEgfrAbnormal(value);
}

async function fetchLatestVitalSeverities(
  patientId: string,
  category: CareCategory
): Promise<{ severity: VitalAlertSeverity; factor: string }[]> {
  const codes =
    category === 'diabetic'
      ? '8867-4,55284-4,15074-8,2339-0,2345-7,2708-6,9279-1'
      : '8867-4,55284-4,2708-6,9279-1';

  const observations = await fetchBundleResources(
    `/api/fhir/Observation?subject=Patient/${patientId}&code=${codes}&_sort=-date&_count=20`
  );

  const seen = new Set<VitalAlertSeverity>();
  const results: { severity: VitalAlertSeverity; factor: string }[] = [];

  for (const observation of observations) {
    const codesList = observation.code?.coding?.map((coding: any) => coding.code) || [];
    const label = (observation.code?.text || '').toLowerCase();

    if (codesList.includes('8867-4') && observation.valueQuantity?.value != null) {
      const raw = String(Math.round(observation.valueQuantity.value));
      const severity = getVitalReadingSeverity('hr', raw);
      if (severity !== 'none' && !seen.has(severity)) {
        seen.add(severity);
        results.push({ severity, factor: `Heart rate ${severity}` });
      }
    }

    if (codesList.includes('55284-4') || label.includes('blood pressure')) {
      let systolic: number | null = null;
      let diastolic: number | null = null;
      observation.component?.forEach((component: any) => {
        const componentCodes = component.code?.coding?.map((coding: any) => coding.code) || [];
        if (componentCodes.includes('8480-6')) systolic = component.valueQuantity?.value ?? null;
        if (componentCodes.includes('8462-4')) diastolic = component.valueQuantity?.value ?? null;
      });
      if (systolic != null) {
        const raw = `${Math.round(systolic)}/${Math.round(diastolic ?? 0)}`;
        const severity = getVitalReadingSeverity('bp', raw);
        if (severity !== 'none' && !seen.has(severity)) {
          seen.add(severity);
          results.push({ severity, factor: `Blood pressure ${severity}` });
        }
      }
    }

    if (
      codesList.some((code: string) => ['15074-8', '2339-0', '2345-7'].includes(code)) ||
      label.includes('glucose')
    ) {
      const value = observation.valueQuantity?.value;
      if (value != null) {
        const severity = getVitalReadingSeverity('glucose', String(Math.round(value)));
        if (severity !== 'none' && !seen.has(severity)) {
          seen.add(severity);
          results.push({ severity, factor: `Glucose ${severity}` });
        }
      }
    }
  }

  return results;
}

function scoreFromSeverity(severity: VitalAlertSeverity): number {
  if (severity === 'critical') return 40;
  if (severity === 'warning') return 20;
  return 0;
}

export async function buildRiskProfiles(
  patients: InsightsPatient[],
  highlightByPatient: Map<string, string[]>
): Promise<PatientRiskProfile[]> {
  const profiles = await Promise.all(
    patients.map(async (patient) => {
      const factors = [...(highlightByPatient.get(patient.id) ?? [])];
      let score = 0;
      let hasCritical = false;

      const vitalFlags = await fetchLatestVitalSeverities(patient.id, patient.clinicalCategory);
      for (const flag of vitalFlags) {
        score += scoreFromSeverity(flag.severity);
        if (flag.severity === 'critical') hasCritical = true;
        if (!factors.includes(flag.factor)) factors.push(flag.factor);
      }

      if (patient.ageYears != null && patient.ageYears >= 65) {
        score += 8;
        factors.push('Age 65+');
      }

      if (patient.generalCareSubCategory === 'ckd') {
        const abnormalEgfr = await fetchLatestEgfrAbnormal(patient.id);
        if (abnormalEgfr) {
          score += 18;
          factors.push('Abnormal eGFR (CKD)');
        }
      }

      if (patient.hasAllergies) {
        score += 5;
        factors.push('Documented allergy');
      }

      return {
        patientId: patient.id,
        patientName: patient.name,
        careCategory: patient.clinicalCategory,
        score: Math.min(score, 100),
        tier: riskTierFromScore(score, hasCritical),
        factors,
      };
    })
  );

  return profiles.sort((a, b) => b.score - a.score);
}

export async function loadInsightsSnapshot(): Promise<InsightsSnapshot> {
  const response = await fetch('/api/fhir/Patient?_count=100&_revinclude=Condition:patient&_sort=-_lastUpdated');
  if (!response.ok) {
    throw new Error(`Failed to load patients (${response.status})`);
  }

  const bundle = await response.json();
  const rawPatients =
    bundle.entry
      ?.filter((entry: any) => entry.resource?.resourceType === 'Patient')
      .map((entry: any) => entry.resource) ?? [];

  const conditionsByPatient = new Map<string, any[]>();
  bundle.entry?.forEach((entry: any) => {
    if (entry.resource?.resourceType !== 'Condition') return;
    const patientRef = entry.resource.subject?.reference?.replace(/^Patient\//, '');
    if (!patientRef) return;
    const list = conditionsByPatient.get(patientRef) ?? [];
    list.push(entry.resource);
    conditionsByPatient.set(patientRef, list);
  });

  const patientIds = rawPatients.map((patient: any) => patient.id).filter(Boolean);
  const [careProfiles, allergySummaries] = await Promise.all([
    resolvePatientCareProfiles(patientIds),
    fetchAllergySummariesForPatients(rawPatients),
  ]);

  const patients: InsightsPatient[] = rawPatients.map((patient: any) => {
    const conditions = conditionsByPatient.get(patient.id) ?? [];
    const profile = careProfiles[patient.id];
    const allergySummary = allergySummaries[patient.id] ?? '';

    return {
      id: patient.id,
      name: getPatientDisplayName(patient),
      gender: normalizeGender(patient),
      ageYears: calculateAgeYears(patient.birthDate),
      clinicalCategory: profile?.category ?? classifyCareCategoryFromResources(conditions),
      generalCareSubCategory:
        profile?.generalCareSubCategory ??
        extractGeneralCareSubCategoryFromResources(conditions),
      hasAllergies: hasRecordedPatientAllergies(allergySummary),
      lastUpdated: patient.meta?.lastUpdated ?? null,
    };
  });

  const cohort = patients.map((patient) => ({
    id: patient.id,
    clinicalCategory: patient.clinicalCategory,
  }));

  const diabeticPatients = cohort.filter((patient) => patient.clinicalCategory === 'diabetic');
  const cardiacPatients = cohort.filter((patient) => patient.clinicalCategory === 'cardiac');

  const [cardiacTask, refillTask, missedGlucose, weightGain] = await Promise.all([
    resolveCardiacVitalsTask(cardiacPatients),
    resolveMedicationRefillsTask(cohort),
    resolveMissedGlucoseNotification(diabeticPatients),
    findPatientsWithWeightGainWarning(cohort),
  ]);

  const alertHighlights = [
    ...cardiacTask.highlights,
    ...refillTask.highlights,
    ...missedGlucose.highlights,
    ...weightGain,
  ];

  const highlightByPatient = new Map<string, string[]>();
  for (const highlight of alertHighlights) {
    const list = highlightByPatient.get(highlight.patientId) ?? [];
    list.push(highlight.reason);
    highlightByPatient.set(highlight.patientId, list);
  }

  const alerts: OperationalAlertCounts = {
    elevatedCardiacVitals: cardiacTask.highlights.length,
    medicationRefillsDue: refillTask.highlights.length,
    missedGlucose: missedGlucose.highlights.length,
    weightGainWarning: weightGain.length,
    totalOpenAlerts: alertHighlights.length,
  };

  const taskItems: TaskSnapshotItem[] = [
    {
      id: 'cardiac-vitals',
      label: 'Elevated cardiac vitals',
      count: alerts.elevatedCardiacVitals,
      severity: 'high',
    },
    {
      id: 'med-refills',
      label: 'Medication refills due',
      count: alerts.medicationRefillsDue,
      severity: 'medium',
    },
    {
      id: 'missed-glucose',
      label: 'Missed glucose monitoring',
      count: alerts.missedGlucose,
      severity: 'medium',
    },
    {
      id: 'weight-gain',
      label: 'Rapid weight gain',
      count: alerts.weightGainWarning,
      severity: 'high',
    },
  ];

  const riskProfiles = await buildRiskProfiles(patients, highlightByPatient);
  const riskTierCounts: Record<RiskTier, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  riskProfiles.forEach((profile) => {
    riskTierCounts[profile.tier] += 1;
  });

  return {
    patients,
    population: buildPopulationStats(patients, careProfiles),
    alerts,
    taskItems,
    alertHighlights,
    riskProfiles,
    riskTierCounts,
    generatedAt: new Date().toISOString(),
  };
}
