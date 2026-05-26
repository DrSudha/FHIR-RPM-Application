/**
 * Updates Jonathan Newberhoff medications for AF, cardiovascular care, and Type 2 DM:
 * - Marks existing active meds as stopped (inactive)
 * - Adds new active cardiac and glucose-control medications
 *
 * Usage: node scripts/seed-jonathan-newberhoff-medications.mjs [baseUrl]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(__dirname, '../src/data/medication-catalog.json'), 'utf8')
);

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const PATIENT_ID = '963ea7ba-7405-4186-9548-65c87e4cad97';
const PATIENT_NAME = 'Jonathan Newberhoff';

const NEW_ACTIVE_MEDS = [
  { name: 'Metoprolol', startDaysAgo: 45, reason: 'AF rate control' },
  { name: 'Warfarin', startDaysAgo: 42, reason: 'AF anticoagulation' },
  { name: 'Metformin', startDaysAgo: 38, reason: 'Type 2 DM' },
  { name: 'Empagliflozin', startDaysAgo: 30, reason: 'Glucose control / CV benefit' },
  { name: 'Atorvastatin', startDaysAgo: 28, reason: 'Lipid / cardiovascular risk' },
  { name: 'Lisinopril', startDaysAgo: 21, reason: 'Blood pressure / renal protection' },
];

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

function isoDateDaysAgo(daysAgo, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function frequencyLabel(frequency) {
  if (frequency === 1) return 'Once daily';
  if (frequency === 2) return 'Twice daily';
  if (frequency === 3) return 'Three times daily';
  return `${frequency}x daily`;
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

function profileByDisplayName(displayName) {
  return (
    catalog.entries.find((entry) => entry.displayName.toLowerCase() === displayName.toLowerCase()) ?? {
      displayName,
      doseMg: 10,
      frequency: 1,
      route: 'Oral',
      unit: 'mg',
    }
  );
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

function medRawName(med) {
  return (
    med.medicationCodeableConcept?.text ||
    med.medicationCodeableConcept?.coding?.[0]?.display ||
    med.medicationReference?.display ||
    ''
  );
}

function isActiveStatus(status) {
  return (status || '').toLowerCase() === 'active';
}

function buildMedicationRequest(patientId, displayName, age, weightKg, status, startDaysAgo, endDaysAgo) {
  const base = profileByDisplayName(displayName);
  const profile = {
    ...base,
    dose: adjustDose(base.doseMg, age, weightKg),
  };
  const startDate = isoDateDaysAgo(startDaysAgo);
  const endDate = endDaysAgo != null ? isoDateDaysAgo(endDaysAgo) : undefined;

  const request = {
    resourceType: 'MedicationRequest',
    status,
    intent: 'order',
    medicationCodeableConcept: { text: profile.displayName },
    subject: { reference: `Patient/${patientId}` },
    authoredOn: startDate,
    dosageInstruction: [buildDosageInstruction(profile, startDate, endDate)],
  };

  if (endDate) {
    request.dispenseRequest = { validityPeriod: { start: startDate, end: endDate } };
  }

  return request;
}

function markMedicationStopped(med, age, weightKg, endDaysAgo = 18) {
  const profile = profileByDisplayName(medRawName(med));
  const resolved = {
    ...profile,
    dose: adjustDose(profile.doseMg, age, weightKg),
  };
  const startDate =
    med.authoredOn ||
    med.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod?.start ||
    isoDateDaysAgo(120);
  const endDate = isoDateDaysAgo(endDaysAgo);

  return {
    ...med,
    resourceType: 'MedicationRequest',
    status: 'stopped',
    medicationCodeableConcept: {
      ...(med.medicationCodeableConcept || {}),
      text: resolved.displayName,
    },
    dosageInstruction: [buildDosageInstruction(resolved, startDate, endDate)],
    dispenseRequest: { validityPeriod: { start: startDate, end: endDate } },
  };
}

async function fetchWeightKg(patientId) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=29463-7&_sort=-date&_count=1`
  );
  const value = bundle.entry?.[0]?.resource?.valueQuantity?.value;
  return typeof value === 'number' && value > 0 ? value : 90;
}

async function main() {
  console.log(`Updating medications for ${PATIENT_NAME} via ${API_BASE}\n`);

  const patient = await fhirGet(`Patient/${PATIENT_ID}`);
  if (patient.resourceType !== 'Patient') {
    throw new Error(`Patient/${PATIENT_ID} not found`);
  }

  const age = calculateAgeYears(patient.birthDate);
  const weightKg = await fetchWeightKg(PATIENT_ID);

  const medBundle = await fhirGet(`MedicationRequest?patient=${PATIENT_ID}`);
  const medications = (medBundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'MedicationRequest');

  const existingActiveNames = new Set(
    medications
      .filter((med) => isActiveStatus(med.status))
      .map((med) => medRawName(med).toLowerCase())
  );

  for (const med of medications) {
    if (!isActiveStatus(med.status)) continue;

    const stopped = markMedicationStopped(med, age, weightKg);
    await fhirPut(`MedicationRequest/${med.id}`, stopped);
    console.log(`✓ Stopped: ${medRawName(med)}`);
  }

  for (const { name, startDaysAgo, reason } of NEW_ACTIVE_MEDS) {
    if (existingActiveNames.has(name.toLowerCase())) {
      console.log(`· Already active: ${name}`);
      continue;
    }

    const duplicate = medications.some(
      (med) =>
        isActiveStatus(med.status) && medRawName(med).toLowerCase() === name.toLowerCase()
    );
    if (duplicate) continue;

    const body = buildMedicationRequest(
      PATIENT_ID,
      name,
      age,
      weightKg,
      'active',
      startDaysAgo,
      undefined
    );
    const created = await fhirPost('MedicationRequest', body);
    console.log(`✓ Added active: ${name} — ${reason} (MedicationRequest/${created.id})`);
  }

  console.log(`\nDone. Refresh ${PATIENT_NAME}'s chart to review active and inactive medications.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
