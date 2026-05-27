import {
  buildSnomedConditionCode,
  generalCareSubCategoryFromSnomedCode,
  GENERAL_CARE_SUBCATEGORY_SNOMED,
} from '@/lib/snomedCodes';

export type CareCategory = 'diabetic' | 'cardiac' | 'other';

export type GeneralCareSubCategory =
  | 'ckd'
  | 'obesity'
  | 'muscle-weakness'
  | 'mobility-assistance';

export const CARE_CATEGORY_OPTIONS: { value: CareCategory; label: string }[] = [
  { value: 'diabetic', label: 'Diabetic Care' },
  { value: 'cardiac', label: 'Cardiovascular Care' },
  { value: 'other', label: 'General Care' },
];

export const GENERAL_CARE_SUBCATEGORY_OPTIONS: {
  value: GeneralCareSubCategory;
  label: string;
}[] = [
  { value: 'ckd', label: 'CKD' },
  { value: 'obesity', label: 'Obesity' },
  { value: 'muscle-weakness', label: 'Muscle weakness' },
  { value: 'mobility-assistance', label: 'Mobility assistance' },
];

const CARE_ENROLMENT_TEXT: Record<CareCategory, string> = {
  diabetic: 'diabetic care enrolment',
  cardiac: 'cardiovascular care enrolment',
  other: 'general care enrolment',
};

const GENERAL_CARE_SUBCATEGORY_PREFIX = 'general care subcategory: ';

function buildEnrolmentConditionBase(patientId: string) {
  return {
    resourceType: 'Condition' as const,
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: 'confirmed',
          display: 'Confirmed',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'problem-list-item',
            display: 'Problem List Item',
          },
        ],
      },
    ],
    subject: { reference: `Patient/${patientId}` },
    recordedDate: new Date().toISOString(),
  };
}

export function buildCareCategoryCondition(patientId: string, category: CareCategory) {
  return {
    ...buildEnrolmentConditionBase(patientId),
    code: {
      text: CARE_ENROLMENT_TEXT[category],
    },
  };
}

export function getGeneralCareSubCategoryLabel(subCategory: GeneralCareSubCategory): string {
  return (
    GENERAL_CARE_SUBCATEGORY_OPTIONS.find((option) => option.value === subCategory)?.label ??
    subCategory
  );
}

export function buildGeneralCareSubCategoryCondition(
  patientId: string,
  subCategory: GeneralCareSubCategory
) {
  const snomed = GENERAL_CARE_SUBCATEGORY_SNOMED[subCategory];
  return {
    ...buildEnrolmentConditionBase(patientId),
    code: buildSnomedConditionCode(snomed.display, snomed),
  };
}

function generalCareSubCategoryFromCondition(condition: any): GeneralCareSubCategory | null {
  const snomedCode = condition.code?.coding?.find(
    (coding: any) => coding.system === 'http://snomed.info/sct' && coding.code
  )?.code;
  if (snomedCode) {
    const fromSnomed = generalCareSubCategoryFromSnomedCode(snomedCode);
    if (fromSnomed) return fromSnomed;
  }

  const text = condition.code?.text || condition.code?.coding?.[0]?.display || '';
  return generalCareSubCategoryFromText(text);
}

function generalCareSubCategoryFromText(text: string): GeneralCareSubCategory | null {
  const normalized = text.toLowerCase().trim();

  if (normalized.startsWith(GENERAL_CARE_SUBCATEGORY_PREFIX)) {
    const slug = normalized.slice(GENERAL_CARE_SUBCATEGORY_PREFIX.length).trim();
    return GENERAL_CARE_SUBCATEGORY_OPTIONS.some((option) => option.value === slug)
      ? (slug as GeneralCareSubCategory)
      : null;
  }

  const byLabel = GENERAL_CARE_SUBCATEGORY_OPTIONS.find(
    (option) => option.label.toLowerCase() === normalized
  );
  if (byLabel) return byLabel.value;

  const bySnomedDisplay = Object.entries(GENERAL_CARE_SUBCATEGORY_SNOMED).find(
    ([, concept]) => concept.display.toLowerCase() === normalized
  );
  return bySnomedDisplay ? (bySnomedDisplay[0] as GeneralCareSubCategory) : null;
}

