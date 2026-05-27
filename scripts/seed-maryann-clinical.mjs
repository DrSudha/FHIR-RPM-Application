/**
 * Seeds Maryann Defferson's full diabetic clinical profile (similar scope to Sarah Mary Davis):
 * - Type 2 diabetes mellitus (11-year duration — different from Sarah's ~3 years)
 * - Diabetic neuropathy (5-year duration)
 * - Medications (distinct regimen including neuropathy therapy)
 * - 30-day vitals: HR, BP, O₂, respiratory rate, glucose
 * - 60-day weight trend + height
 * - 26 weekly lipid panels
 * - 14-day step count and sleep duration
 *
 * Usage: node scripts/seed-maryann-clinical.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOINC,
  bloodPressureObservation,
  glucoseObservation,
  heartRateObservation,
  lipidObservation,
  oxygenSaturationObservation,
  sleepDurationObservation,
  stepCountObservation,
  weightObservation,
} from './lib/loinc-observations.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PATIENT_ID = 'c3be0246-739f-4dde-9209-524ea63f5e0e';
const TARGET_GIVEN = 'Maryann';
const TARGET_FAMILY = 'Defferson';

const T2DM_ONSET = '2015-08-20T09:00:00.000Z';
const NEUROPATHY_ONSET = '2021-05-18T10:30:00.000Z';

const WEARABLE_DAYS = 30;
const WEIGHT_DAYS = 60;
const LIPID_WEEKS = 26;
const STEP_SLEEP_DAYS = 14;

const BP_HOURS = [8, 20];
const O2_HOURS = [9, 21];
const HR_HOURS_THREE = [7, 14, 21];
const HR_HOURS_TWO = [8, 19];
const RR_HOURS_THREE = [8, 14, 20];
const RR_HOURS_FOUR = [7, 12, 17, 22];
const GLUCOSE_HOURS = [7, 18];

const HEIGHT_CM = 165;
const BASE_WEIGHT_KG = 88.4;

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

function isoDateDaysAgo(daysAgo, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function toWeekKey(date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function vitalCategory() {
  return [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
          display: 'Vital Signs',
        },
      ],
    },
  ];
}

function respiratoryRateObservation(patientId, effectiveDateTime, rate) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: [{ system: 'http://loinc.org', code: '9279-1', display: 'Respiratory rate' }],
      text: 'Respiratory rate',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: { value: rate, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
  };
}

function heightObservation(patientId, heightCm) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: [{ system: 'http://loinc.org', code: '8302-2', display: 'Body height' }],
      text: 'Height',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: isoDateDaysAgo(120, 10),
    valueQuantity: { value: heightCm, unit: 'cm', system: 'http://unitsofmeasure.org', code: 'cm' },
  };
}

function buildProblemCondition(patientId, text, snomedCode, display, onsetDateTime) {
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
      text,
      coding: [{ system: 'http://snomed.info/sct', code: snomedCode, display }],
    },
    subject: { reference: `Patient/${patientId}` },
    onsetDateTime,
    recordedDate: onsetDateTime,
  };
}

function buildMedicationRequest(patientId, displayName, status, startDaysAgo, endDaysAgo, doseText) {
  const startDate = isoDateDaysAgo(startDaysAgo);
  const endDate = endDaysAgo != null ? isoDateDaysAgo(endDaysAgo) : undefined;
  const request = {
    resourceType: 'MedicationRequest',
    status,
    intent: 'order',
    medicationCodeableConcept: { text: displayName },
    subject: { reference: `Patient/${patientId}` },
    authoredOn: startDate,
    dosageInstruction: [
      {
        text: doseText,
        route: { text: displayName === 'Insulin glargine' ? 'Subcutaneous' : 'Oral' },
        timing: {
          code: { text: doseText.includes('twice') ? 'Twice daily' : 'Once daily' },
          repeat: {
            frequency: doseText.includes('three times') ? 3 : doseText.includes('twice') ? 2 : 1,
            period: 1,
            periodUnit: 'd',
            boundsPeriod: endDate ? { start: startDate, end: endDate } : { start: startDate },
          },
        },
      },
    ],
  };
  if (endDate) {
    request.dispenseRequest = { validityPeriod: { start: startDate, end: endDate } };
  }
  return request;
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

function conditionLabel(condition) {
  return (condition?.code?.text || condition?.code?.coding?.[0]?.display || '').toLowerCase();
}

function resolveHeartRate(dayOffset, slot, daySeed) {
  const seed = daySeed * 100 + slot;
  let bpm = Math.round(74 + seeded(seed + 17) * 22);
  if (dayOffset === 5 && slot === 1) return 102;
  if (dayOffset === 12 && slot === 0) return 118;
  if (seeded(seed + 3) > 0.92) return 115;
  return bpm;
}

function resolveBloodPressure(dayOffset, slot, daySeed) {
  const seed = daySeed * 200 + slot;
  let systolic = Math.round(124 + seeded(seed + 11) * 24);
  let diastolic = Math.round(Math.min(systolic - 38, 78 + seeded(seed + 12) * 14));
  if (dayOffset === 4 && slot === 0) return { systolic: 148, diastolic: 94 };
  if (dayOffset === 18 && slot === 1) return { systolic: 136, diastolic: 88 };
  return { systolic, diastolic };
}

function resolveO2(dayOffset, slot, daySeed) {
  const seed = daySeed * 300 + slot;
  let o2 = Math.round(95 + seeded(seed + 19) * 4);
  if (dayOffset === 9 && slot === 0) return 91;
  if (seeded(seed + 4) > 0.9) return 89;
  return o2;
}

function resolveRespiratoryRate(dayOffset, slot, daySeed) {
  const seed = daySeed * 400 + slot;
  let rate = Math.round(15 + seeded(seed + 23) * 7);
  if (dayOffset === 7 && slot === 2) return 24;
  return rate;
}

function resolveGlucose(dayOffset, slot, daySeed) {
  const seed = daySeed * 500 + slot;
  let glucose = Math.round(118 + seeded(seed + 29) * 52);
  if (dayOffset === 3 && slot === 0) return 228;
  if (dayOffset === 8 && slot === 1) return 196;
  if (dayOffset === 15 && slot === 0) return 212;
  if (seeded(seed + 6) > 0.9) return 205;
  return glucose;
}

function resolveLipidPanel(weekIndex) {
  const seed = hashString(`${PATIENT_ID}-lipid-week-${weekIndex}`);
  return {
    ldl: Math.round(108 + seeded(seed + 31) * 42),
    hdl: Math.round(38 + seeded(seed + 32) * 16),
    tg: Math.round(148 + seeded(seed + 33) * 132),
  };
}

function buildVitalObservations(patientId) {
  const observations = [];
  const now = new Date();

  for (let dayOffset = WEARABLE_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);
    const daySeed = hashString(`${patientId}-maryann-day-${dayOffset}`);

    const hrHours = seeded(daySeed) > 0.42 ? HR_HOURS_THREE : HR_HOURS_TWO;
    for (let slot = 0; slot < hrHours.length; slot += 1) {
      observations.push(
        heartRateObservation(
          patientId,
          atDayTime(day, hrHours[slot], 12 + slot * 7),
          resolveHeartRate(dayOffset, slot, daySeed)
        )
      );
    }

    for (let slot = 0; slot < BP_HOURS.length; slot += 1) {
      const { systolic, diastolic } = resolveBloodPressure(dayOffset, slot, daySeed);
      observations.push(
        bloodPressureObservation(
          patientId,
          atDayTime(day, BP_HOURS[slot], 25 + slot * 6),
          systolic,
          diastolic
        )
      );
    }

    for (let slot = 0; slot < O2_HOURS.length; slot += 1) {
      observations.push(
        oxygenSaturationObservation(
          patientId,
          atDayTime(day, O2_HOURS[slot], 35 + slot * 5),
          resolveO2(dayOffset, slot, daySeed)
        )
      );
    }

    const rrHours = seeded(daySeed + 1) > 0.38 ? RR_HOURS_FOUR : RR_HOURS_THREE;
    for (let slot = 0; slot < rrHours.length; slot += 1) {
      observations.push(
        respiratoryRateObservation(
          patientId,
          atDayTime(day, rrHours[slot], 8 + slot * 10),
          resolveRespiratoryRate(dayOffset, slot, daySeed)
        )
      );
    }

    for (let slot = 0; slot < GLUCOSE_HOURS.length; slot += 1) {
      observations.push(
        glucoseObservation(
          patientId,
          atDayTime(day, GLUCOSE_HOURS[slot], 20 + slot * 12),
          resolveGlucose(dayOffset, slot, daySeed)
        )
      );
    }
  }

  let dayOffset = WEIGHT_DAYS;
  let weightIndex = 0;
  while (dayOffset >= 0) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);
    const seed = hashString(`${patientId}-maryann-weight-${weightIndex}`);
    const drift = (seeded(seed) - 0.48) * 1.4;
    const trend = (WEIGHT_DAYS - dayOffset) * 0.012;
    const weightKg = Math.round((BASE_WEIGHT_KG + drift + trend) * 10) / 10;
    observations.push(
      weightObservation(patientId, atDayTime(day, 7 + (weightIndex % 3) * 2, 50), weightKg)
    );
    dayOffset -= seeded(seed + 1) > 0.55 ? 2 : 3;
    weightIndex += 1;
  }

  return observations;
}

function buildLipidObservations(patientId, existingWeekKeys) {
  const observations = [];
  const now = new Date();

  for (let weekIndex = 0; weekIndex < LIPID_WEEKS; weekIndex += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - weekIndex * 7);
    day.setDate(day.getDate() - (hashString(`${patientId}-lipid-day-${weekIndex}`) % 3));

    const weekKey = toWeekKey(day);
    if (existingWeekKeys.has(weekKey)) continue;

    const iso = atDayTime(day, 9, 15 + (weekIndex % 40));
    const panel = resolveLipidPanel(weekIndex);
    observations.push(
      lipidObservation(patientId, iso, LOINC.ldlCholesterol, panel.ldl),
      lipidObservation(patientId, iso, LOINC.hdlCholesterol, panel.hdl),
      lipidObservation(patientId, iso, LOINC.triglycerides, panel.tg)
    );
  }

  return observations;
}

function buildStepSleepObservations(patientId) {
  const observations = [];
  for (let dayOffset = STEP_SLEEP_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    const stepSeed = hashString(`${patientId}-maryann-steps-${dayOffset}`);
    const steps = Math.round(4100 + seeded(stepSeed) * 2800);
    const sleepHours = Math.round((5.8 + seeded(stepSeed + 2) * 2.8) * 10) / 10;

    observations.push(
      stepCountObservation(patientId, atDayTime(day, 23, 55), steps),
      sleepDurationObservation(patientId, atDayTime(day, 7, 5), sleepHours)
    );
  }
  return observations;
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
    if (!Number.isNaN(date.getTime())) keys.add(toWeekKey(date));
  }
  return keys;
}

async function ensureConditions(patientId) {
  const bundle = await fhirGet(`Condition?patient=${patientId}`);
  const conditions = (bundle.entry || []).map((entry) => entry.resource).filter(Boolean);
  const labels = conditions.map(conditionLabel);

  const toCreate = [];
  if (!labels.some((label) => label.includes('type 2 diabetes'))) {
    toCreate.push(
      buildProblemCondition(
        patientId,
        'Type 2 diabetes mellitus',
        '44054006',
        'Diabetes mellitus type 2',
        T2DM_ONSET
      )
    );
  }
  if (!labels.some((label) => label.includes('neuropathy'))) {
    toCreate.push(
      buildProblemCondition(
        patientId,
        'Diabetic neuropathy',
        '230572002',
        'Diabetic neuropathy',
        NEUROPATHY_ONSET
      )
    );
  }

  for (const condition of toCreate) {
    await fhirPost('Condition', condition);
    console.log(`  ✓ Condition: ${condition.code.text} (since ${condition.onsetDateTime.slice(0, 10)})`);
  }

  if (toCreate.length === 0) {
    console.log('  · Conditions already present');
  }
}

async function ensureMedications(patientId) {
  const bundle = await fhirGet(`MedicationRequest?patient=${patientId}`);
  const existing = (bundle.entry || []).map((entry) => entry.resource).filter(Boolean);
  if (existing.length >= 5) {
    console.log(`  · Medications already present (${existing.length})`);
    return;
  }

  const meds = [
    buildMedicationRequest(
      patientId,
      'Metformin',
      'active',
      45,
      null,
      '1000 mg twice daily'
    ),
    buildMedicationRequest(
      patientId,
      'Sitagliptin',
      'active',
      38,
      null,
      '100 mg once daily'
    ),
    buildMedicationRequest(
      patientId,
      'Insulin glargine',
      'active',
      22,
      null,
      '22 units once daily at bedtime'
    ),
    buildMedicationRequest(
      patientId,
      'Gabapentin',
      'active',
      18,
      null,
      '300 mg three times daily'
    ),
    buildMedicationRequest(
      patientId,
      'Atorvastatin',
      'active',
      60,
      null,
      '20 mg once daily'
    ),
    buildMedicationRequest(
      patientId,
      'Ibuprofen',
      'completed',
      200,
      90,
      '400 mg three times daily'
    ),
    buildMedicationRequest(
      patientId,
      'Omeprazole',
      'completed',
      160,
      40,
      '20 mg once daily'
    ),
  ];

  for (const med of meds) {
    await fhirPost('MedicationRequest', med);
    console.log(`  ✓ Medication: ${med.medicationCodeableConcept.text} [${med.status}]`);
  }
}

async function main() {
  console.log(`Seeding Maryann Defferson clinical profile via ${API_BASE}\n`);

  const patient = await fhirGet(`Patient/${PATIENT_ID}`);
  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  if (!given.includes(TARGET_GIVEN) || family !== TARGET_FAMILY) {
    throw new Error(
      `Patient/${PATIENT_ID} is ${given} ${family}, expected ${TARGET_GIVEN} ${TARGET_FAMILY}`
    );
  }

  console.log(`→ ${given} ${family} (${PATIENT_ID})\n`);

  console.log('Conditions');
  await ensureConditions(PATIENT_ID);

  console.log('\nMedications');
  await ensureMedications(PATIENT_ID);

  const hrCount = await observationCount(PATIENT_ID, LOINC.heartRate);
  if (hrCount >= 50) {
    console.log(`\n· Vitals already seeded (${hrCount} heart rate readings) — skipping observations`);
  } else {
    console.log('\nObservations');
    const heightCount = await observationCount(PATIENT_ID, '8302-2');
    if (heightCount === 0) {
      await fhirPost('Observation', heightObservation(PATIENT_ID, HEIGHT_CM));
      console.log(`  ✓ Height: ${HEIGHT_CM} cm`);
    }

    const vitals = buildVitalObservations(PATIENT_ID);
    await postBatch(vitals);
    console.log(`  ✓ Posted ${vitals.length} vital/lab observations`);

    const lipidWeekKeys = await existingLdlWeekKeys(PATIENT_ID);
    const lipids = buildLipidObservations(PATIENT_ID, lipidWeekKeys);
    if (lipids.length > 0) {
      await postBatch(lipids, 9);
      console.log(`  ✓ Posted ${lipids.length / 3} weekly lipid panel(s)`);
    }

    const stepSleep = buildStepSleepObservations(PATIENT_ID);
    await postBatch(stepSleep);
    console.log(`  ✓ Posted ${stepSleep.length} step/sleep observations`);
  }

  console.log('\nDone. Open Maryann Defferson under Diabetic Care to review charts and clinical lists.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
