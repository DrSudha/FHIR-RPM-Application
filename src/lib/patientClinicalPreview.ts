export interface ClinicalPreviewData {
  clinicalHistory: string;
  activeMedications: string[];
  /** Present when more active meds exist than shown in the popup. */
  additionalMedicationCount?: number;
}

const previewCache = new Map<string, ClinicalPreviewData>();

const MAX_CONDITIONS = 3;
const MAX_MEDICATIONS = 3;

function isEnrolmentCondition(condition: any): boolean {
  const label = (
    condition.code?.text ||
    condition.code?.coding?.[0]?.display ||
    ''
  ).toLowerCase();
  return label.includes('enrolment') || label.includes('enrollment');
}

function getConditionName(condition: any): string {
  return (
    condition.code?.text ||
    condition.code?.coding?.[0]?.display ||
    'Unknown condition'
  );
}

function getResourceDate(resource: any): Date {
  const raw =
    resource.recordedDate ||
    resource.onsetDateTime ||
    resource.effectiveDateTime ||
    resource.authoredOn ||
    resource.issued;
  if (!raw) return new Date(0);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function formatYear(date: Date): string {
  if (date.getTime() <= 0) return '';
  return String(date.getFullYear());
}

function buildBriefClinicalHistory(conditions: any[]): string {
  const latest = conditions
    .filter((condition) => !isEnrolmentCondition(condition))
    .sort((a, b) => getResourceDate(b).getTime() - getResourceDate(a).getTime())
    .slice(0, MAX_CONDITIONS);

  if (latest.length === 0) {
    return 'None recorded';
  }

  return latest
    .map((condition) => {
      const name = getConditionName(condition);
      const year = formatYear(getResourceDate(condition));
      return year ? `${name} (${year})` : name;
    })
    .join('; ');
}

function getMedicationName(medication: any): string {
  return (
    medication.medicationCodeableConcept?.text ||
    medication.medicationCodeableConcept?.coding?.[0]?.display ||
    medication.medicationReference?.display ||
    'Unknown medication'
  );
}

function getActiveMedications(medications: any[]): {
  names: string[];
  additionalCount: number;
} {
  const active = medications
    .filter((med) => med.status === 'active')
    .sort((a, b) => getResourceDate(b).getTime() - getResourceDate(a).getTime());

  const names = active.slice(0, MAX_MEDICATIONS).map(getMedicationName);
  const additionalCount = Math.max(0, active.length - MAX_MEDICATIONS);

  return { names, additionalCount };
}

async function fetchBundleResources(url: string): Promise<any[]> {
  const response = await fetch(url);
  if (!response.ok) return [];
  const bundle = await response.json();
  if (!bundle.entry) return [];
  return bundle.entry.map((entry: any) => entry.resource).filter(Boolean);
}

export async function fetchClinicalPreview(patientId: string): Promise<ClinicalPreviewData> {
  const cached = previewCache.get(patientId);
  if (cached) return cached;

  const [conditions, medications] = await Promise.all([
    fetchBundleResources(`/api/fhir/Condition?patient=${patientId}&_count=50`),
    fetchBundleResources(`/api/fhir/MedicationRequest?patient=${patientId}&status=active&_count=20`),
  ]);

  const { names, additionalCount } = getActiveMedications(medications);

  const preview: ClinicalPreviewData = {
    clinicalHistory: buildBriefClinicalHistory(conditions),
    activeMedications: names,
    ...(additionalCount > 0 ? { additionalMedicationCount: additionalCount } : {}),
  };

  previewCache.set(patientId, preview);
  return preview;
}