export function isGeneralCareSubCategoryConditionText(text: string): boolean {
  return generalCareSubCategoryFromText(text) !== null;
}

export function extractGeneralCareSubCategoryFromResources(
  conditions: any[]
): GeneralCareSubCategory | null {
  const subCategories = conditions
    .map((cond) => {
      const subCategory = generalCareSubCategoryFromCondition(cond);
      if (!subCategory) return null;
      return { subCategory, time: conditionTimestamp(cond) };
    })
    .filter(
      (entry): entry is { subCategory: GeneralCareSubCategory; time: number } => entry !== null
    );

  if (subCategories.length === 0) return null;

  subCategories.sort((a, b) => b.time - a.time);
  return subCategories[0].subCategory;
}

function enrolmentCategoryFromText(text: string): CareCategory | null {
  const normalized = text.toLowerCase();
  if (normalized === CARE_ENROLMENT_TEXT.diabetic) return 'diabetic';
  if (normalized === CARE_ENROLMENT_TEXT.cardiac) return 'cardiac';
  if (normalized === CARE_ENROLMENT_TEXT.other) return 'other';
  return null;
}

function conditionTimestamp(cond: any): number {
  const dateStr =
    cond.recordedDate || cond.onsetDateTime || cond.meta?.lastUpdated || '';
  const time = new Date(dateStr).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Care category comes only from explicit enrolment conditions saved via Register/Edit Patient.
 * The most recently recorded enrolment wins. No hash, keyword, or clinical inference.
 */
export function classifyCareCategoryFromResources(conditions: any[]): CareCategory {
  const enrolments = conditions
    .map((cond) => {
      const text = cond.code?.text || cond.code?.coding?.[0]?.display || '';
      const category = enrolmentCategoryFromText(text);
      if (!category) return null;
      return { category, time: conditionTimestamp(cond) };
    })
    .filter((entry): entry is { category: CareCategory; time: number } => entry !== null);

  if (enrolments.length === 0) return 'other';

  enrolments.sort((a, b) => b.time - a.time);
  return enrolments[0].category;
}

export async function fetchConditionsForPatient(patientId: string): Promise<any[]> {
  const response = await fetch(`/api/fhir/Condition?patient=${patientId}`);
  if (!response.ok) return [];

  const bundle = await response.json();
  return (
    bundle.entry
      ?.filter((e: any) => e.resource?.resourceType === 'Condition')
      .map((e: any) => e.resource) ?? []
  );
}

export type PatientCareProfile = {
  category: CareCategory;
  generalCareSubCategory: GeneralCareSubCategory | null;
};

/** Resolve list category per patient from saved enrolment conditions only. */
export async function resolvePatientCareProfiles(
  patientIds: string[]
): Promise<Record<string, PatientCareProfile>> {
  const profiles: Record<string, PatientCareProfile> = {};

  await Promise.all(
    patientIds.map(async (patientId) => {
      const conditions = await fetchConditionsForPatient(patientId);
      profiles[patientId] = {
        category: classifyCareCategoryFromResources(conditions),
        generalCareSubCategory: extractGeneralCareSubCategoryFromResources(conditions),
      };
    })
  );

  return profiles;
}

/** @deprecated Use resolvePatientCareProfiles for sub category support. */
export async function resolvePatientCareCategories(
  patientIds: string[]
): Promise<Record<string, CareCategory>> {
  const profiles = await resolvePatientCareProfiles(patientIds);
  return Object.fromEntries(
    Object.entries(profiles).map(([patientId, profile]) => [patientId, profile.category])
  );
}
