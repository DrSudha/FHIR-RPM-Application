/** Shared terminology helpers for Node seed/backfill scripts. */

export const SNOMED_SYSTEM = 'http://snomed.info/sct';
export const RXNORM_SYSTEM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

export const COMMON_DIAGNOSIS_SNOMED = {
  type2Diabetes: { code: '44054006', display: 'Diabetes mellitus type 2' },
  diabeticNeuropathy: { code: '230572002', display: 'Diabetic neuropathy' },
  multipleSclerosis: { code: '24700007', display: 'Multiple sclerosis' },
  atrialFibrillation: { code: '49436004', display: 'Atrial fibrillation' },
  diabeticRetinopathy: { code: '4855003', display: 'Diabetic retinopathy' },
  chronicKidneyDisease: { code: '709044004', display: 'Chronic kidney disease' },
};

export function buildSnomedConditionCode(text, snomed) {
  return {
    text,
    coding: [{ system: SNOMED_SYSTEM, code: snomed.code, display: snomed.display }],
  };
}

export function buildProblemListCondition(patientId, text, snomed, options = {}) {
  return {
    resourceType: 'Condition',
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
    code: buildSnomedConditionCode(text, snomed),
    subject: { reference: `Patient/${patientId}` },
    ...(options.onsetDateTime ? { onsetDateTime: options.onsetDateTime } : {}),
    recordedDate: options.recordedDate ?? new Date().toISOString(),
  };
}

export function buildRxNormMedicationConcept(displayName, rxnormCode) {
  if (!rxnormCode) {
    return { text: displayName };
  }

  return {
    text: displayName,
    coding: [{ system: RXNORM_SYSTEM, code: rxnormCode, display: displayName }],
  };
}

export function buildAllergyIntolerance(patientId, display, snomedCode, category = 'medication') {
  const code = snomedCode
    ? {
        text: display,
        coding: [{ system: SNOMED_SYSTEM, code: snomedCode, display }],
      }
    : { text: display };

  return {
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
          code: 'confirmed',
          display: 'Confirmed',
        },
      ],
    },
    type: 'allergy',
    category: [category],
    code,
    patient: { reference: `Patient/${patientId}` },
    recordedDate: new Date().toISOString(),
  };
}
