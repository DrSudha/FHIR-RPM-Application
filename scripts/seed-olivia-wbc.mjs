/**
 * Seeds Olivia Whittacker WBC count lab results (6–12 month intervals since MS diagnosis).
 *
 * Usage: node scripts/seed-olivia-wbc.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wbcObservation } from './lib/loinc-observations.mjs';
import { buildWbcTimeline } from './lib/wbc-timeline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PATIENT_ID = '86206fa1-a2ff-45e9-a990-02160963fda6';
const WBC_CODE = '6690-2';

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

async function postBatch(observations, batchSize = 10) {
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await Promise.all(batch.map((obs) => fhirPost('Observation', obs)));
  }
}

async function main() {
  console.log(`Seeding Olivia WBC count labs via ${API_BASE}\n`);

  const expected = buildWbcTimeline(PATIENT_ID).length;
  const bundle = await fhirGet(
    `Observation?subject=Patient/${PATIENT_ID}&code=${WBC_CODE}&_count=1`
  );
  const existing = bundle.total ?? bundle.entry?.length ?? 0;

  if (existing >= expected) {
    console.log(`· Skipping — already has ${existing} WBC reading(s)`);
    return;
  }

  const timeline = buildWbcTimeline(PATIENT_ID);
  const observations = timeline.map(({ date, value }) =>
    wbcObservation(PATIENT_ID, date, value)
  );

  console.log(`→ Posting ${observations.length} WBC observations (6–12 month intervals since 1999)`);
  await postBatch(observations);

  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  console.log(
    `✓ WBC range: ${first.value} → ${last.value} ×10⁹/L (${first.date.slice(0, 10)} to ${last.date.slice(0, 10)})`
  );
  console.log('\nDone. Refresh Olivia\'s chart to view the WBC count trend.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
