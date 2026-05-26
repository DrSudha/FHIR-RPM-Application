/**
 * Backfill 555-xxx-xxxx phone numbers for patients missing telecom phone.
 *
 * Usage:
 *   node scripts/backfill-patient-phones.mjs
 *   node scripts/backfill-patient-phones.mjs http://localhost:3000/api/fhir
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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
const API_BASE = (process.argv[2] || env.FHIR_BASE_URL || 'http://localhost:3000/api/fhir').replace(/\/$/, '');

function authHeaders(json = true) {
  const headers = { Accept: 'application/fhir+json' };
  if (json) headers['Content-Type'] = 'application/fhir+json';
  if (FHIR_TOKEN) headers.Authorization = `Bearer ${FHIR_TOKEN}`;
  return headers;
}

async function fhirFetch(url) {
  const res = await fetch(url, { headers: authHeaders(false) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GET failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function fhirPut(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`PUT ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

function getPatientPhone(patient) {
  const phone = patient.telecom?.find((entry) => entry.system === 'phone' && entry.value?.trim());
  return phone?.value?.trim() ?? '';
}

function buildTelecomWithPhone(phone, existingTelecom = []) {
  const withoutPhone = existingTelecom.filter((entry) => entry.system !== 'phone');
  return [...withoutPhone, { system: 'phone', value: phone, use: 'mobile' }];
}

function patientDisplayName(patient) {
  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  return [given, family].filter(Boolean).join(' ') || patient.id;
}

function isValid555Phone(phone) {
  return /^555-\d{3}-\d{4}$/.test(phone);
}

function needsPhoneBackfill(patient) {
  const phone = getPatientPhone(patient);
  return !phone || !isValid555Phone(phone);
}

function generate555Phone(sequence, usedPhones) {
  const mid = String(100 + (Math.floor(sequence / 10000) % 900)).padStart(3, '0');
  const last = String(sequence % 10000).padStart(4, '0');
  const phone = `555-${mid}-${last}`;
  if (usedPhones.has(phone)) {
    return generate555Phone(sequence + 1, usedPhones);
  }
  usedPhones.add(phone);
  return phone;
}

async function fetchAllPatients() {
  const patients = [];
  let nextUrl = `${API_BASE}/Patient?_count=100`;

  while (nextUrl) {
    const bundle = await fhirFetch(nextUrl);
    if (bundle.entry) {
      for (const entry of bundle.entry) {
        if (entry.resource?.resourceType === 'Patient') {
          patients.push(entry.resource);
        }
      }
    }
    nextUrl = bundle.link?.find((link) => link.relation === 'next')?.url ?? null;
  }

  return patients;
}

async function main() {
  console.log(`Backfilling patient phones via ${API_BASE}\n`);

  const patients = await fetchAllPatients();
  console.log(`Found ${patients.length} patients\n`);

  const usedPhones = new Set(
    patients.map(getPatientPhone).filter((phone) => phone && isValid555Phone(phone))
  );

  let updated = 0;
  let skipped = 0;
  let sequence = 1000;

  for (const patient of patients) {
    if (!needsPhoneBackfill(patient)) {
      skipped++;
      continue;
    }

    const phone = generate555Phone(sequence++, usedPhones);
    const updatedPatient = {
      ...patient,
      telecom: buildTelecomWithPhone(phone, patient.telecom ?? []),
    };

    await fhirPut(`Patient/${patient.id}`, updatedPatient);
    updated++;
    console.log(`  ✓ ${patientDisplayName(patient)} → ${phone}`);
  }

  console.log(`\nDone. Updated ${updated}, skipped ${skipped} (already had phone).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
