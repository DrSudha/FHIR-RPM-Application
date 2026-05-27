/** Shared FHIR terminology system URIs. */
export const SNOMED_SYSTEM = 'http://snomed.info/sct';
export const RXNORM_SYSTEM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
export const HL7_CONDITION_CLINICAL = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
export const HL7_CONDITION_VERIFICATION = 'http://terminology.hl7.org/CodeSystem/condition-ver-status';
export const HL7_CONDITION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/condition-category';
export const HL7_ALLERGY_CLINICAL = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical';
export const HL7_ALLERGY_VERIFICATION =
  'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification';

export type FhirCoding = {
  system: string;
  code: string;
  display: string;
};

export function buildCodeableConcept(text: string, coding?: FhirCoding[]) {
  return {
    text,
    ...(coding && coding.length > 0 ? { coding } : {}),
  };
}

export function findCoding(
  codings: Array<{ system?: string; code?: string; display?: string }> | undefined,
  system: string
) {
  return codings?.find((entry) => entry.system === system);
}
