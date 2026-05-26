/**
 * Seeds Olivia Whittacker's clinical profile:
 * - Heart rate & BP: once daily × 14 days
 * - O2 sat & weight: once daily × 14 days
 * - Blood glucose: once weekly × 8 weeks (2 months)
 * - Multiple sclerosis — early stage (diagnosed April 1999)
 * - EDSS scores every 6–8 months since diagnosis
 *
 * Usage: node scripts/seed-olivia-clinical.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bloodPressureObservation,
  edssObservation,
  glucoseObservation,
  heartRateObservation,
  oxygenSaturationObservation,
  weightObservation,
} from './lib/loinc-observations.mjs';
import {
  MS_DIAGNOSIS_DATE,
  MS_RECORDED_DATE,
  EDSS_SNOMED_CODE,
  buildEdssScoreTimeline,
} from './lib/edss-timeline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TARGET_GIVEN = 'Olivia';
const TARGET_FAMILY = 'Whittacker';
const PATIENT_ID = '86206fa1-a2ff-45e9-a990-02160963fda6';

const VITAL_DAYS = 14;
const GLUCOSE_WEEKS = 8;
const CONDITION_TEXT = 'Multiple sclerosis - early stage';

function loadEnvLocal() {
  const envPath = resolve(ROOT, '.env.local');
  if (!existsSync(envPath)) return {};
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnvLocal();
const FHIR_TOKEN = env.FHIR_AUTH_TOKEN;
const API_BASE = (process.argv[2] || env.FHIR_BASE_URL || 'http://localhost:3000/api/fhir').replace(
  /\/$/,
  ''
);

function authHeaders(json = true) {
  const headers = { Accept: 'application/fhir+json' };
  if (json) headers['Content-Type'] = 'application/fhir+json';
  if (FHIR_TOKEN) headers.Authorization = `Bearer ${FHIR_TOKEN}`;
  return headers;
}

async function fhirGet(path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: authHeaders(false) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function fhirPost(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

function seeded(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function atDayTime(day, hour, minute = 0) {
  const at = new Date(day);
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
}

function buildCondition(patientId) {
  return {
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: 'confirmed',
          display: 'Confirmed',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'problem-list-item',
            display: 'Problem List Item',
          },
        ],
      },
    ],
    code: {
      text: CONDITION_TEXT,
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '24700007',
          display: 'Multiple sclerosis',
        },
      ],
    },
    subject: { reference: `Patient/${patientId}` },
    recordedDate: MS_RECORDED_DATE,
    onsetDateTime: MS_DIAGNOSIS_DATE,
  };
}

function buildDailyVitals(patientId) {
  const observations = [];
  const now = new Date();
  const baseWeightKg = 68.2;

  for (let dayOffset = VITAL_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    const daySeed = hashString(`${patientId}-olivia-day-${dayOffset}`);

    const heartRate = Math.round(68 + seeded(daySeed) * 14);
    observations.push(heartRateObservation(patientId, atDayTime(day, 8, 15), heartRate));

    const systolic = Math.round(116 + seeded(daySeed + 1) * 12);
    const diastolic = Math.round(72 + seeded(daySeed + 2) * 10);
    observations.push(
      bloodPressureObservation(patientId, atDayTime(day, 9, 20), systolic, diastolic)
    );

    const o2 = Math.round(95 + seeded(daySeed + 3) * 3);
    observations.push(oxygenSaturationObservation(patientId, atDayTime(day, 10, 10), o2));

    const weightKg =
      Math.round((baseWeightKg + (seeded(daySeed + 4) - 0.5) * 0.6) * 10) / 10;
    observations.push(weightObservation(patientId, atDayTime(day, 7, 45), weightKg));
  }

  return observations;
}

function buildWeeklyGlucose(patientId) {
  const observations = [];
  const now = new Date();

  for (let weekOffset = GLUCOSE_WEEKS - 1; weekOffset >= 0; weekOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - weekOffset * 7);

    const seed = hashString(`${patientId}-glucose-${weekOffset}`);
    const glucose = Math.round(92 + seeded(seed) * 18);
    observations.push(glucoseObservation(patientId, atDayTime(day, 7, 30), glucose));
  }

  return observations;
}

function buildEdssScores(patientId) {
  return buildEdssScoreTimeline(patientId, { currentScore: 6.5 }).map(({ date, score }) =>
    edssObservation(patientId, date, score)
  );
}

async function hasCondition(patientId, text) {
  const bundle = await fhirGet(`Condition?patient=${patientId}`);
  return (
    bundle.entry?.some((entry) => {
      const condition = entry.resource;
      const label = (
        condition?.code?.text ||
        condition?.code?.coding?.[0]?.display ||
        ''
      ).toLowerCase();
      return label.includes('multiple sclerosis');
    }) ?? false
  );
}

async function observationCount(patientId, code) {
  const bundle = await fhirGet(`Observation?subject=Patient/${patientId}&code=${code}&_count=1`);
  return bundle.total ?? bundle.entry?.length ?? 0;
}

async function postBatch(observations, batchSize = 10) {
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await Promise.all(batch.map((obs) => fhirPost('Observation', obs)));
  }
}

async function resolvePatientId() {
  try {
    const patient = await fhirGet(`Patient/${PATIENT_ID}`);
    if (patient.resourceType === 'Patient') return patient;
  } catch {
    // fall through to name search
  }

  const bundle = await fhirGet(
    `Patient?family=${encodeURIComponent(TARGET_FAMILY)}&given=${encodeURIComponent(TARGET_GIVEN)}`
  );
  const match = (bundle.entry || [])
    .map((entry) => entry.resource)
    .find(
      (resource) =>
        resource?.resourceType === 'Patient' &&
        (resource.name?.[0]?.given?.join(' ') || '').toLowerCase().includes(TARGET_GIVEN.toLowerCase()) &&
        (resource.name?.[0]?.family || '').toLowerCase() === TARGET_FAMILY.toLowerCase()
    );

  if (!match) {
    throw new Error(`Patient ${TARGET_GIVEN} ${TARGET_FAMILY} was not found.`);
  }
  return match;
}

async function main() {
  console.log(`Seeding ${TARGET_GIVEN} ${TARGET_FAMILY} clinical profile via ${API_BASE}\n`);

  const patient = await resolvePatientId();
  const patientId = patient.id;
  const name = `${patient.name?.[0]?.given?.join(' ') || TARGET_GIVEN} ${patient.name?.[0]?.family || TARGET_FAMILY}`;
  console.log(`Found ${name} (Patient/${patientId})\n`);

  if (await hasCondition(patientId, CONDITION_TEXT)) {
    console.log(`· Condition already exists: ${CONDITION_TEXT}`);
  } else {
    const created = await fhirPost('Condition', buildCondition(patientId));
    console.log(`✓ Added condition: ${CONDITION_TEXT} (Condition/${created.id})`);
  }

  const hrCount = await observationCount(patientId, '8867-4');
  if (hrCount >= VITAL_DAYS) {
    console.log(`· Skipping daily vitals — already has ${hrCount} heart rate reading(s)`);
  } else {
    const dailyVitals = buildDailyVitals(patientId);
    console.log(`→ Posting daily vitals: ${dailyVitals.length} observations (${VITAL_DAYS} days)`);
    await postBatch(dailyVitals);
    console.log('✓ Posted daily vitals');
  }

  const glucoseCount = await observationCount(patientId, '15074-8');
  if (glucoseCount >= GLUCOSE_WEEKS) {
    console.log(`· Skipping glucose — already has ${glucoseCount} reading(s)`);
  } else {
    const glucoseObs = buildWeeklyGlucose(patientId);
    console.log(`→ Posting weekly glucose: ${glucoseObs.length} observations (${GLUCOSE_WEEKS} weeks)`);
    await postBatch(glucoseObs);
    console.log('✓ Posted weekly glucose');
  }

  const edssCount = await observationCount(patientId, EDSS_SNOMED_CODE);
  const expectedEdss = buildEdssScoreTimeline(patientId, { currentScore: 6.5 }).length;
  if (edssCount >= expectedEdss) {
    console.log(`· Skipping EDSS scores — already has ${edssCount} reading(s)`);
  } else {
    const edssObs = buildEdssScores(patientId);
    console.log(
      `→ Posting EDSS scores: ${edssObs.length} observations (6–8 month intervals since diagnosis)`
    );
    await postBatch(edssObs);
    console.log('✓ Posted EDSS scores');
  }

  console.log('\nDone. Refresh Olivia\'s chart to review vitals, labs, condition, and EDSS trend.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
