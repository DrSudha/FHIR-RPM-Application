/**
 * Normalizes medication requests for all patients:
 * - Reads each medication name and fills dosage, route, frequency
 * - Keeps at most 10 medications per patient (active/recent first)
 * - Ensures at least 3 medications based on recent diagnoses
 *
 * Usage: node scripts/seed-patient-medications.mjs [baseUrl]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRxNormMedicationConcept } from './lib/fhir-terminology.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(__dirname, '../src/data/medication-catalog.json'), 'utf8')
);

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const MIN_MEDICATIONS = 3;
const MAX_MEDICATIONS = 10;
const MIN_ACTIVE_MEDICATIONS = 3;
const MAX_ACTIVE_MEDICATIONS = 6;
const LATEST_CONDITIONS_TO_CONSIDER = 1;

const EXACT_CONDITION_MEDS = {
  ckd: ['Sodium bicarbonate', 'Calcium carbonate', 'Lisinopril'],
  obesity: ['Orlistat', 'Semaglutide', 'Metformin'],
  'muscle weakness': ['Vitamin D3', 'Gabapentin', 'Baclofen'],
  'mobility assistance': ['Gabapentin', 'Vitamin D3', 'Acetaminophen'],
};

const MEDICATION_RULES = [
  {
    keywords: ['diabetes', 'diabetic', 'hyperglycemia', 'glucose', 'prediabetes'],
    meds: ['Metformin', 'Glipizide', 'Empagliflozin'],
  },
  {
    keywords: ['hypertension', 'hypertensive', 'angina', 'coronary', 'ischemic', 'malignant hypertension'],
    meds: ['Lisinopril', 'Amlodipine', 'Atorvastatin'],
  },
  {
    keywords: ['heart failure', 'cardiac', 'atrial fibrillation', 'myocardial', 'infarction', 'cardiovascular'],
    meds: ['Carvedilol', 'Furosemide', 'Aspirin'],
  },
  {
    keywords: ['early multiple sclerosis', 'multiple sclerosis', 'sclerosis'],
    meds: ['Dalfampridine', 'Baclofen', 'Vitamin D3'],
  },
  {
    keywords: ['ckd', 'kidney', 'renal'],
    meds: ['Sodium bicarbonate', 'Calcium carbonate', 'Furosemide'],
  },
  {
    keywords: ['obesity', 'overweight', 'body mass index 30'],
    meds: ['Orlistat', 'Metformin', 'Semaglutide'],
  },
  {
    keywords: ['muscle weakness', 'mobility', 'stroke', 'cerebrovascular'],
    meds: ['Atorvastatin', 'Clopidogrel', 'Vitamin D3'],
  },
  {
    keywords: ['sinusitis', 'infection', 'cystitis', 'gingivitis', 'dental'],
    meds: ['Amoxicillin', 'Ibuprofen', 'Omeprazole'],
  },
];

const DEFAULT_MED_NAMES = ['Omeprazole', 'Vitamin D3', 'Acetaminophen', 'Atorvastatin'];

const STATUS_ORDER = {
  active: 0,
  'on-hold': 1,
  draft: 2,
  completed: 3,
  stopped: 4,
  cancelled: 5,
  discontinued: 6,
  unknown: 7,
  'entered-in-error': 99,
};

async function fhirGet(path) {
  const res = await fetch(`${API_BASE}/${path}`, {
    headers: { Accept: 'application/fhir+json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function fhirPost(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function fhirPut(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PUT ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function fhirDelete(path) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'DELETE',
    headers: { Accept: 'application/fhir+json' },
  });
  if (res.status === 204 || res.status === 200) return true;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`DELETE ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return true;
}

function patientName(patient) {
  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  return [given, family].filter(Boolean).join(' ');
}

function calculateAgeYears(birthDate) {
  if (!birthDate) return 50;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 50;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function frequencyLabel(frequency) {
  if (frequency === 1) return 'Once daily';
  if (frequency === 2) return 'Twice daily';
  if (frequency === 3) return 'Three times daily';
  return `${frequency}x daily`;
}

function isoDateDaysAgo(daysAgo, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function medRawName(med) {
  return (
    med.medicationCodeableConcept?.text ||
    med.medicationCodeableConcept?.coding?.[0]?.display ||
    med.medicationReference?.display ||
    ''
  );
}

function buildMedicationSearchTexts(rawName) {
  const normalized = rawName.toLowerCase();
  const texts = new Set([normalized]);
  const bracketMatch = rawName.match(/\[([^\]]+)\]/);
  if (bracketMatch?.[1]) texts.add(bracketMatch[1].toLowerCase());
  return [...texts];
}

function lookupMedicationProfile(rawName) {
  const searchTexts = buildMedicationSearchTexts(rawName);
  for (const entry of catalog.entries) {
    if (entry.match.some((needle) => searchTexts.some((text) => text.includes(needle.toLowerCase())))) {
      return entry;
    }
  }
  return null;
}

function simplifyMedicationDisplayName(rawName) {
  const trimmed = rawName.trim();
  if (!trimmed) return 'Unknown Medication';
  const bracketMatch = trimmed.match(/\[([^\]]+)\]/);
  if (bracketMatch?.[1] && bracketMatch[1].length <= 80) return bracketMatch[1].trim();
  const profile = lookupMedicationProfile(trimmed);
  if (profile) return profile.displayName;
  if (trimmed.length > 72) {
    const short = trimmed.split(/[/{]/)[0]?.trim();
    return short && short.length <= 72 ? short : `${trimmed.slice(0, 69)}…`;
  }
  return trimmed;
}

function adjustDose(baseDose, age, weightKg) {
  let dose = baseDose;
  if (age >= 75) dose *= 0.7;
  else if (age >= 65) dose *= 0.85;
  if (weightKg > 0 && weightKg < 55) dose *= 0.85;
  if (weightKg >= 100) dose *= 1.1;
  if (dose >= 10) return Math.round(dose);
  return Math.round(dose * 10) / 10;
}

function resolveMedicationProfile(rawName, age, weightKg) {
  const matched = lookupMedicationProfile(rawName);
  const profile = matched ?? {
    displayName: simplifyMedicationDisplayName(rawName),
    doseMg: 10,
    frequency: 1,
    route: 'Oral',
    unit: 'mg',
  };
  return {
    ...profile,
    dose: adjustDose(profile.doseMg, age, weightKg),
  };
}

function profileByDisplayName(displayName) {
  return catalog.entries.find((entry) => entry.displayName.toLowerCase() === displayName.toLowerCase()) ?? {
    displayName,
    rxnormCode: undefined,
    doseMg: 10,
    frequency: 1,
    route: 'Oral',
    unit: 'mg',
  };
}

function buildDosageInstruction(profile, startDate, endDate) {
  const frequencyText = frequencyLabel(profile.frequency);
  return {
    text: `${profile.dose} ${profile.unit} ${frequencyText.toLowerCase()}`,
    route: { text: profile.route },
    timing: {
      code: { text: frequencyText },
      repeat: {
        frequency: profile.frequency,
        period: 1,
        periodUnit: 'd',
        boundsPeriod: endDate ? { start: startDate, end: endDate } : { start: startDate },
      },
    },
    doseAndRate: [{ doseQuantity: { value: profile.dose, unit: profile.unit } }],
  };
}

function medStartDate(med) {
  const raw =
    med.authoredOn ||
    med.dispenseRequest?.validityPeriod?.start ||
    med.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod?.start ||
    med.meta?.lastUpdated;
  if (!raw) return 0;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isCompletedStatus(status) {
  return ['completed', 'stopped', 'cancelled', 'discontinued'].includes((status || '').toLowerCase());
}

function sortMedicationsForRetention(medications) {
  return [...medications].sort((a, b) => {
    const statusA = STATUS_ORDER[a.status] ?? 8;
    const statusB = STATUS_ORDER[b.status] ?? 8;
    if (statusA !== statusB) return statusA - statusB;
    return medStartDate(b) - medStartDate(a);
  });
}

function dedupeMedicationsByName(medications) {
  const seen = new Set();
  const kept = [];

  for (const med of sortMedicationsForRetention(medications)) {
    const key = simplifyMedicationDisplayName(medRawName(med)).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(med);
  }

  return kept;
}

function markAsActive(med, age, weightKg, activeIndex) {
  const profile = resolveMedicationProfile(medRawName(med), age, weightKg);
  const startDaysAgo = 10 + activeIndex * 8;
  const startDate = isoDateDaysAgo(startDaysAgo);
  const updated = {
    ...med,
    status: 'active',
    medicationCodeableConcept: buildRxNormMedicationConcept(profile.displayName, profile.rxnormCode),
    authoredOn: startDate,
    dosageInstruction: [buildDosageInstruction(profile, startDate, undefined)],
  };
  delete updated.dispenseRequest;
  return updated;
}

function markAsCompleted(med, age, weightKg, completedIndex) {
  const profile = resolveMedicationProfile(medRawName(med), age, weightKg);
  const startDaysAgo = 210 + completedIndex * 40;
  const endDaysAgo = 25 + completedIndex * 6;
  const startDate = isoDateDaysAgo(startDaysAgo);
  const endDate = isoDateDaysAgo(endDaysAgo);

  return {
    ...med,
    status: 'completed',
    medicationCodeableConcept: buildRxNormMedicationConcept(profile.displayName, profile.rxnormCode),
    authoredOn: startDate,
    dosageInstruction: [buildDosageInstruction(profile, startDate, endDate)],
    dispenseRequest: { validityPeriod: { start: startDate, end: endDate } },
  };
}

function targetCompletedCount(patientId, totalMedications) {
  if (totalMedications <= 1) return 0;
  if (totalMedications === 2) return 1;
  const desired = 2 + (hashString(patientId) % 2);
  return Math.min(desired, totalMedications - 1);
}

function enrichMedicationsPreservingStatus(medications, age, weightKg) {
  const activeMeds = medications.filter((med) => !isCompletedStatus(med.status));
  const completedMeds = medications.filter((med) => isCompletedStatus(med.status));

  return [
    ...activeMeds.map((med, index) => markAsActive(med, age, weightKg, index)),
    ...completedMeds.map((med, index) => markAsCompleted(med, age, weightKg, index)),
  ];
}

function enrichMedication(med, age, weightKg, index, patientId) {
  const rawName = medRawName(med);
  const profile = resolveMedicationProfile(rawName, age, weightKg);
  const startDaysAgo = 120 - index * 9 + (hashString(`${patientId}-${med.id}`) % 14);
  const endDaysAgo = 10 + (hashString(`${med.id}-end`) % 18);
  const startDate =
    med.authoredOn ||
    med.dispenseRequest?.validityPeriod?.start ||
    med.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod?.start ||
    isoDateDaysAgo(Math.max(startDaysAgo, 7));
  const completed = isCompletedStatus(med.status);
  const endDate = completed
    ? med.dispenseRequest?.validityPeriod?.end ||
      med.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod?.end ||
      isoDateDaysAgo(endDaysAgo)
    : undefined;

  const updated = {
    ...med,
    medicationCodeableConcept: buildRxNormMedicationConcept(profile.displayName, profile.rxnormCode),
    authoredOn: startDate,
    dosageInstruction: [buildDosageInstruction(profile, startDate, endDate)],
  };

  if (completed) {
    updated.dispenseRequest = {
      ...(med.dispenseRequest || {}),
      validityPeriod: { start: startDate, end: endDate },
    };
  }

  return updated;
}

function buildMedicationRequest(patientId, displayName, age, weightKg, status, startDaysAgo, endDaysAgo) {
  const base = profileByDisplayName(displayName);
  const profile = {
    ...base,
    dose: adjustDose(base.doseMg, age, weightKg),
  };
  const startDate = isoDateDaysAgo(startDaysAgo);
  const endDate = isCompletedStatus(status) ? isoDateDaysAgo(endDaysAgo) : undefined;

  const request = {
    resourceType: 'MedicationRequest',
    status,
    intent: 'order',
    medicationCodeableConcept: buildRxNormMedicationConcept(profile.displayName, profile.rxnormCode),
    subject: { reference: `Patient/${patientId}` },
    authoredOn: startDate,
    dosageInstruction: [buildDosageInstruction(profile, startDate, endDate)],
  };

  if (endDate) {
    request.dispenseRequest = { validityPeriod: { start: startDate, end: endDate } };
  }

  return request;
}

function conditionDate(condition) {
  const raw = condition.recordedDate || condition.onsetDateTime || condition.meta?.lastUpdated;
  if (!raw) return new Date(0);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function isEnrolment(text) {
  const label = (text || '').toLowerCase();
  return label.includes('enrolment') || label.includes('enrollment');
}

function sortConditions(conditions) {
  return conditions
    .filter((condition) => !isEnrolment(condition.code?.text || condition.code?.coding?.[0]?.display))
    .sort((a, b) => conditionDate(b).getTime() - conditionDate(a).getTime());
}

function conditionText(condition) {
  const snomed = condition.code?.coding?.find(
    (coding) => coding.system === 'http://snomed.info/sct' && coding.code
  );
  if (snomed?.code === '709044004') return 'ckd';
  return (condition.code?.text || condition.code?.coding?.[0]?.display || '').toLowerCase();
}

function medsForConditionText(text) {
  const meds = [];
  const seen = new Set();

  for (const [label, names] of Object.entries(EXACT_CONDITION_MEDS)) {
    if (text.includes(label)) {
      for (const name of names) {
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        meds.push(name);
      }
    }
  }

  for (const rule of MEDICATION_RULES) {
    if (!rule.keywords.some((keyword) => text.includes(keyword))) continue;
    for (const name of rule.meds) {
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      meds.push(name);
    }
  }

  return meds;
}

/** Active meds driven by the patient's most recent problem-list conditions. */
function medsFromLatestConditions(sortedConditions) {
  const latestConditions = sortedConditions.slice(0, LATEST_CONDITIONS_TO_CONSIDER);
  const chosen = [];
  const seen = new Set();

  for (const condition of latestConditions) {
    for (const name of medsForConditionText(conditionText(condition))) {
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      chosen.push(name);
      if (chosen.length >= MAX_ACTIVE_MEDICATIONS) return chosen;
    }
  }

  if (latestConditions.length > 0) {
    for (const name of medsForConditionText(conditionText(latestConditions[0]))) {
      if (chosen.length >= MIN_ACTIVE_MEDICATIONS) break;
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      chosen.push(name);
    }
  }

  for (const name of DEFAULT_MED_NAMES) {
    if (chosen.length >= MIN_ACTIVE_MEDICATIONS) break;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    chosen.push(name);
  }

  return chosen.slice(0, MAX_ACTIVE_MEDICATIONS);
}

