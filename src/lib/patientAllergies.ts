import {
  buildCodeableConcept,
  findCoding,
  HL7_ALLERGY_CLINICAL,
  HL7_ALLERGY_VERIFICATION,
  SNOMED_SYSTEM,
} from '@/lib/fhirTerminology';
import { lookupAllergenConcept, type AllergenCatalogEntry } from '@/lib/allergenCatalog';

/** @deprecated Legacy Patient extension — read fallback only. */
export const PATIENT_ALLERGIES_EXTENSION_URL =
  'http://example.org/fhir/StructureDefinition/patient-allergies';

export const MAX_PATIENT_ALLERGIES_LENGTH = 40;
export const NO_KNOWN_ALLERGIES_LABEL = 'NKA';

type PatientExtension = {
  url?: string;
  valueString?: string;
};

type FhirClient = {
  get: (path: string) => Promise<any>;
  post: (path: string, body: unknown) => Promise<any>;
  put: (path: string, body: unknown) => Promise<any>;
  delete: (path: string) => Promise<void>;
};

function defaultFhirClient(): FhirClient {
  return {
    async get(path) {
      const response = await fetch(`/api/fhir/${path}`);
      if (!response.ok) {
        throw new Error(`GET ${path} failed (${response.status})`);
      }
      return response.json();
    },
    async post(path, body) {
      const response = await fetch(`/api/fhir/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`POST ${path} failed (${response.status})`);
      }
      return response.json();
    },
    async put(path, body) {
      const response = await fetch(`/api/fhir/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`PUT ${path} failed (${response.status})`);
      }
      return response.json();
    },
    async delete(path) {
      const response = await fetch(`/api/fhir/${path}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        throw new Error(`DELETE ${path} failed (${response.status})`);
      }
    },
  };
}

function bundleResources(bundle: any, resourceType: string) {
  return (
    bundle.entry
      ?.map((entry: any) => entry.resource)
      .filter((resource: any) => resource?.resourceType === resourceType) ?? []
  );
}

function isActiveAllergyIntolerance(resource: any): boolean {
  const status =
    resource.clinicalStatus?.coding?.[0]?.code ||
    resource.clinicalStatus?.text ||
    '';
  return String(status).toLowerCase() === 'active';
}

function getAllergyIntoleranceLabel(resource: any): string {
  const snomed = findCoding(resource.code?.coding, SNOMED_SYSTEM);
  return (
    snomed?.display?.trim() ||
    resource.code?.text?.trim() ||
    resource.code?.coding?.[0]?.display?.trim() ||
    ''
  );
}

export function parseAllergyTokens(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((token) => normalizeAllergiesInput(token))
    .filter(Boolean);
}

/** Legacy Patient extension read (fallback). */
export function getPatientAllergiesFromExtension(patient: {
  extension?: PatientExtension[];
}): string {
  const entry = patient.extension?.find((ext) => ext.url === PATIENT_ALLERGIES_EXTENSION_URL);
  return entry?.valueString?.trim() ?? '';
}

export function summarizeAllergyIntolerances(resources: any[]): string {
  return resources
    .filter(isActiveAllergyIntolerance)
    .map(getAllergyIntoleranceLabel)
    .filter(Boolean)
    .join(', ');
}

export async function fetchPatientAllergyIntolerances(
  patientId: string,
  client: FhirClient = defaultFhirClient()
): Promise<any[]> {
  const bundle = await client.get(`AllergyIntolerance?patient=${patientId}&_count=50`);
  return bundleResources(bundle, 'AllergyIntolerance').filter(isActiveAllergyIntolerance);
}

export async function fetchPatientAllergySummary(
  patientId: string,
  legacyPatient?: { extension?: PatientExtension[] },
  client: FhirClient = defaultFhirClient()
): Promise<string> {
  try {
    const resources = await fetchPatientAllergyIntolerances(patientId, client);
    const summary = summarizeAllergyIntolerances(resources);
    if (summary) return summary;
  } catch {
    // Fall through to legacy extension.
  }

  return legacyPatient ? getPatientAllergiesFromExtension(legacyPatient) : '';
}

export async function fetchAllergySummariesForPatients(
  patients: Array<{ id?: string; extension?: PatientExtension[] }>,
  client: FhirClient = defaultFhirClient()
): Promise<Record<string, string>> {
  const summaries: Record<string, string> = {};

  try {
    const bundle = await client.get('AllergyIntolerance?clinical-status=active&_count=500');
    const resources = bundleResources(bundle, 'AllergyIntolerance').filter(isActiveAllergyIntolerance);

    for (const resource of resources) {
      const reference = resource.patient?.reference || '';
      const patientId = reference.startsWith('Patient/') ? reference.slice('Patient/'.length) : '';
      if (!patientId) continue;

      const label = getAllergyIntoleranceLabel(resource);
      if (!label) continue;

      summaries[patientId] = summaries[patientId]
        ? `${summaries[patientId]}, ${label}`
        : label;
    }
  } catch {
    // Ignore bulk fetch failure; per-patient extension fallback below.
  }

  for (const patient of patients) {
    if (!patient.id || summaries[patient.id]) continue;
    const legacy = getPatientAllergiesFromExtension(patient);
    if (legacy) summaries[patient.id] = legacy;
  }

  return summaries;
}

/** @deprecated Use fetchPatientAllergySummary — kept for compatibility. */
export function getPatientAllergies(patient: { extension?: PatientExtension[] }): string {
  return getPatientAllergiesFromExtension(patient);
}

export function hasRecordedPatientAllergies(allergySummary: string): boolean {
  return allergySummary.trim().length > 0;
}

export function formatAllergiesBannerDisplay(allergies: string): string {
  const trimmed = allergies.trim();
  return trimmed.length > 0 ? trimmed : NO_KNOWN_ALLERGIES_LABEL;
}

export function formatAllergiesListTooltip(allergies: string): string {
  const trimmed = allergies.trim();
  if (!trimmed) return '';
  return `Allergic to ${trimmed}`;
}

export function normalizeAllergiesInput(raw: string): string {
  return raw.trim().slice(0, MAX_PATIENT_ALLERGIES_LENGTH);
}

export function buildAllergyIntolerance(patientId: string, token: string) {
  const matched = lookupAllergenConcept(token);
  const display = matched?.display ?? token.trim();
  const code = matched
    ? buildCodeableConcept(display, [
        {
          system: SNOMED_SYSTEM,
          code: matched.snomedCode,
          display: matched.display,
        },
      ])
    : buildCodeableConcept(token.trim());

  return {
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [{ system: HL7_ALLERGY_CLINICAL, code: 'active', display: 'Active' }],
    },
    verificationStatus: {
      coding: [{ system: HL7_ALLERGY_VERIFICATION, code: 'confirmed', display: 'Confirmed' }],
    },
    type: 'allergy',
    category: [matched?.category ?? 'food'],
    code,
    patient: { reference: `Patient/${patientId}` },
    recordedDate: new Date().toISOString(),
  };
}

export function resolveAllergenConceptForToken(token: string): AllergenCatalogEntry | null {
  return lookupAllergenConcept(token);
}

async function inactivateAllergyIntolerance(resource: any, client: FhirClient) {
  const updated = {
    ...resource,
    clinicalStatus: {
      coding: [{ system: HL7_ALLERGY_CLINICAL, code: 'inactive', display: 'Inactive' }],
    },
  };
  await client.put(`AllergyIntolerance/${resource.id}`, updated);
}

export async function syncPatientAllergies(
  patientId: string,
  freeText: string,
  client: FhirClient = defaultFhirClient()
): Promise<void> {
  const normalized = normalizeAllergiesInput(freeText);
  const tokens = parseAllergyTokens(normalized);

  const existing = await fetchPatientAllergyIntolerances(patientId, client);
  await Promise.all(existing.map((resource) => inactivateAllergyIntolerance(resource, client)));

  if (tokens.length === 0) {
    return;
  }

  const uniqueAllergens = new Map<string, ReturnType<typeof buildAllergyIntolerance>>();
  for (const token of tokens) {
    const resource = buildAllergyIntolerance(patientId, token);
    const snomedCode =
      findCoding(resource.code?.coding, SNOMED_SYSTEM)?.code ||
      resource.code?.text?.toLowerCase() ||
      token.toLowerCase();
    if (!uniqueAllergens.has(snomedCode)) {
      uniqueAllergens.set(snomedCode, resource);
    }
  }

  await Promise.all(
    Array.from(uniqueAllergens.values()).map((resource) =>
      client.post('AllergyIntolerance', resource)
    )
  );
}

/** Remove legacy Patient extension writes — allergies live on AllergyIntolerance now. */
export function applyAllergiesToPatient<T extends { extension?: PatientExtension[] }>(
  patient: T,
  _allergies: string
): T {
  if (!patient.extension?.length) return patient;

  const withoutLegacy = patient.extension.filter(
    (ext) => ext.url !== PATIENT_ALLERGIES_EXTENSION_URL
  );

  if (withoutLegacy.length === patient.extension.length) {
    return patient;
  }

  if (withoutLegacy.length === 0) {
    const next = { ...patient };
    delete next.extension;
    return next;
  }

  return {
    ...patient,
    extension: withoutLegacy,
  };
}

export function getAllergyIntoleranceSnomedCoding(resource: {
  code?: { coding?: Array<{ system?: string; code?: string; display?: string }> };
}) {
  return findCoding(resource.code?.coding, SNOMED_SYSTEM);
}
