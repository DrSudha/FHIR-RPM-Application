import type { GeneralCareSubCategory } from '@/lib/careCategory';

export type PatientListTouchTimes = Record<string, number>;

export function getPatientLastActivityTime(
  patient: {
    id?: string;
    meta?: { lastUpdated?: string; lastModified?: string };
  },
  touchTimes: PatientListTouchTimes = {}
): number {
  const serverRaw = patient.meta?.lastUpdated || patient.meta?.lastModified;
  let serverTime = 0;
  if (serverRaw) {
    const parsed = new Date(serverRaw).getTime();
    serverTime = Number.isNaN(parsed) ? 0 : parsed;
  }

  const localTouch = patient.id ? touchTimes[patient.id] ?? 0 : 0;
  return Math.max(serverTime, localTouch);
}

export function sortPatientsByRecentActivity<T extends { id?: string; meta?: { lastUpdated?: string } }>(
  patients: T[],
  touchTimes: PatientListTouchTimes = {}
): T[] {
  return [...patients].sort(
    (a, b) => getPatientLastActivityTime(b, touchTimes) - getPatientLastActivityTime(a, touchTimes)
  );
}

export type GeneralCareSubcategoryGroup = {
  subCategory: GeneralCareSubCategory | null;
  label: string;
  patients: any[];
};

export function groupGeneralCarePatientsBySubcategory(
  patients: any[],
  labelForSubCategory: (subCategory: GeneralCareSubCategory) => string,
  touchTimes: PatientListTouchTimes = {}
): GeneralCareSubcategoryGroup[] {
  const buckets = new Map<string, any[]>();

  patients.forEach((patient) => {
    const key = patient.generalCareSubCategory ?? '__none__';
    const existing = buckets.get(key) ?? [];
    existing.push(patient);
    buckets.set(key, existing);
  });

  const groups: GeneralCareSubcategoryGroup[] = Array.from(buckets.entries()).map(
    ([key, bucketPatients]) => {
      const sorted = sortPatientsByRecentActivity(bucketPatients, touchTimes);
      if (key === '__none__') {
        return {
          subCategory: null,
          label: 'General care',
          patients: sorted,
        };
      }

      const subCategory = key as GeneralCareSubCategory;
      return {
        subCategory,
        label: labelForSubCategory(subCategory),
        patients: sorted,
      };
    }
  );

  return groups.sort((a, b) => {
    const aLatest = getPatientLastActivityTime(a.patients[0] ?? {}, touchTimes);
    const bLatest = getPatientLastActivityTime(b.patients[0] ?? {}, touchTimes);
    return bLatest - aLatest;
  });
}

export function recordPatientListTouch(
  touchTimes: PatientListTouchTimes,
  patientId: string
): PatientListTouchTimes {
  return {
    ...touchTimes,
    [patientId]: Date.now(),
  };
}
