import type { CareCategory } from '@/lib/careCategory';
import type { ClinicalWorkspaceSnapshot } from '@/lib/buildClinicalWorkspaceSnapshot';
import {
  generateAssessments,
  generateClinicalNotes,
  resolveClinicalWorkspaceCohort,
} from '@/lib/clinicalWorkspaceGenerator';

export type ClinicalWorkspaceCohort = 'diabetic' | 'cardiac' | 'general';

export type ClinicalNoteCategory = 'care-plan' | 'monitoring' | 'follow-up' | 'general';

export type ClinicalNote = {
  id: string;
  patientId: string;
  author: string;
  role: string;
  recordedAt: string;
  text: string;
  category: ClinicalNoteCategory;
};

export type AssessmentStatus = 'assigned' | 'in-progress' | 'completed' | 'overdue';

export type PatientAssessment = {
  id: string;
  patientId: string;
  title: string;
  description: string;
  reason: string;
  status: AssessmentStatus;
  assignedBy: string;
  assignedAt: string;
  dueDate?: string;
  completedAt?: string;
};

export type AssessmentTemplate = {
  id: string;
  title: string;
  description: string;
  defaultReason: string;
  typicalDueDays: number;
};

const NOTE_CATEGORY_LABELS: Record<ClinicalNoteCategory, string> = {
  'care-plan': 'Care plan',
  monitoring: 'RPM monitoring',
  'follow-up': 'Follow-up',
  general: 'General',
};

const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  assigned: 'Assigned',
  'in-progress': 'In progress',
  completed: 'Completed',
  overdue: 'Overdue',
};

export function formatNoteCategory(category: ClinicalNoteCategory): string {
  return NOTE_CATEGORY_LABELS[category];
}

export function formatAssessmentStatus(status: AssessmentStatus): string {
  return ASSESSMENT_STATUS_LABELS[status];
}

/** Clinical notes and assessments are enabled for every patient. */
export function hasClinicalWorkspace(_patientId?: string): boolean {
  return true;
}

export function getClinicalWorkspaceCohort(careCategory: CareCategory): ClinicalWorkspaceCohort {
  return resolveClinicalWorkspaceCohort(careCategory);
}

export const DIABETIC_ASSESSMENT_TEMPLATES: AssessmentTemplate[] = [
  {
    id: 'dsma-12',
    title: 'Diabetes Self-Management Assessment (DSMA-12)',
    description: 'Self-management confidence and behaviour checklist for type 2 diabetes.',
    defaultReason: 'Glycaemic control review on RPM data',
    typicalDueDays: 14,
  },
  {
    id: 'phq-9',
    title: 'Patient Health Questionnaire-9 (PHQ-9)',
    description: 'Depression screening for chronic disease populations.',
    defaultReason: 'Routine behavioural health screen',
    typicalDueDays: 14,
  },
  {
    id: 'foot-screen',
    title: 'Diabetic Foot Screening Checklist',
    description: 'Annual foot exam and ulcer risk documentation.',
    defaultReason: 'Long-standing diabetes — preventive foot screening',
    typicalDueDays: 21,
  },
  {
    id: 'dds-17',
    title: 'Diabetes Distress Scale (DDS-17)',
    description: 'Measures emotional burden of living with diabetes.',
    defaultReason: 'Recent glycaemic variability and self-care barriers noted',
    typicalDueDays: 14,
  },
];

export const CARDIAC_ASSESSMENT_TEMPLATES: AssessmentTemplate[] = [
  {
    id: 'kccq-12',
    title: 'Kansas City Cardiomyopathy Questionnaire (KCCQ-12)',
    description: 'Heart failure symptom burden and quality of life.',
    defaultReason: 'Cardiac RPM alerts — assess functional status',
    typicalDueDays: 14,
  },
  {
    id: 'af-sbp',
    title: 'Atrial Fibrillation Symptom Burden (AF-SBP)',
    description: 'Symptom scale for rhythm and rate management review.',
    defaultReason: 'Elevated or irregular heart rate on monitoring',
    typicalDueDays: 14,
  },
  {
    id: 'cardiac-rehab',
    title: 'Cardiac Rehabilitation Readiness Survey',
    description: 'Readiness screen for structured cardiac rehab enrolment.',
    defaultReason: 'Cardiovascular event history — rehab eligibility',
    typicalDueDays: 21,
  },
  {
    id: 'nyha-patient',
    title: 'NYHA Functional Class — Patient Report',
    description: 'Patient-reported functional limitation class (I–IV).',
    defaultReason: 'Volume or exertional symptom changes on RPM feed',
    typicalDueDays: 7,
  },
];

