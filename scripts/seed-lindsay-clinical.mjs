/**
 * Seeds Lindsay Michelle Zieme's clinical profile:
 * - Heart rate, BP, O₂ saturation, weight: once daily × 15 days
 * - eGFR: every 6 months × past 5 years (declining trend with abnormal readings)
 *
 * Usage: node scripts/seed-lindsay-clinical.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bloodPressureObservation,
  egfrObservation,
  heartRateObservation,
  oxygenSaturationObservation,
  weightObservation,
  LOINC,
} from './lib/loinc-observations.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PATIENT_ID = '46976cf7-b0bf-be20-39a5-9f425a52886d';
const TARGET_NAME = 'Lindsay Michelle Zieme';
const VITAL_DAYS = 15;
const EGFR_YEARS = 5;
const EGFR_INTERVAL_MONTHS = 6;

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

function addMonths(date, months) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== day) next.setDate(0);
  return next;
}

async function observationCount(patientId, code) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${code}&_count=1`
  );
  return bundle.total ?? bundle.entry?.length ?? 0;
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

async function fetchObservations(patientId, code) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${code}&_sort=-date&_count=100`
  );
  return (bundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'Observation');
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
  const birthYear = patient.birthDate ? new Date(patient.birthDate).getFullYear() : 1985;
  const age = new Date().getFullYear() - birthYear;
  const hash = hashString(`${patientId}-weight`);
  const targetBmi = 23 + seeded(hash) * 4;
  const ageAdjust = age >= 50 ? 0.98 : 1.0;
  return Math.round(targetBmi * (heightCm / 100) ** 2 * ageAdjust * 10) / 10;
}

function buildDailyVitals(patientId, baseWeightKg) {
  const observations = [];
  const now = new Date();

  for (let dayOffset = VITAL_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    const seed = hashString(`${patientId}-lindsay-day-${dayOffset}`);

    const heartRate = Math.round(70 + seeded(seed) * 12);
    observations.push(heartRateObservation(patientId, atDayTime(day, 8, 15), heartRate));

    const systolic = Math.round(118 + seeded(seed + 1) * 14);
    const diastolic = Math.round(72 + seeded(seed + 2) * 10);
    observations.push(
      bloodPressureObservation(patientId, atDayTime(day, 8, 45), systolic, diastolic)
    );

    const o2 = Math.round(96 + seeded(seed + 3) * 3);
    observations.push(oxygenSaturationObservation(patientId, atDayTime(day, 9, 20), o2));

    const drift = (VITAL_DAYS - dayOffset) * 0.012;
    const wobble = (seeded(seed + 4) - 0.5) * 0.45;
    const weightKg = Math.round((baseWeightKg + drift + wobble) * 10) / 10;
    observations.push(weightObservation(patientId, atDayTime(day, 7, 30), weightKg));
  }

  return observations;
}

/** Declining eGFR with recent values below 60 mL/min/1.73m² (CKD stage 3). */
function buildEgfrTimeline(patientId) {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - EGFR_YEARS);
  start.setHours(9, 0, 0, 0);

  const schedule = [];
  let current = new Date(start);
  while (current.getTime() <= end.getTime()) {
    schedule.push(new Date(current));
    current = addMonths(current, EGFR_INTERVAL_MONTHS);
  }

  const targetValues = [92, 88, 84, 78, 71, 64, 57, 53, 49, 45, 41];

  return schedule.map((date, index) => {
    const base = targetValues[Math.min(index, targetValues.length - 1)];
    const noise = Math.round((seeded(hashString(`${patientId}-lindsay-egfr-${index}`)) - 0.5) * 4);
    let value = base + noise;
    value = Math.max(35, Math.min(105, value));

    const at = new Date(date);
    at.setHours(9, 30, 0, 0);

    return { date: at.toISOString(), value };
  });
}

async function removeWbcObservations(patientId) {
  const existing = await fetchAllObservations(patientId, LOINC.wbcCount);
  if (existing.length === 0) return 0;

  console.log(`→ Removing ${existing.length} prior WBC observation(s)`);
  for (const obs of existing) {
    await fhirDelete(`Observation/${obs.id}`);
  }
  console.log('✓ Cleared WBC readings');
  return existing.length;
}

async function main() {
  console.log(`Seeding ${TARGET_NAME} clinical data via ${API_BASE}\n`);

  const patient = await fhirGet(`Patient/${PATIENT_ID}`);
  if (patient.resourceType !== 'Patient') {
    throw new Error(`Patient/${PATIENT_ID} not found`);
  }

  console.log(`Found ${TARGET_NAME} (Patient/${PATIENT_ID})\n`);

  await removeWbcObservations(PATIENT_ID);

  const baseWeightKg = await resolveBaseWeightKg(PATIENT_ID);
  const vitalObs = buildDailyVitals(PATIENT_ID, baseWeightKg);

  const hrExisting = await fetchObservations(PATIENT_ID, LOINC.heartRate);
  const recentHr = countRecentObservations(hrExisting, VITAL_DAYS);

  if (recentHr >= VITAL_DAYS) {
    console.log(`· Skipping daily vitals — already has ${recentHr} heart rate reading(s) in past ${VITAL_DAYS} days`);
  } else {
    console.log(
      `→ Posting ${vitalObs.length} vital observations (HR, BP, O₂, weight × ${VITAL_DAYS} days)`
    );
    await postBatch(vitalObs);
    console.log(`✓ Daily vitals seeded (weight baseline ~${baseWeightKg} kg)`);
  }

  const expectedEgfr = buildEgfrTimeline(PATIENT_ID).length;
  const egfrCount = await observationCount(PATIENT_ID, LOINC.egfr);

  if (egfrCount >= expectedEgfr) {
    console.log(`· Skipping eGFR — already has ${egfrCount} reading(s)`);
  } else {
    const egfrTimeline = buildEgfrTimeline(PATIENT_ID);
    const egfrObs = egfrTimeline.map(({ date, value }) =>
      egfrObservation(PATIENT_ID, date, value)
    );
    console.log(
      `→ Posting ${egfrObs.length} eGFR observations (every ${EGFR_INTERVAL_MONTHS} months × ${EGFR_YEARS} years)`
    );
    await postBatch(egfrObs);

    const first = egfrTimeline[0];
    const last = egfrTimeline[egfrTimeline.length - 1];
    const abnormalCount = egfrTimeline.filter((entry) => entry.value < 60).length;
    console.log(
      `✓ eGFR range: ${first.value} → ${last.value} mL/min/1.73m² (${first.date.slice(0, 10)} to ${last.date.slice(0, 10)})`
    );
    console.log(`✓ ${abnormalCount} abnormal reading(s) below 60 mL/min/1.73m²`);
  }

  console.log("\nDone. Refresh Lindsay's chart to review vitals and eGFR trends.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
