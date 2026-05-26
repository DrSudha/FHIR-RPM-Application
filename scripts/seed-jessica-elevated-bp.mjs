/**
 * Adds recent elevated blood pressure readings for Jessica Thomas so the
 * "2 cardiac patients" BP notification matches FHIR data.
 *
 * Usage: node scripts/seed-jessica-elevated-bp.mjs [baseUrl]
 */

import { LOINC, bloodPressureObservation } from './lib/loinc-observations.mjs';

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const PATIENT_ID = '5785016a-c621-48e3-bb7e-3fbf4e1f39ee';
const PATIENT_NAME = 'Jessica Thomas';

function atTodayTime(hour, minute = 0) {
  const at = new Date();
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
}

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

async function hasRecentElevatedBp(patientId) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${LOINC.bloodPressurePanel}&_sort=-date&_count=20`
  );

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  for (const entry of bundle.entry || []) {
    const obs = entry.resource;
    const at = new Date(obs?.effectiveDateTime || obs?.issued || 0).getTime();
    if (Number.isNaN(at) || at < cutoff) continue;

    const systolic = obs?.component?.find((comp) =>
      comp.code?.coding?.some((coding) => coding.code === LOINC.systolicBloodPressure)
    )?.valueQuantity?.value;

    if (typeof systolic === 'number' && systolic >= 140) {
      return true;
    }
  }

  return false;
}

async function main() {
  const patient = await fhirGet(`Patient/${PATIENT_ID}`);
  if (patient.resourceType !== 'Patient') {
    throw new Error(`Patient/${PATIENT_ID} not found`);
  }

  if (await hasRecentElevatedBp(PATIENT_ID)) {
    console.log(`${PATIENT_NAME} already has elevated BP in the last 24 hours — skipping.`);
    return;
  }

  const observations = [
    bloodPressureObservation(PATIENT_ID, atTodayTime(8, 25), 152, 94),
    bloodPressureObservation(PATIENT_ID, atTodayTime(20, 10), 146, 88),
  ];

  console.log(`Posting ${observations.length} elevated BP reading(s) for ${PATIENT_NAME}...\n`);

  for (const observation of observations) {
    const created = await fhirPost('Observation', observation);
    const systolic = observation.component[0].valueQuantity.value;
    const diastolic = observation.component[1].valueQuantity.value;
    console.log(
      `✓ ${observation.effectiveDateTime}: ${systolic}/${diastolic} mmHg (Observation/${created.id})`
    );
  }

  console.log('\nDone. The elevated BP notification should now include Jessica Thomas.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