export const GENERAL_ASSESSMENT_TEMPLATES: AssessmentTemplate[] = [
  {
    id: 'phq-9',
    title: 'Patient Health Questionnaire-9 (PHQ-9)',
    description: 'Depression screening for chronic disease populations.',
    defaultReason: 'Routine behavioural health screen',
    typicalDueDays: 14,
  },
  {
    id: 'pam',
    title: 'Patient Activation Measure (PAM-10)',
    description: 'Self-management confidence and engagement screening.',
    defaultReason: 'Chronic care enrolment — activation review',
    typicalDueDays: 14,
  },
  {
    id: 'ckd-self-mgmt',
    title: 'CKD Self-Management Checklist',
    description: 'Fluid, diet, and blood pressure self-care review for kidney disease.',
    defaultReason: 'CKD enrolment — kidney self-management review',
    typicalDueDays: 14,
  },
  {
    id: 'obesity-readiness',
    title: 'Obesity Lifestyle Readiness Survey',
    description: 'Nutrition, activity, and weight-management readiness screen.',
    defaultReason: 'Weight management enrolment — lifestyle readiness review',
    typicalDueDays: 14,
  },
  {
    id: 'fall-risk',
    title: 'Home Fall-Risk Screening Checklist',
    description: 'Mobility, balance, and home safety assessment.',
    defaultReason: 'Mobility assistance enrolment — fall-risk screening',
    typicalDueDays: 14,
  },
  {
    id: 'general-wellness',
    title: 'Remote Wellness Check-In Survey',
    description: 'General symptom and activity review for remote monitoring cohorts.',
    defaultReason: 'Remote monitoring — wellness check-in',
    typicalDueDays: 7,
  },
  {
    id: 'edss',
    title: 'Expanded Disability Status Scale (EDSS)',
    description: 'Neurologic disability scoring for multiple sclerosis progression monitoring.',
    defaultReason: 'Multiple sclerosis — semi-annual EDSS review',
    typicalDueDays: 180,
  },
];

function notesStorageKey(patientId: string): string {
  return `prohealth_clinical_notes_${patientId}`;
}

function assessmentsStorageKey(patientId: string): string {
  return `prohealth_assessments_${patientId}`;
}

function readSessionJson<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSessionJson<T>(key: string, items: T[]): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(key, JSON.stringify(items));
}

function mergeGeneratedWithStored<T extends { id: string }>(generated: T[], stored: T[]): T[] {
  const generatedIds = new Set(generated.map((item) => item.id));
  const userAdded = stored.filter((item) => !generatedIds.has(item.id));
  return [...generated, ...userAdded];
}

export function getClinicalNotesForPatient(
  patientId: string,
  snapshot?: ClinicalWorkspaceSnapshot | null
): ClinicalNote[] {
  const generated = snapshot ? generateClinicalNotes(snapshot) : [];
  const stored = readSessionJson<ClinicalNote>(notesStorageKey(patientId));
  return mergeGeneratedWithStored(generated, stored).sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
  );
}

export function addClinicalNote(
  patientId: string,
  note: Omit<ClinicalNote, 'id' | 'patientId' | 'recordedAt'>
): ClinicalNote {
  const entry: ClinicalNote = {
    ...note,
    id: `note-${Date.now()}`,
    patientId,
    recordedAt: new Date().toISOString(),
  };
  const stored = readSessionJson<ClinicalNote>(notesStorageKey(patientId));
  writeSessionJson(notesStorageKey(patientId), [...stored, entry]);
  return entry;
}

export function getAssessmentsForPatient(
  patientId: string,
  snapshot?: ClinicalWorkspaceSnapshot | null,
  cohort?: ClinicalWorkspaceCohort
): PatientAssessment[] {
  const templates = cohort ? getAssessmentTemplatesForCohort(cohort) : [];
  const generated =
    snapshot && templates.length > 0 ? generateAssessments(snapshot, templates) : [];
  const stored = readSessionJson<PatientAssessment>(assessmentsStorageKey(patientId));
  return mergeGeneratedWithStored(generated, stored).sort(
    (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
  );
}

export function getAssessmentTemplatesForCohort(
  cohort: ClinicalWorkspaceCohort
): AssessmentTemplate[] {
  if (cohort === 'diabetic') return DIABETIC_ASSESSMENT_TEMPLATES;
  if (cohort === 'cardiac') return CARDIAC_ASSESSMENT_TEMPLATES;
  return GENERAL_ASSESSMENT_TEMPLATES;
}

export function assignAssessmentFromTemplate(
  patientId: string,
  template: AssessmentTemplate,
  assignedBy: string,
  reason?: string
): PatientAssessment {
  const due = new Date();
  due.setDate(due.getDate() + template.typicalDueDays);

  const entry: PatientAssessment = {
    id: `assess-${Date.now()}`,
    patientId,
    title: template.title,
    description: template.description,
    reason: reason?.trim() || template.defaultReason,
    status: 'assigned',
    assignedBy,
    assignedAt: new Date().toISOString(),
    dueDate: due.toISOString().slice(0, 10),
  };

  const stored = readSessionJson<PatientAssessment>(assessmentsStorageKey(patientId));
  writeSessionJson(assessmentsStorageKey(patientId), [...stored, entry]);
  return entry;
}

export function formatClinicalNoteTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type { ClinicalWorkspaceSnapshot };
