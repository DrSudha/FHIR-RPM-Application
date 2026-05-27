export const PATIENT_ALLERGIES_EXTENSION_URL =
  'http://example.org/fhir/StructureDefinition/patient-allergies';

export const MAX_PATIENT_ALLERGIES_LENGTH = 40;

export const NO_KNOWN_ALLERGIES_LABEL = 'NKA';

type PatientExtension = {
  url?: string;
  valueString?: string;
};

/** Read free-text allergies from a FHIR Patient extension. */
export function getPatientAllergies(patient: { extension?: PatientExtension[] }): string {
  const entry = patient.extension?.find((ext) => ext.url === PATIENT_ALLERGIES_EXTENSION_URL);
  return entry?.valueString?.trim() ?? '';
}

/** True when the patient has documented allergies (not NKA). */
export function hasRecordedPatientAllergies(patient: { extension?: PatientExtension[] }): boolean {
  return getPatientAllergies(patient).length > 0;
}

/** Banner display: recorded allergies or NKA when none documented. */
export function formatAllergiesBannerDisplay(allergies: string): string {
  const trimmed = allergies.trim();
  return trimmed.length > 0 ? trimmed : NO_KNOWN_ALLERGIES_LABEL;
}

/** Patient list tooltip, e.g. "Allergic to peanuts". */
export function formatAllergiesListTooltip(allergies: string): string {
  const trimmed = allergies.trim();
  if (!trimmed) return '';
  return `Allergic to ${trimmed}`;
}

export function normalizeAllergiesInput(raw: string): string {
  return raw.trim().slice(0, MAX_PATIENT_ALLERGIES_LENGTH);
}

export function buildPatientExtensionsWithAllergies(
  allergies: string,
  existingExtensions?: PatientExtension[]
): PatientExtension[] {
  const normalized = normalizeAllergiesInput(allergies);
  const otherExtensions = (existingExtensions ?? []).filter(
    (ext) => ext.url !== PATIENT_ALLERGIES_EXTENSION_URL
  );

  if (!normalized) {
    return otherExtensions;
  }

  return [
    ...otherExtensions,
    {
      url: PATIENT_ALLERGIES_EXTENSION_URL,
      valueString: normalized,
    },
  ];
}

/** Merge allergies extension into a Patient resource (preserves other extensions). */
export function applyAllergiesToPatient<T extends { extension?: PatientExtension[] }>(
  patient: T,
  allergies: string
): T {
  const extension = buildPatientExtensionsWithAllergies(allergies, patient.extension);

  if (extension.length === 0) {
    const next = { ...patient };
    delete next.extension;
    return next;
  }

  return {
    ...patient,
    extension,
  };
}
