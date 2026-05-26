/**
 * Updates Olivia's MS diagnosis to April 1999 and replaces EDSS scores
 * with a full timeline (every 6–8 months) through to the present.
 *
 * Usage: node scripts/update-olivia-ms-edss.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { edssObservation } from './lib/loinc-observations.mjs';
import {
  MS_DIAGNOSIS_DATE,
  MS_RECORDED_DATE,
  EDSS_SNOMED_CODE,
  buildEdssScoreTimeline,
} from './lib/edss-timeline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PATIENT_ID = '86206fa1-a2ff-45e9-a990-02160963fda6';
const CONDITION_ID = '46a64b21-6b53-4601-8945-b6d46867939e';
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

async function fetchAllEdssObservations(patientId) {
  const observations = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const bundle = await fhirGet(
      `Observation?subject=Patient/${patientId}&code=${EDSS_SNOMED_CODE}&_count=${pageSize}&_offset=${offset}`
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

async function main() {
  console.log(`Updating Olivia MS diagnosis & EDSS timeline via ${API_BASE}\n`);

  const condition = await fhirGet(`Condition/${CONDITION_ID}`);
  if (condition.resourceType !== 'Condition') {
    throw new Error(`Condition/${CONDITION_ID} not found`);
  }

  const updatedCondition = {
    ...condition,
    onsetDateTime: MS_DIAGNOSIS_DATE,
    recordedDate: MS_RECORDED_DATE,
    code: {
      ...condition.code,
      text: CONDITION_TEXT,
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '24700007',
          display: 'Multiple sclerosis',
        },
      ],
    },
  };

  await fhirPut(`Condition/${CONDITION_ID}`, updatedCondition);
  console.log(`✓ Updated MS onset to 17/04/1999 (Condition/${CONDITION_ID})`);

  const existingEdss = await fetchAllEdssObservations(PATIENT_ID);
  console.log(`→ Removing ${existingEdss.length} existing EDSS observation(s)`);
  for (const obs of existingEdss) {
    await fhirDelete(`Observation/${obs.id}`);
  }
  console.log('✓ Cleared prior EDSS scores');

  const timeline = buildEdssScoreTimeline(PATIENT_ID, { currentScore: 6.5 });
  const observations = timeline.map(({ date, score }) =>
    edssObservation(PATIENT_ID, date, score)
  );

  console.log(`→ Posting ${observations.length} EDSS scores (6–8 month intervals since 1999)`);
  await postBatch(observations);

  const latest = timeline[timeline.length - 1];
  const earliest = timeline[0];
  console.log(`✓ EDSS range: ${earliest.score} (${earliest.date.slice(0, 10)}) → ${latest.score} (${latest.date.slice(0, 10)})`);
  console.log('\nDone. Refresh Olivia\'s chart to view the updated EDSS progression.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
