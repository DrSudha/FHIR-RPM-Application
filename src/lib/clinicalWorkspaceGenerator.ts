import type { CareCategory, GeneralCareSubCategory } from '@/lib/careCategory';
import { getGeneralCareSubCategoryLabel } from '@/lib/careCategory';
import type {
  AssessmentTemplate,
  ClinicalNote,
  ClinicalNoteCategory,
  ClinicalWorkspaceCohort,
  PatientAssessment,
} from '@/lib/patientClinicalWorkspace';
import type { ClinicalWorkspaceSnapshot } from '@/lib/buildClinicalWorkspaceSnapshot';

const REFERENCE_NOW = new Date('2026-05-26T12:00:00.000Z');

function patientSeed(patientId: string): number {
  let hash = 0;
  for (let i = 0; i < patientId.length; i += 1) {
    hash = patientId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function isoDaysAgo(days: number): string {
  const date = new Date(REFERENCE_NOW);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function isoDateDaysFromNow(days: number): string {
  const date = new Date(REFERENCE_NOW);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatGlucose(value: number | null): string {
  return value != null ? `${Math.round(value)} mg/dL` : 'recent home readings';
}

function formatBp(snapshot: ClinicalWorkspaceSnapshot): string {
  if (snapshot.latestSystolic != null && snapshot.latestDiastolic != null) {
    return `${Math.round(snapshot.latestSystolic)}/${Math.round(snapshot.latestDiastolic)} mmHg`;
  }
  return 'recent home readings';
}

function formatLipids(snapshot: ClinicalWorkspaceSnapshot): string {
  const parts: string[] = [];
  if (snapshot.latestLdl != null) parts.push(`LDL ${Math.round(snapshot.latestLdl)} mg/dL`);
  if (snapshot.latestHdl != null) parts.push(`HDL ${Math.round(snapshot.latestHdl)} mg/dL`);
  if (snapshot.latestTriglycerides != null) {
    parts.push(`triglycerides ${Math.round(snapshot.latestTriglycerides)} mg/dL`);
  }
  return parts.length > 0 ? parts.join(', ') : 'latest lipid panel';
}

function formatActivity(snapshot: ClinicalWorkspaceSnapshot): string {
  const parts: string[] = [];
  if (snapshot.latestSteps != null) parts.push(`${snapshot.latestSteps.toLocaleString()} steps today`);
  if (snapshot.avgSteps7d != null) {
    parts.push(`${Math.round(snapshot.avgSteps7d).toLocaleString()} daily steps (7-day avg)`);
  }
  if (snapshot.avgSleep7d != null) {
    parts.push(`${snapshot.avgSleep7d.toFixed(1)} h sleep (7-day avg)`);
  }
  return parts.length > 0 ? parts.join('; ') : 'wearable activity data reviewed';
}

function conditionPhrase(snapshot: ClinicalWorkspaceSnapshot): string {
  if (snapshot.primaryCondition) return snapshot.primaryCondition;
  if (snapshot.careCategory === 'diabetic') return 'type 2 diabetes';
  if (snapshot.careCategory === 'cardiac') return 'cardiovascular disease';
  return 'active chronic care enrolment';
}

function noteId(patientId: string, index: number): string {
  return `gen-note-${patientId}-${index}`;
}

function assessId(patientId: string, templateId: string): string {
  return `gen-assess-${patientId}-${templateId}`;
}

function makeNote(
  snapshot: ClinicalWorkspaceSnapshot,
  index: number,
  author: string,
  role: string,
  daysAgo: number,
  category: ClinicalNoteCategory,
  text: string
): ClinicalNote {
  return {
    id: noteId(snapshot.patientId, index),
    patientId: snapshot.patientId,
    author,
    role,
    recordedAt: isoDaysAgo(daysAgo),
    category,
    text,
  };
}

function buildDiabeticNotes(snapshot: ClinicalWorkspaceSnapshot): ClinicalNote[] {
  const condition = conditionPhrase(snapshot);
  const monitoringParts: string[] = [];

  if (snapshot.latestGlucose != null) {
    monitoringParts.push(`Latest glucose ${formatGlucose(snapshot.latestGlucose)}`);
  }
  if (snapshot.glucoseSpread7d != null && snapshot.glucoseSpread7d >= 60) {
    monitoringParts.push('7-day glucose variability remains wide on RPM feed');
  } else if (snapshot.latestGlucose != null) {
    monitoringParts.push('home glucose monitoring reviewed');
  }
  if (snapshot.latestLdl != null || snapshot.latestHdl != null) {
    monitoringParts.push(`Lipid panel reviewed — ${formatLipids(snapshot)}`);
  }
  if (snapshot.hasElevatedLdl) {
    monitoringParts.push('LDL remains above target');
  }

  const monitoringText =
    monitoringParts.length > 0
      ? `${monitoringParts.join('. ')}. Reinforced dietary sodium and refined carbohydrate reduction at last call.`
      : `RPM monitoring reviewed for ${condition}. Reinforced nutrition and medication adherence at last call.`;

  const activityText = snapshot.hasLowActivity
    ? `${formatActivity(snapshot)}. Discussed pacing activity and short walking breaks during sedentary work.`
    : `${formatActivity(snapshot)}. Encouraged maintaining current activity pattern.`;

  const followUpText = snapshot.hasElevatedLdl
    ? `Discussed annual diabetic foot screening and retinopathy referral in context of ${condition}. ${formatLipids(snapshot)} — preventive foot exam follow-up coordinated.`
    : `Discussed annual diabetic foot screening and retinopathy referral for ${condition}. No new neuropathy symptoms reported on review.`;

  return [
    makeNote(
      snapshot,
      0,
      'Dr. Sarah Mitchell',
      'Care Coordinator',
      4,
      'monitoring',
      monitoringText
    ),
    makeNote(
      snapshot,
      1,
      'Sister Nancy Dawson',
      'Diabetes Nurse',
      8,
      'care-plan',
      `Care plan updated for ${condition}. ${activityText} Agreed to continue home glucose checks and use backup glucometer when schedule is disrupted.`
    ),
    makeNote(
      snapshot,
      2,
      'Dr. Sarah Mitchell',
      'Care Coordinator',
      16,
      'follow-up',
      followUpText
    ),
  ];
}

function buildCardiacNotes(snapshot: ClinicalWorkspaceSnapshot): ClinicalNote[] {
  const condition = conditionPhrase(snapshot);
  const monitoringParts: string[] = [];

  if (snapshot.hasLowO2) {
    monitoringParts.push('RPM flagged intermittent O₂ desaturation overnight');
  } else if (snapshot.latestO2 != null) {
    monitoringParts.push(`Latest SpO₂ ${Math.round(snapshot.latestO2)}%`);
  }
  if (snapshot.latestWeightIncrease) {
    monitoringParts.push(
      `recent ${snapshot.latestWeightIncrease.deltaKg.toFixed(1)} kg weight gain over 24 hours`
    );
  }
  if (snapshot.hasElevatedBp || snapshot.hasElevatedHr) {
    monitoringParts.push(
      `elevated home vitals (${formatBp(snapshot)}${snapshot.latestHeartRate != null ? `, HR ${Math.round(snapshot.latestHeartRate)} bpm` : ''})`
    );
  }

  const monitoringText =
    monitoringParts.length > 0
      ? `${monitoringParts.join('; ')}. Patient denies increased dyspnoea at rest. Escalated to cardiology review; daily weight and SpO₂ monitoring continued.`
      : `Cardiac RPM feed reviewed for ${condition}. No acute decompensation reported; continued home monitoring.`;

  const activityText = snapshot.hasLowActivity
    ? `${formatActivity(snapshot)}. Encouraged graded walking plan within symptom limits.`
    : `${formatActivity(snapshot)}. Activity tolerance stable on wearable trend.`;

  return [
    makeNote(snapshot, 0, 'Dr. Sarah Mitchell', 'Care Coordinator', 2, 'monitoring', monitoringText),
    makeNote(
      snapshot,
      1,
      'Jonathan Hale',
      'Cardiac Nurse',
      7,
      'care-plan',
      `Reviewed fluid restriction and daily weight log for ${condition}. ${activityText} Patient able to recite red-flag symptoms for heart failure decompensation.`
    ),
    makeNote(
      snapshot,
      2,
      'Dr. Sarah Mitchell',
      'Care Coordinator',
      14,
      'follow-up',
      snapshot.hasElevatedBp || snapshot.hasElevatedHr
        ? `Elevated BP and heart rate episodes noted on wearable feed for ${condition}. Medication adherence confirmed. Will repeat home BP diary for 7 days before titration discussion.`
        : `Routine follow-up for ${condition}. Home BP and heart rate trends reviewed — continue current plan pending cardiology review.`
    ),
  ];
}

function buildGeneralNotes(snapshot: ClinicalWorkspaceSnapshot): ClinicalNote[] {
  const subLabel = snapshot.generalSubCategory
    ? getGeneralCareSubCategoryLabel(snapshot.generalSubCategory)
    : 'General care';
  const condition = snapshot.primaryCondition ?? subLabel;

  const vitalsParts: string[] = [];
  if (snapshot.latestWeightKg != null) {
    vitalsParts.push(`weight ${snapshot.latestWeightKg.toFixed(1)} kg`);
  }
  if (snapshot.latestSystolic != null && snapshot.latestDiastolic != null) {
    vitalsParts.push(formatBp(snapshot));
  }
  if (snapshot.latestO2 != null) vitalsParts.push(`SpO₂ ${Math.round(snapshot.latestO2)}%`);

  const monitoringText =
    vitalsParts.length > 0
      ? `Remote monitoring reviewed for ${condition}. Latest vitals: ${vitalsParts.join(', ')}. ${formatActivity(snapshot)}.`
      : `Remote monitoring reviewed for ${condition}. ${formatActivity(snapshot)}.`;

  const carePlanFocus =
    snapshot.hasMultipleSclerosis
      ? 'Reviewed fatigue pacing, balance exercises, and neurologic symptom reporting thresholds.'
      : snapshot.generalSubCategory === 'ckd'
      ? 'Reinforced fluid balance, blood pressure targets, and nephrology follow-up schedule.'
      : snapshot.generalSubCategory === 'obesity'
        ? 'Discussed nutrition journaling, portion awareness, and gradual activity progression.'
        : snapshot.generalSubCategory === 'mobility-assistance'
          ? 'Reviewed fall-prevention strategies, home safety, and assistive device use.'
          : snapshot.generalSubCategory === 'muscle-weakness'
            ? 'Reviewed resistance exercises, protein intake, and fatigue pacing.'
            : 'Reviewed self-management goals and symptom reporting thresholds.';

  return [
    makeNote(snapshot, 0, 'Dr. Sarah Mitchell', 'Care Coordinator', 5, 'monitoring', monitoringText),
    makeNote(
      snapshot,
      1,
      'Sister Nancy Dawson',
      'Community Nurse',
      11,
      'care-plan',
      `${carePlanFocus} Care plan aligned to ${subLabel} enrolment and latest problem list (${condition}).`
    ),
    makeNote(
      snapshot,
      2,
      'Dr. Sarah Mitchell',
      'Care Coordinator',
      18,
      'follow-up',
      `Follow-up scheduled for ${condition}. Patient reports understanding of when to contact the care team for worsening symptoms.`
    ),
  ];
}

export function generateClinicalNotes(snapshot: ClinicalWorkspaceSnapshot): ClinicalNote[] {
  if (snapshot.careCategory === 'diabetic') return buildDiabeticNotes(snapshot);
  if (snapshot.careCategory === 'cardiac') return buildCardiacNotes(snapshot);
  return buildGeneralNotes(snapshot);
}

function makeAssessment(
  snapshot: ClinicalWorkspaceSnapshot,
  template: AssessmentTemplate | undefined,
  options: {
    status: PatientAssessment['status'];
    assignedBy: string;
    assignedDaysAgo: number;
    dueDaysFromNow?: number;
    completedDaysAgo?: number;
    reason: string;
  }
): PatientAssessment | null {
  if (!template) return null;
  const assignedAt = isoDaysAgo(options.assignedDaysAgo);
  const dueDate =
    options.dueDaysFromNow != null
      ? isoDateDaysFromNow(options.dueDaysFromNow)
      : isoDateDaysFromNow(template.typicalDueDays - options.assignedDaysAgo);

  return {
    id: assessId(snapshot.patientId, template.id),
    patientId: snapshot.patientId,
    title: template.title,
    description: template.description,
    reason: options.reason,
    status: options.status,
    assignedBy: options.assignedBy,
    assignedAt,
    dueDate,
    completedAt:
      options.status === 'completed' && options.completedDaysAgo != null
        ? isoDaysAgo(options.completedDaysAgo)
        : undefined,
  };
}

function pickDiabeticAssessments(
  snapshot: ClinicalWorkspaceSnapshot,
  templates: AssessmentTemplate[]
): PatientAssessment[] {
  const byId = Object.fromEntries(templates.map((template) => [template.id, template]));
  const seed = patientSeed(snapshot.patientId);
  const glucoseReason =
    snapshot.glucoseSpread7d != null && snapshot.glucoseSpread7d >= 60
      ? 'Glycaemic variability on RPM feed — annual self-management review'
      : snapshot.latestGlucose != null
        ? `Latest glucose ${formatGlucose(snapshot.latestGlucose)} — glycaemic control review`
        : 'Glycaemic control review on RPM data';

  const assessments: PatientAssessment[] = [
    makeAssessment(snapshot, byId['dsma-12'], {
      status: 'assigned',
      assignedBy: 'Dr. Sarah Mitchell',
      assignedDaysAgo: 6,
      dueDaysFromNow: 8,
      reason: glucoseReason,
    }),
    makeAssessment(snapshot, byId['phq-9'], {
      status: 'completed',
      assignedBy: 'Dr. Sarah Mitchell',
      assignedDaysAgo: 41,
      dueDaysFromNow: -27,
      completedDaysAgo: 34,
      reason: 'Routine behavioural health screen in chronic disease cohort',
    }),
  ].filter((item): item is PatientAssessment => item != null);

  if (byId['foot-screen'] && (snapshot.hasElevatedLdl || seed % 3 !== 2)) {
    const footScreen = makeAssessment(snapshot, byId['foot-screen'], {
      status: snapshot.hasElevatedLdl ? 'overdue' : 'assigned',
      assignedBy: 'Sister Nancy Dawson',
      assignedDaysAgo: 25,
      dueDaysFromNow: snapshot.hasElevatedLdl ? -11 : 5,
      reason: snapshot.hasElevatedLdl
        ? `${formatLipids(snapshot)} and long-standing diabetes — annual foot exam due`
        : 'Long-standing diabetes — preventive foot screening',
    });
    if (footScreen) assessments.push(footScreen);
  } else if (byId['dds-17']) {
    const distress = makeAssessment(snapshot, byId['dds-17'], {
      status: 'assigned',
      assignedBy: 'Dr. Sarah Mitchell',
      assignedDaysAgo: 10,
      dueDaysFromNow: 4,
      reason: 'Recent self-care barriers noted on RPM review',
    });
    if (distress) assessments.push(distress);
  }

  return assessments;
}

function pickCardiacAssessments(
  snapshot: ClinicalWorkspaceSnapshot,
  templates: AssessmentTemplate[]
): PatientAssessment[] {
  const byId = Object.fromEntries(templates.map((template) => [template.id, template]));
  const reasonBase = snapshot.primaryCondition ?? 'cardiovascular care enrolment';
  const alertReason = snapshot.latestWeightIncrease
    ? `${reasonBase} with recent volume change on RPM (${snapshot.latestWeightIncrease.deltaKg.toFixed(1)} kg in 24 h)`
    : snapshot.hasLowO2
      ? `${reasonBase} with SpO₂ alerts on home monitoring`
      : `${reasonBase} — assess functional status on RPM feed`;

  const assessments: PatientAssessment[] = [
    makeAssessment(snapshot, byId['kccq-12'], {
      status: snapshot.hasLowO2 || snapshot.latestWeightIncrease ? 'in-progress' : 'assigned',
      assignedBy: 'Dr. Sarah Mitchell',
      assignedDaysAgo: 8,
      dueDaysFromNow: 6,
      reason: alertReason,
    }),
  ].filter((item): item is PatientAssessment => item != null);

  if (snapshot.hasElevatedHr && byId['af-sbp']) {
    const afAssessment = makeAssessment(snapshot, byId['af-sbp'], {
      status: 'assigned',
      assignedBy: 'Jonathan Hale',
      assignedDaysAgo: 4,
      dueDaysFromNow: 10,
      reason:
        snapshot.latestHeartRate != null
          ? `Elevated heart rate (${Math.round(snapshot.latestHeartRate)} bpm) on home monitoring`
          : 'Elevated or irregular heart rate on monitoring',
    });
    if (afAssessment) assessments.push(afAssessment);
  }

  if (byId['cardiac-rehab']) {
    const rehabAssessment = makeAssessment(snapshot, byId['cardiac-rehab'], {
      status: 'assigned',
      assignedBy: 'Dr. Sarah Mitchell',
      assignedDaysAgo: 16,
      dueDaysFromNow: snapshot.hasLowActivity ? -2 : 5,
      reason: snapshot.hasLowActivity
        ? 'Deconditioning risk on low step counts — assess suitability for phase II rehab'
        : 'Cardiovascular history — assess suitability for structured cardiac rehab',
    });
    if (rehabAssessment) assessments.push(rehabAssessment);
  } else if (snapshot.hasLowO2 && byId['nyha-patient']) {
    const nyhaAssessment = makeAssessment(snapshot, byId['nyha-patient'], {
      status: 'assigned',
      assignedBy: 'Jonathan Hale',
      assignedDaysAgo: 3,
      dueDaysFromNow: 4,
      reason: 'Exertional or volume symptom changes on RPM feed',
    });
    if (nyhaAssessment) assessments.push(nyhaAssessment);
  }

  return assessments;
}

function pickGeneralAssessments(
  snapshot: ClinicalWorkspaceSnapshot,
  templates: AssessmentTemplate[]
): PatientAssessment[] {
  const byId = Object.fromEntries(templates.map((template) => [template.id, template]));
  const focus = snapshot.generalSubCategory;
  const condition = snapshot.primaryCondition ?? (focus ? getGeneralCareSubCategoryLabel(focus) : 'general care');

  const assessments: PatientAssessment[] = [
    makeAssessment(snapshot, byId['phq-9'], {
      status: 'completed',
      assignedBy: 'Dr. Sarah Mitchell',
      assignedDaysAgo: 36,
      completedDaysAgo: 29,
      reason: 'Routine behavioural health screen in chronic care cohort',
    }),
  ].filter((item): item is PatientAssessment => item != null);

  if (snapshot.hasMultipleSclerosis && byId['edss']) {
    const edssAssessment = makeAssessment(snapshot, byId['edss'], {
      status: 'assigned',
      assignedBy: 'Dr Jane Smith',
      assignedDaysAgo: 14,
      dueDaysFromNow: 166,
      reason: 'Multiple sclerosis — next EDSS review due (last score 6.5)',
    });
    if (edssAssessment) assessments.unshift(edssAssessment);

    const completedEdss = makeAssessment(snapshot, byId['edss'], {
      status: 'completed',
      assignedBy: 'Dr Jane Smith',
      assignedDaysAgo: 196,
      completedDaysAgo: 189,
      reason: 'Multiple sclerosis — EDSS score 6.5 recorded (moderate disability, gait impairment)',
    });
    if (completedEdss) {
      completedEdss.id = assessId(snapshot.patientId, 'edss-completed');
      assessments.unshift(completedEdss);
    }
  }

  if (focus === 'ckd' && byId['ckd-self-mgmt']) {
    const ckdAssessment = makeAssessment(snapshot, byId['ckd-self-mgmt'], {
      status: snapshot.hasElevatedBp ? 'assigned' : 'in-progress',
      assignedBy: 'Dr. Sarah Mitchell',
      assignedDaysAgo: 9,
      dueDaysFromNow: 5,
      reason: snapshot.hasElevatedBp
        ? `${condition} — blood pressure above target on home readings (${formatBp(snapshot)})`
        : `${condition} — kidney self-management review`,
    });
    if (ckdAssessment) assessments.push(ckdAssessment);
  } else if (focus === 'obesity' && byId['obesity-readiness']) {
    const obesityAssessment = makeAssessment(snapshot, byId['obesity-readiness'], {
      status: 'assigned',
      assignedBy: 'Sister Nancy Dawson',
      assignedDaysAgo: 7,
      dueDaysFromNow: 7,
      reason:
        snapshot.latestWeightKg != null
          ? `Weight ${snapshot.latestWeightKg.toFixed(1)} kg — lifestyle readiness review`
          : 'Weight management enrolment — lifestyle readiness review',
    });
    if (obesityAssessment) assessments.push(obesityAssessment);
  } else if (focus === 'mobility-assistance' && byId['fall-risk']) {
    const fallRiskAssessment = makeAssessment(snapshot, byId['fall-risk'], {
      status: snapshot.hasLowActivity ? 'overdue' : 'assigned',
      assignedBy: 'Sister Nancy Dawson',
      assignedDaysAgo: 20,
      dueDaysFromNow: snapshot.hasLowActivity ? -6 : 1,
      reason: 'Mobility assistance enrolment — home fall-risk screening',
    });
    if (fallRiskAssessment) assessments.push(fallRiskAssessment);
  } else if (byId['pam']) {
    const pamAssessment = makeAssessment(snapshot, byId['pam'], {
      status: 'assigned',
      assignedBy: 'Dr. Sarah Mitchell',
      assignedDaysAgo: 5,
      dueDaysFromNow: 9,
      reason: `${condition} — patient activation and self-management confidence review`,
    });
    if (pamAssessment) assessments.push(pamAssessment);
  }

  if (assessments.length < 3 && byId['general-wellness']) {
    const wellnessAssessment = makeAssessment(snapshot, byId['general-wellness'], {
      status: 'assigned',
      assignedBy: 'Dr. Sarah Mitchell',
      assignedDaysAgo: 12,
      dueDaysFromNow: 2,
      reason: `${formatActivity(snapshot)} — remote wellness check-in`,
    });
    if (wellnessAssessment) assessments.push(wellnessAssessment);
  }

  return assessments.slice(0, snapshot.hasMultipleSclerosis ? 4 : 3);
}

export function generateAssessments(
  snapshot: ClinicalWorkspaceSnapshot,
  templates: AssessmentTemplate[]
): PatientAssessment[] {
  if (snapshot.careCategory === 'diabetic') return pickDiabeticAssessments(snapshot, templates);
  if (snapshot.careCategory === 'cardiac') return pickCardiacAssessments(snapshot, templates);
  return pickGeneralAssessments(snapshot, templates);
}

export function resolveClinicalWorkspaceCohort(
  careCategory: CareCategory
): ClinicalWorkspaceCohort {
  if (careCategory === 'diabetic') return 'diabetic';
  if (careCategory === 'cardiac') return 'cardiac';
  return 'general';
}
