import type { GeneralCareSubCategory } from '@/lib/careCategory';

export function getPatientLastActivityTime(patient: {
  meta?: { lastUpdated?: string; lastModified?: string };
}): number {
  const raw = patient.meta?.lastUpdated || patient.meta?.lastModified;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortPatientsByRecentActivity<T extends { meta?: { lastUpdated?: string } }>(
  patients: T[]
): T[] {
  return [...patients].sort(
    (a, b) => getPatientLastActivityTime(b) - getPatientLastActivityTime(a)
  );
}

export type GeneralCareSubcategoryGroup = {
  subCategory: GeneralCareSubCategory | null;
  label: string;
  patients: any[];
};

export function groupGeneralCarePatientsBySubcategory(
  patients: any[],
  labelForSubCategory: (subCategory: GeneralCareSubCategory) => string
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
      const sorted = sortPatientsByRecentActivity(bucketPatients);
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
    const aLatest = getPatientLastActivityTime(a.patients[0] ?? {});
    const bLatest = getPatientLastActivityTime(b.patients[0] ?? {});
    return bLatest - aLatest;
  });
}
