/**
 * Seeds daily step count and sleep duration observations (LOINC) for all patients.
 * Ensures 14 days of step + sleep data (backfills missing days).
 *
 * Usage: node scripts/seed-wearable-steps-sleep.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOINC,
  stepCountObservation,
  sleepDurationObservation,
} from './lib/loinc-observations.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DAYS = 14;

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

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function seeded(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function atDayTime(day, hour, minute = 0) {
  const at = new Date(day);
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
}

function dayKey(isoOrDate) {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return date.toISOString().slice(0, 10);
}

function patientName(patient) {
  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  return [given, family].filter(Boolean).join(' ') || patient.id;
}

function buildObservationsForDay(patientId, dayOffset) {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - dayOffset);

  const stepSeed = hashString(`${patientId}-steps-${dayOffset}`);
  const base = 5200 + (hashString(patientId) % 2800);
  const weekdayAdjust = day.getDay() === 0 || day.getDay() === 6 ? 900 : 0;
  const steps = Math.round(base + weekdayAdjust + seeded(stepSeed) * 3200);

  const sleepSeed = hashString(`${patientId}-sleep-${dayOffset}`);
  const hours = Math.round((5.2 + seeded(sleepSeed) * 3.4) * 10) / 10;

  return [
    stepCountObservation(patientId, atDayTime(day, 23, 59), steps),
    sleepDurationObservation(patientId, atDayTime(day, 7, 0), hours),
  ];
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

async function existingDayKeys(patientId, code) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${code}&_sort=-date&_count=100`
  );
  const keys = new Set();
  (bundle.entry || []).forEach((entry) => {
    const obs = entry.resource;
    const dateStr = obs?.effectiveDateTime || obs?.issued;
    if (dateStr) keys.add(dayKey(dateStr));
  });
  return keys;
}

async function postBatch(observations, batchSize = 10) {
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await Promise.all(batch.map((obs) => fhirPost('Observation', obs)));
  }
}

async function main() {
  console.log(`Seeding ${DAYS}-day wearable step/sleep data via ${API_BASE}\n`);

  const patientBundle = await fhirGet('Patient?_count=200');
  const patients = (patientBundle.entry || []).map((entry) => entry.resource).filter(Boolean);

  if (patients.length === 0) {
    console.log('No patients found.');
    return;
  }

  let totalPosted = 0;

  for (const patient of patients) {
    const name = patientName(patient);
    const [stepDays, sleepDays] = await Promise.all([
      existingDayKeys(patient.id, LOINC.stepCount),
      existingDayKeys(patient.id, LOINC.sleepDuration),
    ]);

    const observations = [];
    for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - dayOffset);
      const key = dayKey(day);

      const [stepObs, sleepObs] = buildObservationsForDay(patient.id, dayOffset);
      if (!stepDays.has(key)) observations.push(stepObs);
      if (!sleepDays.has(key)) observations.push(sleepObs);
    }

    if (observations.length === 0) {
      console.log(`· ${name}: already has ${DAYS} days of step/sleep data`);
      continue;
    }

    await postBatch(observations);
    totalPosted += observations.length;
    console.log(`✓ ${name}: posted ${observations.length} observation(s)`);
  }

  console.log(`\nDone. Posted ${totalPosted} LOINC activity observations.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