function medsForOlderConditions(sortedConditions) {
  const older = sortedConditions.slice(LATEST_CONDITIONS_TO_CONSIDER);
  const chosen = [];
  const seen = new Set();

  for (const condition of older) {
    for (const name of medsForConditionText(conditionText(condition))) {
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      chosen.push(name);
    }
  }

  return chosen;
}

function recommendedMedNames(sortedConditions) {
  return medsFromLatestConditions(sortedConditions);
}

async function fetchWeightKg(patientId) {
  const bundle = await fhirGet(`Observation?subject=Patient/${patientId}&code=29463-7&_sort=-date&_count=1`);
  const obs = bundle.entry?.[0]?.resource;
  const value = obs?.valueQuantity?.value;
  return typeof value === 'number' && value > 0 ? value : 0;
}

async function removeMedication(med) {
  try {
    await fhirDelete(`MedicationRequest/${med.id}`);
    return 'deleted';
  } catch {
    await fhirPut(`MedicationRequest/${med.id}`, { ...med, status: 'entered-in-error' });
    return 'hidden';
  }
}

async function main() {
  console.log(`Normalizing medications via ${API_BASE}\n`);

  const patientBundle = await fhirGet('Patient?_count=100');
  const patients = (patientBundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'Patient');

  for (const patient of patients) {
    const name = patientName(patient);
    const age = calculateAgeYears(patient.birthDate);
    const weightKg = await fetchWeightKg(patient.id);

    const conditionBundle = await fhirGet(`Condition?patient=${patient.id}`);
    const conditions = (conditionBundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'Condition');
    const sortedConditions = sortConditions(conditions);
    const latestConditionLabel = sortedConditions[0]
      ? sortedConditions[0].code?.text ||
        sortedConditions[0].code?.coding?.[0]?.display ||
        'Unknown'
      : 'None';
    const targetActiveMeds = medsFromLatestConditions(sortedConditions);
    const targetActiveSet = new Set(targetActiveMeds.map((medName) => medName.toLowerCase()));
    const completedCandidates = medsForOlderConditions(sortedConditions);

    const medBundle = await fhirGet(`MedicationRequest?patient=${patient.id}`);
    let medications = (medBundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'MedicationRequest')
      .filter((resource) => (resource.status || '').toLowerCase() !== 'entered-in-error');

    let removed = 0;
    let created = 0;
    let updated = 0;

    const surviving = [];

    for (const med of medications) {
      const medName = simplifyMedicationDisplayName(medRawName(med)).toLowerCase();
      const isActive = !isCompletedStatus(med.status);

      if (isActive && !targetActiveSet.has(medName)) {
        await removeMedication(med);
        removed += 1;
        continue;
      }

      surviving.push(med);
    }

    medications = dedupeMedicationsByName(surviving);
    const existingActiveNames = new Set(
      medications
        .filter((med) => !isCompletedStatus(med.status))
        .map((med) => simplifyMedicationDisplayName(medRawName(med)).toLowerCase())
    );

    for (let index = 0; index < targetActiveMeds.length; index += 1) {
      const medName = targetActiveMeds[index];
      if (existingActiveNames.has(medName.toLowerCase())) continue;

      const body = buildMedicationRequest(
        patient.id,
        medName,
        age,
        weightKg,
        'active',
        24 - index * 4,
        14
      );
      const createdMed = await fhirPost('MedicationRequest', body);
      medications.push(createdMed);
      existingActiveNames.add(medName.toLowerCase());
      created += 1;
    }

    let activeMeds = medications.filter((med) => !isCompletedStatus(med.status));
    let completedMeds = medications.filter((med) => isCompletedStatus(med.status));

    const completedTarget = targetCompletedCount(patient.id, Math.max(medications.length, MIN_MEDICATIONS));
    const desiredCompletedNames = new Set(
      completedMeds.map((med) => simplifyMedicationDisplayName(medRawName(med)).toLowerCase())
    );

    for (const medName of completedCandidates) {
      if (completedMeds.length >= completedTarget) break;
      if (targetActiveSet.has(medName.toLowerCase())) continue;
      if (desiredCompletedNames.has(medName.toLowerCase())) continue;

      const body = buildMedicationRequest(
        patient.id,
        medName,
        age,
        weightKg,
        'completed',
        180 - completedMeds.length * 30,
        20 + completedMeds.length * 5
      );
      const createdMed = await fhirPost('MedicationRequest', body);
      completedMeds.push(createdMed);
      medications.push(createdMed);
      desiredCompletedNames.add(medName.toLowerCase());
      created += 1;
    }

    while (completedMeds.length < completedTarget && completedMeds.length + activeMeds.length < MAX_MEDICATIONS) {
      const fallbackName = DEFAULT_MED_NAMES[completedMeds.length % DEFAULT_MED_NAMES.length];
      if (
        desiredCompletedNames.has(fallbackName.toLowerCase()) ||
        targetActiveSet.has(fallbackName.toLowerCase())
      ) {
        break;
      }

      const body = buildMedicationRequest(
        patient.id,
        fallbackName,
        age,
        weightKg,
        'completed',
        150 - completedMeds.length * 20,
        15
      );
      const createdMed = await fhirPost('MedicationRequest', body);
      completedMeds.push(createdMed);
      medications.push(createdMed);
      desiredCompletedNames.add(fallbackName.toLowerCase());
      created += 1;
    }

    const allMedications = [...medications];
    medications = dedupeMedicationsByName(allMedications);
    const keptIds = new Set(medications.map((med) => med.id));

    for (const med of allMedications) {
      if (keptIds.has(med.id)) continue;
      await removeMedication(med);
      removed += 1;
    }

    if (medications.length > MAX_MEDICATIONS) {
      const excess = medications.slice(MAX_MEDICATIONS);
      for (const med of excess) {
        await removeMedication(med);
        removed += 1;
      }
      medications = medications.slice(0, MAX_MEDICATIONS);
    }

    medications = enrichMedicationsPreservingStatus(medications, age, weightKg);
    for (const med of medications) {
      await fhirPut(`MedicationRequest/${med.id}`, med);
      updated += 1;
    }

    const activeCount = medications.filter((med) => !isCompletedStatus(med.status)).length;
    const completedCount = medications.length - activeCount;
    const activeNames = medications
      .filter((med) => !isCompletedStatus(med.status))
      .map((med) => simplifyMedicationDisplayName(medRawName(med)))
      .join(', ');

    console.log(
      `  ✓ ${name}: latest "${latestConditionLabel}" → active [${activeNames}] (${activeCount} active, ${completedCount} completed, +${created}, -${removed}, updated ${updated})`
    );
  }

  console.log('\nDone. Active medications now align with each patient\'s latest conditions.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
