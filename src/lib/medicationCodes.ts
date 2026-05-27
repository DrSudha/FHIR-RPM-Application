import catalogData from '@/data/medication-catalog.json';
import { buildCodeableConcept, findCoding, RXNORM_SYSTEM } from '@/lib/fhirTerminology';
import { lookupMedicationProfile, type MedicationCatalogEntry } from '@/lib/medicationCatalog';

export function getMedicationRxNormCoding(medication: {
  medicationCodeableConcept?: {
    coding?: Array<{ system?: string; code?: string; display?: string }>;
    text?: string;
  };
}) {
  const coding = findCoding(medication.medicationCodeableConcept?.coding, RXNORM_SYSTEM);
  if (!coding?.code) return null;
  return coding;
}

export function buildMedicationCodeableConcept(
  displayName: string,
  rxnormCode?: string
): { text: string; coding?: Array<{ system: string; code: string; display: string }> } {
  const profile = lookupMedicationProfile(displayName);
  const code = rxnormCode ?? profile?.rxnormCode;
  const display = profile?.displayName ?? displayName;

  if (!code) {
    return { text: display };
  }

  return buildCodeableConcept(display, [
    {
      system: RXNORM_SYSTEM,
      code,
      display,
    },
  ]);
}

export function buildMedicationCodeableConceptFromProfile(entry: MedicationCatalogEntry) {
  return buildMedicationCodeableConcept(entry.displayName, entry.rxnormCode);
}

export function enrichMedicationCodeableConcept(existing: {
  text?: string;
  coding?: Array<{ system?: string; code?: string; display?: string }>;
}) {
  const rawName = existing.text || existing.coding?.[0]?.display || '';
  const profile = lookupMedicationProfile(rawName);
  if (!profile?.rxnormCode) {
    return existing.text ? { text: existing.text, ...(existing.coding ? { coding: existing.coding } : {}) } : { text: rawName };
  }

  const hasRxNorm = existing.coding?.some((entry) => entry.system === RXNORM_SYSTEM);
  if (hasRxNorm) {
    return {
      text: profile.displayName,
      coding: existing.coding,
    };
  }

  return buildMedicationCodeableConcept(profile.displayName, profile.rxnormCode);
}
