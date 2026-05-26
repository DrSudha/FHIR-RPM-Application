/**
 * Backfills LDL, HDL, and triglycerides to 6 monthly readings for cardiovascular
 * care enrolment patients. Skips months that already have an LDL observation.
 *
 * Usage: node scripts/backfill-cardiac-lipid-6months.mjs [baseUrl]
 */

import { LOINC, lipidObservation } from './lib/loinc-observations.mjs';

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const CARDIAC_ENROLMENT = 'cardiovascular care enrolment';
const LIPID_MONTHS = 6;
const LIPID_HOUR = 10;

const PATIENT_PROFILES = [
  {
    label: 'Jessica Thomas',
    lipidsByMonth: [
      { ldl: 118, hdl: 38, tg: 185 },
      { ldl: 98, hdl: 42, tg: 145 },
      { ldl: 142, hdl: 45, tg: 260 },
      { ldl: 125, hdl: 40, tg: 195 },
      { ldl: 108, hdl: 37, tg: 170 },
      { ldl: 134, hdl: 35, tg: 210 },
    ],
  },
  {
    label: 'Jonathan Newberhoff',
    lipidsByMonth: [
      { ldl: 132, hdl: 52, tg: 168 },
      { ldl: 115, hdl: 55, tg: 152 },
      { ldl: 104, hdl: 58, tg: 138 },
      { ldl: 145, hdl: 48, tg: 182 },
      { ldl: 138, hdl: 50, tg: 175 },
      { ldl: 148, hdl: 46, tg: 190 },
    ],
  },
  {
    label: 'Marcus Sterling',
    lipidsByMonth: [
      { ldl: 156, hdl: 36, tg: 220 },
      { ldl: 128, hdl: 39, tg: 178 },
      { ldl: 110, hdl: 44, tg: 155 },
      { ldl: 165, hdl: 34, tg: 240 },
      { ldl: 148, hdl: 37, tg: 205 },
      { ldl: 172, hdl: 32, tg: 255 },
    ],
  },
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

function atDayTime(day, hour, minute = 0) {
  const at = new Date(day);
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
}

function toDayKey(isoOrDate) {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function patientName(patient) {
  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  return [given, family].filter(Boolean).join(' ') || patient.id;
}

function isCardiacEnrolment(text) {
  return (text || '').toLowerCase().trim() === CARDIAC_ENROLMENT;
}

async function findCardiacCarePatients() {
  const patientBundle = await fhirGet('Patient?_count=100');
  const patients = (patientBundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'Patient');

  const cardiac = [];
  for (const patient of patients) {
    const conditionBundle = await fhirGet(`Condition?patient=${patient.id}`);
    const conditions = (conditionBundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'Condition');
    if (conditions.some((condition) => isCardiacEnrolment(condition.code?.text))) {
      cardiac.push(patient);
    }
  }
  return cardiac;
}

async function existingLdlDayKeys(patientId) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${LOINC.ldlCholesterol}&_sort=-date&_count=100`
  );
  const keys = new Set();
  for (const entry of bundle.entry || []) {
    const iso = entry.resource?.effectiveDateTime;
    if (iso) keys.add(toDayKey(iso));
  }
  return keys;
}

function buildMissingLipidObservations(patientId, patientIndex, existingKeys) {
  const profile = PATIENT_PROFILES[patientIndex % PATIENT_PROFILES.length];
  const observations = [];
  const now = new Date();

  for (let month = 0; month < LIPID_MONTHS; month += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - month * 30);

    const dayKey = toDayKey(day);
    if (existingKeys.has(dayKey)) continue;

    const panel = profile.lipidsByMonth[month];
    const iso = atDayTime(day, LIPID_HOUR, 0);

    observations.push(
      lipidObservation(patientId, iso, LOINC.ldlCholesterol, panel.ldl),
      lipidObservation(patientId, iso, LOINC.hdlCholesterol, panel.hdl),
      lipidObservation(patientId, iso, LOINC.triglycerides, panel.tg)
    );
  }

  return { observations, profile };
}

async function postBatch(observations, batchSize = 9) {
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await Promise.all(batch.map((obs) => fhirPost('Observation', obs)));
  }
}

async function main() {
  console.log(`Backfilling cardiac lipid panels to ${LIPID_MONTHS} months via ${API_BASE}\n`);

  const patients = await findCardiacCarePatients();
  if (patients.length === 0) {
    console.log('No cardiovascular care enrolment patients found.');
    return;
  }

  for (let index = 0; index < patients.length; index += 1) {
    const patient = patients[index];
    const name = patientName(patient);
    const existingKeys = await existingLdlDayKeys(patient.id);
    const { observations, profile } = buildMissingLipidObservations(
      patient.id,
      index,
      existingKeys
    );

    if (observations.length === 0) {
      console.log(`· ${name} — already has ${existingKeys.size} monthly LDL reading(s)`);
      continue;
    }

    const panelsAdded = observations.length / 3;
    console.log(
      `→ ${name} (${patient.id}) — adding ${panelsAdded} month(s), profile: ${profile.label}`
    );
    await postBatch(observations);
    console.log(`  ✓ Posted ${observations.length} lipid observations\n`);
  }

  console.log('Done. Refresh patient charts — lipid panel chart shows 6 months.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
