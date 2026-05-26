/**
 * Seeds weekly LDL, HDL, and triglyceride panels for diabetic care patients.
 * One lipid panel per week for the past ~6 months (26 weeks), with randomized values.
 *
 * Usage: node scripts/seed-diabetic-lipids-weekly.mjs [baseUrl]
 */

import { LOINC, lipidObservation } from './lib/loinc-observations.mjs';

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const WEEKS = 26;
const LIPID_HOUR = 9;

const TARGET_PATIENTS = [
  { id: '4be2f5e1-8740-4c6b-beb9-697337ffb95e', name: 'Sarah Mary Davis' },
  { id: '62f60bdb-cc5c-8305-b98b-f2b229a55eca', name: 'Angel Rocio Konopelski' },
];

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

function toWeekKey(date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function atDayTime(day, hour, minute = 0) {
  const at = new Date(day);
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
}

function resolveLipidPanel(patientId, weekIndex) {
  const seed = hashString(`${patientId}-lipid-week-${weekIndex}`);

  return {
    ldl: Math.round(96 + seeded(seed) * 68),
    hdl: Math.round(34 + seeded(seed + 1) * 24),
    tg: Math.round(112 + seeded(seed + 2) * 168),
  };
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

async function existingLdlWeekKeys(patientId) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${LOINC.ldlCholesterol}&_sort=-date&_count=100`
  );
  const keys = new Set();

  for (const entry of bundle.entry || []) {
    const iso = entry.resource?.effectiveDateTime;
    if (!iso) continue;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    keys.add(toWeekKey(date));
  }

  return keys;
}

function buildWeeklyLipidObservations(patientId, existingWeekKeys) {
  const observations = [];
  const now = new Date();

  for (let weekIndex = 0; weekIndex < WEEKS; weekIndex += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - weekIndex * 7);

    const dayJitter = hashString(`${patientId}-lipid-day-${weekIndex}`) % 3;
    day.setDate(day.getDate() - dayJitter);

    const weekKey = toWeekKey(day);
    if (existingWeekKeys.has(weekKey)) continue;

    const minute = 10 + (hashString(`${patientId}-lipid-minute-${weekIndex}`) % 45);
    const iso = atDayTime(day, LIPID_HOUR, minute);
    const panel = resolveLipidPanel(patientId, weekIndex);

    observations.push(
      lipidObservation(patientId, iso, LOINC.ldlCholesterol, panel.ldl),
      lipidObservation(patientId, iso, LOINC.hdlCholesterol, panel.hdl),
      lipidObservation(patientId, iso, LOINC.triglycerides, panel.tg)
    );
  }

  return observations;
}

async function postBatch(observations, batchSize = 9) {
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await Promise.all(batch.map((obs) => fhirPost('Observation', obs)));
  }
}

async function main() {
  console.log(`Seeding weekly lipid panels (${WEEKS} weeks) via ${API_BASE}\n`);

  for (const patient of TARGET_PATIENTS) {
    const existingWeekKeys = await existingLdlWeekKeys(patient.id);
    const observations = buildWeeklyLipidObservations(patient.id, existingWeekKeys);

    if (observations.length === 0) {
      console.log(`· ${patient.name}: all ${WEEKS} weekly panels already present`);
      continue;
    }

    const panelCount = observations.length / 3;
    console.log(`→ ${patient.name}: posting ${panelCount} weekly panel(s) (${observations.length} observations)`);
    await postBatch(observations);
    console.log(`✓ ${patient.name}: done\n`);
  }

  console.log('Done. Open each patient chart — Laboratory tests chart and table should show lipid results.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
