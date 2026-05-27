import type { GeneralCareSubCategory } from '@/lib/careCategory';
import {
  buildCodeableConcept,
  findCoding,
  HL7_CONDITION_CATEGORY,
  HL7_CONDITION_CLINICAL,
  HL7_CONDITION_VERIFICATION,
  SNOMED_SYSTEM,
  type FhirCoding,
} from '@/lib/fhirTerminology';

export type SnomedConcept = {
  code: string;
  display: string;
};

/** SNOMED CT codes for general care subcategory Conditions. */
export const GENERAL_CARE_SUBCATEGORY_SNOMED: Record<GeneralCareSubCategory, SnomedConcept> = {
  ckd: { code: '709044004', display: 'Chronic kidney disease' },
  obesity: { code: '414916003', display: 'Obesity' },
  'muscle-weakness': { code: '26544005', display: 'Muscle weakness' },
  'mobility-assistance': { code: '282036001', display: 'Need for walking aid' },
};

/** Common clinical diagnoses used in seed data and display logic. */
export const COMMON_DIAGNOSIS_SNOMED = {
  type2Diabetes: { code: '44054006', display: 'Diabetes mellitus type 2' },
  diabeticNeuropathy: { code: '230572002', display: 'Diabetic neuropathy' },
  multipleSclerosis: { code: '24700007', display: 'Multiple sclerosis' },
  atrialFibrillation: { code: '49436004', display: 'Atrial fibrillation' },
  diabeticRetinopathy: { code: '4855003', display: 'Diabetic retinopathy' },
} as const;

const SNOMED_CODE_TO_GENERAL_CARE_SUBCATEGORY = Object.fromEntries(
  Object.entries(GENERAL_CARE_SUBCATEGORY_SNOMED).map(([slug, concept]) => [concept.code, slug])
) as Record<string, GeneralCareSubCategory>;

export function snomedCoding(concept: SnomedConcept): FhirCoding {
  return {
    system: SNOMED_SYSTEM,
    code: concept.code,
    display: concept.display,
  };
}

export function buildSnomedConditionCode(text: string, concept: SnomedConcept) {
  return buildCodeableConcept(text, [snomedCoding(concept)]);
}

export function generalCareSubCategoryFromSnomedCode(code: string): GeneralCareSubCategory | null {
  return SNOMED_CODE_TO_GENERAL_CARE_SUBCATEGORY[code] ?? null;
}

export function getConditionSnomedCoding(condition: {
  code?: { coding?: Array<{ system?: string; code?: string; display?: string }> };
}): FhirCoding | null {
  const coding = findCoding(condition.code?.coding, SNOMED_SYSTEM);
  if (!coding?.code || !coding.display) return null;
  return {
    system: SNOMED_SYSTEM,
    code: coding.code,
    display: coding.display,
  };
}

export function buildProblemListCondition(
  patientId: string,
  text: string,
  snomed: SnomedConcept,
  options?: { onsetDateTime?: string; recordedDate?: string }
) {
  return {
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [{ system: HL7_CONDITION_CLINICAL, code: 'active', display: 'Active' }],
    },
    verificationStatus: {
      coding: [{ system: HL7_CONDITION_VERIFICATION, code: 'confirmed', display: 'Confirmed' }],
    },
    category: [
      {
        coding: [
          { system: HL7_CONDITION_CATEGORY, code: 'problem-list-item', display: 'Problem List Item' },
        ],
      },
    ],
    code: buildSnomedConditionCode(text, snomed),
    subject: { reference: `Patient/${patientId}` },
    ...(options?.onsetDateTime ? { onsetDateTime: options.onsetDateTime } : {}),
    recordedDate: options?.recordedDate ?? new Date().toISOString(),
  };
}
