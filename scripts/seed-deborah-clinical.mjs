/**
 * Seeds Deborah Jackson's clinical profile:
 * - MS diagnosis date: 04/09/2001
 * - EDSS scores every 6–8 months since diagnosis
 * - WBC count labs every 6–12 months since diagnosis
 * - Weight: once daily × 15 days
 * - O₂ saturation: every 2 days × past 15 days
 *
 * Usage: node scripts/seed-deborah-clinical.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  edssObservation,
  oxygenSaturationObservation,
  weightObservation,
  wbcObservation,
  LOINC,
} from './lib/loinc-observations.mjs';
import { EDSS_SNOMED_CODE, buildEdssScoreTimeline } from './lib/edss-timeline.mjs';
import { buildWbcTimeline } from './lib/wbc-timeline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TARGET_GIVEN = 'Deborah';
const TARGET_FAMILY = 'Jackson';
const MS_DIAGNOSIS_DATE = '2001-09-04T10:30:00.000Z';
const MS_RECORDED_DATE = '2001-09-04T14:15:00.000Z';
const CURRENT_EDSS = 5.5;
const VITAL_DAYS = 15;
const O2_INTERVAL_DAYS = 2;

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

async function fhirPut(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PUT ${path} failed (${res.status}): ${JSON.stringify(data)}`);
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

async function fhirDelete(path) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'DELETE',
    headers: authHeaders(false),
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`DELETE ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
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

function patientDisplayName(patient) {
  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  return [given, family].filter(Boolean).join(' ');
}

function matchesDeborahJackson(patient) {
  const given = (patient.name?.[0]?.given?.join(' ') || '').toLowerCase();
  const family = (patient.name?.[0]?.family || '').toLowerCase();
  return given.includes(TARGET_GIVEN.toLowerCase()) && family === TARGET_FAMILY.toLowerCase();
}

async function findDeborahJackson() {
  const searches = [
    `Patient?family=${encodeURIComponent(TARGET_FAMILY)}&given=${encodeURIComponent(TARGET_GIVEN)}`,
    `Patient?name=${encodeURIComponent(`${TARGET_GIVEN} ${TARGET_FAMILY}`)}`,
    `Patient?family=${encodeURIComponent(TARGET_FAMILY)}`,
  ];

  for (const path of searches) {
    const bundle = await fhirGet(path);
    const patients = (bundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'Patient');
    const match = patients.find(matchesDeborahJackson);
    if (match) return match;
  }

  return null;
}

async function findMsCondition(patientId) {
  const bundle = await fhirGet(`Condition?patient=${patientId}`);
  return (
    (bundle.entry || [])
      .map((entry) => entry.resource)
      .find((condition) => {
        const label = (
          condition?.code?.text ||
          condition?.code?.coding?.[0]?.display ||
          ''
        ).toLowerCase();
        return label.includes('multiple sclerosis') || /\bms\b/.test(label);
      }) ?? null
  );
}

async function fetchAllObservations(patientId, code) {
  const observations = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const bundle = await fhirGet(
      `Observation?subject=Patient/${patientId}&code=${code}&_count=${pageSize}&_offset=${offset}`
    );
    const page = (bundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'Observation');
    observations.push(...page);

    const total = bundle.total ?? observations.length;
    offset += pageSize;
    if (page.length === 0 || observations.length >= total) break;
  }

  return observations;
}

async function observationCount(patientId, code) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${code}&_count=1`
  );
  return bundle.total ?? bundle.entry?.length ?? 0;
}

async function postBatch(observations, batchSize = 10) {
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await Promise.all(batch.map((obs) => fhirPost('Observation', obs)));
  }
}

async function resolveBaseWeightKg(patientId) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${LOINC.bodyWeight}&_sort=-date&_count=1`
  );
  const latest = bundle.entry?.[0]?.resource?.valueQuantity?.value;
  if (typeof latest === 'number' && latest > 0) return latest;

  const patient = await fhirGet(`Patient/${patientId}`);
  const heightBundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=8302-2&_sort=-date&_count=1`
  );
  const heightCm = heightBundle.entry?.[0]?.resource?.valueQuantity?.value ?? 165;
  const birthYear = patient.birthDate ? new Date(patient.birthDate).getFullYear() : 1970;
  const age = new Date().getFullYear() - birthYear;
  const hash = hashString(`${patientId}-weight`);
  const targetBmi = 22 + seeded(hash) * 6;
  const ageAdjust = age >= 60 ? 0.97 : age >= 45 ? 1.0 : 1.02;
  return Math.round(targetBmi * (heightCm / 100) ** 2 * ageAdjust * 10) / 10;
}

function buildWeightReadings(patientId, baseWeightKg) {
  const observations = [];
  const now = new Date();

  for (let dayOffset = VITAL_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    const seed = hashString(`${patientId}-deborah-weight-${dayOffset}`);
    const drift = (VITAL_DAYS - dayOffset) * 0.015;
    const wobble = (seeded(seed) - 0.5) * 0.5;
    const weightKg = Math.round((baseWeightKg + drift + wobble) * 10) / 10;

    observations.push(weightObservation(patientId, atDayTime(day, 7, 30 + (dayOffset % 3) * 5), weightKg));
  }

  return observations;
}

function buildO2Readings(patientId) {
  const observations = [];
  const now = new Date();

  for (let dayOffset = VITAL_DAYS - 1; dayOffset >= 0; dayOffset -= O2_INTERVAL_DAYS) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    const seed = hashString(`${patientId}-deborah-o2-${dayOffset}`);
    const o2 = Math.round(94 + seeded(seed) * 4);
    observations.push(oxygenSaturationObservation(patientId, atDayTime(day, 10, 15), o2));
  }

  return observations;
}

function countRecentObservations(observations, days) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));

  return observations.filter((obs) => {
    const dateStr = obs.effectiveDateTime || obs.issued;
    if (!dateStr) return false;
    return new Date(dateStr) >= cutoff;
  }).length;
}

async function main() {
  console.log(`Seeding Deborah Jackson clinical data via ${API_BASE}\n`);

  const patient = await findDeborahJackson();
  if (!patient) {
    throw new Error(`Patient ${TARGET_GIVEN} ${TARGET_FAMILY} was not found.`);
  }

  const patientId = patient.id;
  console.log(`Found ${patientDisplayName(patient)} (Patient/${patientId})\n`);

  const msCondition = await findMsCondition(patientId);
  if (!msCondition) {
    throw new Error('No Multiple Sclerosis condition found — run add-deborah-ms-condition.mjs first.');
  }

  const updatedCondition = {
    ...msCondition,
    onsetDateTime: MS_DIAGNOSIS_DATE,
    recordedDate: MS_RECORDED_DATE,
  };
  await fhirPut(`Condition/${msCondition.id}`, updatedCondition);
  console.log(`✓ Updated MS diagnosis date to 04/09/2001 (Condition/${msCondition.id})`);

  const expectedEdss = buildEdssScoreTimeline(patientId, {
    diagnosisDate: MS_DIAGNOSIS_DATE,
    currentScore: CURRENT_EDSS,
  }).length;

  const existingEdss = await fetchAllObservations(patientId, EDSS_SNOMED_CODE);
  if (existingEdss.length > 0) {
    console.log(`→ Removing ${existingEdss.length} existing EDSS observation(s)`);
    for (const obs of existingEdss) {
      await fhirDelete(`Observation/${obs.id}`);
    }
  }

  const edssTimeline = buildEdssScoreTimeline(patientId, {
    diagnosisDate: MS_DIAGNOSIS_DATE,
    currentScore: CURRENT_EDSS,
  });
  const edssObs = edssTimeline.map(({ date, score }) => edssObservation(patientId, date, score));
  console.log(`→ Posting ${edssObs.length} EDSS scores (6–8 month intervals since 2001)`);
  await postBatch(edssObs);
  const latestEdss = edssTimeline[edssTimeline.length - 1];
  const earliestEdss = edssTimeline[0];
  console.log(
    `✓ EDSS range: ${earliestEdss.score} (${earliestEdss.date.slice(0, 10)}) → ${latestEdss.score} (${latestEdss.date.slice(0, 10)})`
  );

  const expectedWbc = buildWbcTimeline(patientId, { startDate: MS_DIAGNOSIS_DATE }).length;
  const wbcCount = await observationCount(patientId, LOINC.wbcCount);
  if (wbcCount >= expectedWbc) {
    console.log(`· Skipping WBC — already has ${wbcCount} reading(s)`);
  } else {
    const wbcTimeline = buildWbcTimeline(patientId, { startDate: MS_DIAGNOSIS_DATE });
    const wbcObs = wbcTimeline.map(({ date, value }) => wbcObservation(patientId, date, value));
    console.log(`→ Posting ${wbcObs.length} WBC observations (6–12 month intervals since 2001)`);
    await postBatch(wbcObs);
    const firstWbc = wbcTimeline[0];
    const lastWbc = wbcTimeline[wbcTimeline.length - 1];
    console.log(
      `✓ WBC range: ${firstWbc.value} → ${lastWbc.value} ×10⁹/L (${firstWbc.date.slice(0, 10)} to ${lastWbc.date.slice(0, 10)})`
    );
  }

  const baseWeightKg = await resolveBaseWeightKg(patientId);
  const weightObs = buildWeightReadings(patientId, baseWeightKg);
  const existingWeight = await fetchAllObservations(patientId, LOINC.bodyWeight);
  const recentWeightCount = countRecentObservations(existingWeight, VITAL_DAYS);

  if (recentWeightCount >= VITAL_DAYS) {
    console.log(`· Skipping weight — already has ${recentWeightCount} reading(s) in the past ${VITAL_DAYS} days`);
  } else {
    console.log(`→ Posting ${weightObs.length} weight observations (daily × ${VITAL_DAYS} days)`);
    await postBatch(weightObs);
    console.log(`✓ Weight readings seeded around ${baseWeightKg} kg`);
  }

  const o2Obs = buildO2Readings(patientId);
  const expectedO2 = o2Obs.length;
  const existingO2 = await fetchAllObservations(patientId, LOINC.oxygenSaturation);
  const recentO2Count = countRecentObservations(existingO2, VITAL_DAYS);

  if (recentO2Count >= expectedO2) {
    console.log(`· Skipping O₂ — already has ${recentO2Count} reading(s) in the past ${VITAL_DAYS} days`);
  } else {
    console.log(
      `→ Posting ${o2Obs.length} O₂ saturation observations (every ${O2_INTERVAL_DAYS} days × ${VITAL_DAYS} days)`
    );
    await postBatch(o2Obs);
    console.log('✓ O₂ saturation readings seeded');
  }

  console.log('\nDone. Refresh Deborah\'s chart to review EDSS, WBC, weight, and O₂ trends.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
