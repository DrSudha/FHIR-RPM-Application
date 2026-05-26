/**
 * Seeds Olivia Whittacker medications for MS and muscle weakness:
 * - Active oral and infusion DMTs / symptom management
 * - Completed infusion courses (relapse treatment)
 * - Stopped prior DMTs
 *
 * Usage: node scripts/seed-olivia-medications.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PATIENT_ID = '86206fa1-a2ff-45e9-a990-02160963fda6';
const TARGET_GIVEN = 'Olivia';
const TARGET_FAMILY = 'Whittacker';

const MEDICATIONS = [
  {
    displayName: 'Ocrelizumab',
    status: 'active',
    startDaysAgo: 540,
    dose: 600,
    unit: 'mg',
    route: 'Intravenous infusion',
    frequencyText: 'Every 6 months',
    reason: 'MS disease-modifying therapy (infusion)',
  },
  {
    displayName: 'Dimethyl fumarate',
    status: 'active',
    startDaysAgo: 420,
    dose: 240,
    unit: 'mg',
    route: 'Oral',
    frequencyText: 'Twice daily',
    reason: 'MS oral disease-modifying therapy',
  },
  {
    displayName: 'Dalfampridine',
    status: 'active',
    startDaysAgo: 240,
    dose: 10,
    unit: 'mg',
    route: 'Oral',
    frequencyText: 'Twice daily',
    reason: 'MS walking speed / lower limb weakness',
  },
  {
    displayName: 'Baclofen',
    status: 'active',
    startDaysAgo: 180,
    dose: 10,
    unit: 'mg',
    route: 'Oral',
    frequencyText: 'Three times daily',
    reason: 'MS spasticity and muscle weakness',
  },
  {
    displayName: 'Gabapentin',
    status: 'active',
    startDaysAgo: 120,
    dose: 300,
    unit: 'mg',
    route: 'Oral',
    frequencyText: 'Three times daily',
    reason: 'Neuropathic pain and muscle stiffness',
  },
  {
    displayName: 'Vitamin D3',
    status: 'active',
    startDaysAgo: 365,
    dose: 2000,
    unit: 'IU',
    route: 'Oral',
    frequencyText: 'Once daily',
    reason: 'MS bone health and deficiency prevention',
  },
  {
    displayName: 'Methylprednisolone',
    status: 'completed',
    startDaysAgo: 94,
    endDaysAgo: 91,
    dose: 1000,
    unit: 'mg',
    route: 'Intravenous infusion',
    frequencyText: 'Once daily for 3 days',
    reason: 'MS relapse — IV methylprednisolone infusion course',
  },
  {
    displayName: 'Prednisone',
    status: 'completed',
    startDaysAgo: 248,
    endDaysAgo: 241,
    dose: 60,
    unit: 'mg',
    route: 'Oral',
    frequencyText: 'Once daily (tapering course)',
    reason: 'MS relapse — oral corticosteroid taper (completed)',
  },
  {
    displayName: 'Natalizumab',
    status: 'stopped',
    startDaysAgo: 900,
    endDaysAgo: 720,
    dose: 300,
    unit: 'mg',
    route: 'Intravenous infusion',
    frequencyText: 'Every 4 weeks',
    reason: 'Prior MS DMT infusion — stopped before Ocrelizumab switch',
  },
  {
    displayName: 'Interferon beta-1a',
    status: 'stopped',
    startDaysAgo: 820,
    endDaysAgo: 545,
    dose: 44,
    unit: 'mcg',
    route: 'Subcutaneous',
    frequencyText: 'Once weekly',
    reason: 'Prior MS injectable DMT — stopped due to tolerability',
  },
];

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

function isoDateDaysAgo(daysAgo, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function isCompletedStatus(status) {
  return ['completed', 'stopped', 'cancelled', 'discontinued'].includes(
    (status || '').toLowerCase()
  );
}

function buildDosageInstruction(med, startDate, endDate) {
  const frequencyLower = med.frequencyText.toLowerCase();
  return {
    text: `${med.dose} ${med.unit} ${frequencyLower}`,
    route: { text: med.route },
    timing: {
      code: { text: med.frequencyText },
      ...(startDate
        ? {
            repeat: {
              boundsPeriod: endDate ? { start: startDate, end: endDate } : { start: startDate },
            },
          }
        : {}),
    },
    doseAndRate: [{ doseQuantity: { value: med.dose, unit: med.unit } }],
  };
}

function buildMedicationRequest(patientId, med) {
  const startDate = isoDateDaysAgo(med.startDaysAgo);
  const endDate =
    med.endDaysAgo != null && isCompletedStatus(med.status)
      ? isoDateDaysAgo(med.endDaysAgo)
      : undefined;

  const request = {
    resourceType: 'MedicationRequest',
    status: med.status,
    intent: 'order',
    medicationCodeableConcept: { text: med.displayName },
    subject: { reference: `Patient/${patientId}` },
    authoredOn: startDate,
    dosageInstruction: [buildDosageInstruction(med, startDate, endDate)],
  };

  if (endDate) {
    request.dispenseRequest = { validityPeriod: { start: startDate, end: endDate } };
  }

  return request;
}

function medRawName(med) {
  return (
    med.medicationCodeableConcept?.text ||
    med.medicationCodeableConcept?.coding?.[0]?.display ||
    med.medicationReference?.display ||
    ''
  ).toLowerCase();
}

async function resolvePatientId() {
  try {
    const patient = await fhirGet(`Patient/${PATIENT_ID}`);
    if (patient.resourceType === 'Patient') return patient;
  } catch {
    // fall through
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

  if (!match) throw new Error(`Patient ${TARGET_GIVEN} ${TARGET_FAMILY} was not found.`);
  return match;
}

async function main() {
  console.log(`Seeding ${TARGET_GIVEN} ${TARGET_FAMILY} medications via ${API_BASE}\n`);

  const patient = await resolvePatientId();
  const patientId = patient.id;
  const name = `${patient.name?.[0]?.given?.join(' ') || TARGET_GIVEN} ${patient.name?.[0]?.family || TARGET_FAMILY}`;
  console.log(`Found ${name} (Patient/${patientId})\n`);

  const medBundle = await fhirGet(`MedicationRequest?patient=${patientId}&_count=100`);
  const existing = (medBundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'MedicationRequest');

  const existingNames = new Set(existing.map((med) => medRawName(med)));

  let added = 0;
  for (const med of MEDICATIONS) {
    if (existingNames.has(med.displayName.toLowerCase())) {
      console.log(`· Already exists: ${med.displayName} (${med.status})`);
      continue;
    }

    const created = await fhirPost('MedicationRequest', buildMedicationRequest(patientId, med));
    const label = med.route.toLowerCase().includes('infusion') ? 'infusion' : med.status;
    console.log(`✓ Added ${label}: ${med.displayName} — ${med.reason} (MedicationRequest/${created.id})`);
    added += 1;
  }

  const activeCount = MEDICATIONS.filter((med) => med.status === 'active').length;
  const completedCount = MEDICATIONS.filter((med) => med.status === 'completed').length;
  const stoppedCount = MEDICATIONS.filter((med) => med.status === 'stopped').length;

  console.log(
    `\nDone. ${added} medication(s) added (${activeCount} active, ${completedCount} completed, ${stoppedCount} stopped).`
  );
  console.log(`Refresh ${name}'s chart to review prescriptions and infusion history.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
