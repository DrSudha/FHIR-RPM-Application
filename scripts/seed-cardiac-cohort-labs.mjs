/**
 * Seeds O₂, weight, blood glucose, and lipid panel data for all cardiovascular
 * care enrolment patients. Each patient gets a distinct profile with normal,
 * warning, and critical values mixed in.
 *
 * - O₂ saturation: 2 readings/day for the past 14 days
 * - Weight: 1 reading/day for the past 14 days
 * - Blood glucose: once per week for the past 4 weeks
 * - LDL, HDL, triglycerides: once per month for the past 6 months
 *
 * Usage: node scripts/seed-cardiac-cohort-labs.mjs [baseUrl]
 */

import {
  LOINC,
  glucoseObservation,
  lipidObservation,
  oxygenSaturationObservation,
  weightObservation,
} from './lib/loinc-observations.mjs';

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const CARDIAC_ENROLMENT = 'cardiovascular care enrolment';
const SKIP_IF_O2_COUNT_AT_LEAST = 28;

const O2_DAYS = 14;
const WEIGHT_DAYS = 14;
const GLUCOSE_WEEKS = 4;
const LIPID_MONTHS = 6;

const O2_HOURS = [9, 20];
const WEIGHT_HOUR = 7;
const GLUCOSE_HOUR = 8;
const LIPID_HOUR = 10;

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

function atDayTime(day, hour, minute = 0) {
  const at = new Date(day);
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
}

function patientName(patient) {
  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  return [given, family].filter(Boolean).join(' ') || patient.id;
}

/** Per-patient scripted values — each profile mixes normal, warning, and critical readings. */
const PATIENT_PROFILES = [
  {
    label: 'Jessica Thomas',
    o2ByDay: {
      2: [78, 96],
      5: [88, 97],
      8: [79, 95],
      11: [92, 89],
      13: [97, 98],
    },
    o2Default: [96, 97],
    weightBaseKg: 78.4,
    weightDrift: 0.12,
    glucoseWeekly: [112, 145, 108, 218],
    lipidsByMonth: [
      { ldl: 118, hdl: 38, tg: 185 },
      { ldl: 98, hdl: 42, tg: 145 },
      { ldl: 142, hdl: 45, tg: 260 },
      { ldl: 125, hdl: 40, tg: 195 },
      { ldl: 108, hdl: 37, tg: 170 },
      { ldl: 134, hdl: 35, tg: 210 },
    ],
  },
  {
    label: 'Jonathan Newberhoff',
    o2ByDay: {
      1: [97, 98],
      4: [88, 96],
      7: [95, 89],
      10: [97, 94],
      12: [91, 97],
    },
    o2Default: [97, 98],
    weightBaseKg: 91.2,
    weightDrift: -0.05,
    glucoseWeekly: [98, 102, 138, 105],
    lipidsByMonth: [
      { ldl: 132, hdl: 52, tg: 168 },
      { ldl: 115, hdl: 55, tg: 152 },
      { ldl: 104, hdl: 58, tg: 138 },
      { ldl: 145, hdl: 48, tg: 182 },
      { ldl: 138, hdl: 50, tg: 175 },
      { ldl: 148, hdl: 46, tg: 190 },
    ],
  },
  {
    label: 'Marcus Sterling',
    o2ByDay: {
      0: [82, 96],
      3: [97, 77],
      6: [89, 95],
      9: [96, 88],
      12: [79, 94],
    },
    o2Default: [95, 96],
    weightBaseKg: 86.8,
    weightDrift: 0.08,
    glucoseWeekly: [124, 205, 116, 132],
    lipidsByMonth: [
      { ldl: 156, hdl: 36, tg: 220 },
      { ldl: 128, hdl: 39, tg: 178 },
      { ldl: 110, hdl: 44, tg: 155 },
      { ldl: 165, hdl: 34, tg: 240 },
      { ldl: 148, hdl: 37, tg: 205 },
      { ldl: 172, hdl: 32, tg: 255 },
    ],
  },
];

function resolveO2(profile, patientIndex, dayOffset, slot) {
  const dayValues = profile.o2ByDay[dayOffset];
  if (dayValues) return dayValues[slot] ?? profile.o2Default[slot];

  const seed = hashString(`${profile.label}-o2-${dayOffset}-${slot}`);
  if (patientIndex === 0 && seeded(seed) > 0.92) return slot === 0 ? 87 : 96;
  if (patientIndex === 1 && seeded(seed) > 0.9) return 89;
  if (patientIndex === 2 && seeded(seed) > 0.88) return slot === 0 ? 78 : 88;

  const base = profile.o2Default[slot];
  return Math.round(base + (seeded(seed + 1) - 0.5) * 2);
}

function resolveWeight(profile, dayOffset) {
  const drift = profile.weightDrift * (WEIGHT_DAYS - dayOffset);
  const wobble = (seeded(hashString(`${profile.label}-wt-${dayOffset}`)) - 0.5) * 0.6;
  return Math.round((profile.weightBaseKg + drift + wobble) * 10) / 10;
}

function buildPatientObservations(patientId, patientIndex) {
  const profile = PATIENT_PROFILES[patientIndex % PATIENT_PROFILES.length];
  const observations = [];
  const now = new Date();

  for (let dayOffset = O2_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    for (let slot = 0; slot < O2_HOURS.length; slot += 1) {
      observations.push(
        oxygenSaturationObservation(
          patientId,
          atDayTime(day, O2_HOURS[slot], 15 + slot * 8),
          resolveO2(profile, patientIndex, dayOffset, slot)
        )
      );
    }

    observations.push(
      weightObservation(
        patientId,
        atDayTime(day, WEIGHT_HOUR, 30 + (dayOffset % 3) * 5),
        resolveWeight(profile, dayOffset)
      )
    );
  }

  for (let week = 0; week < GLUCOSE_WEEKS; week += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - week * 7);
    observations.push(
      glucoseObservation(
        patientId,
        atDayTime(day, GLUCOSE_HOUR, 20),
        profile.glucoseWeekly[week]
      )
    );
  }

  for (let month = 0; month < LIPID_MONTHS; month += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - month * 30);
    const panel = profile.lipidsByMonth[month];
    const iso = atDayTime(day, LIPID_HOUR, 0);

    observations.push(
      lipidObservation(patientId, iso, LOINC.ldlCholesterol, panel.ldl),
      lipidObservation(patientId, iso, LOINC.hdlCholesterol, panel.hdl),
      lipidObservation(patientId, iso, LOINC.triglycerides, panel.tg)
    );
  }

  return { observations, profile };
}

async function postBatch(observations, batchSize = 10) {
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await Promise.all(batch.map((obs) => fhirPost('Observation', obs)));
  }
}

async function observationCount(patientId, code) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${code}&_summary=count`
  );
  return bundle.total ?? 0;
}

function isCardiacEnrolment(text) {
  return (text || '').toLowerCase().trim() === CARDIAC_ENROLMENT;
}

async function findCardiacCarePatients() {
  const patientBundle = await fhirGet('Patient?_count=100');
  const patients = (patientBundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'Patient');

  const cardiac = [];

  for (const patient of patients) {
    const conditionBundle = await fhirGet(`Condition?patient=${patient.id}`);
    const conditions = (conditionBundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'Condition');

    if (conditions.some((condition) => isCardiacEnrolment(condition.code?.text))) {
      cardiac.push(patient);
    }
  }

  return cardiac;
}

async function main() {
  console.log(`Seeding cardiac care cohort labs & wearables via ${API_BASE}\n`);

  const patients = await findCardiacCarePatients();
  if (patients.length === 0) {
    console.log('No cardiovascular care enrolment patients found.');
    return;
  }

  let seededCount = 0;

  for (let index = 0; index < patients.length; index += 1) {
    const patient = patients[index];
    const name = patientName(patient);
    const o2Count = await observationCount(patient.id, '59408-5');

    if (o2Count >= SKIP_IF_O2_COUNT_AT_LEAST) {
      console.log(`· ${name} — skipped (already has ${o2Count} O₂ readings)`);
      continue;
    }

    const { observations, profile } = buildPatientObservations(patient.id, index);

    const counts = {
      o2: observations.filter((o) => o.code?.coding?.[0]?.code === '59408-5').length,
      weight: observations.filter((o) => o.code?.coding?.[0]?.code === '29463-7').length,
      glucose: observations.filter((o) => o.code?.coding?.[0]?.code === '15074-8').length,
      ldl: observations.filter((o) => o.code?.coding?.[0]?.code === '13457-7').length,
      hdl: observations.filter((o) => o.code?.coding?.[0]?.code === '2085-9').length,
      tg: observations.filter((o) => o.code?.coding?.[0]?.code === '2571-8').length,
    };

    console.log(`→ ${name} (${patient.id}) — profile: ${profile.label}`);
    console.log(
      `    O₂ ${counts.o2}, weight ${counts.weight}, glucose ${counts.glucose}, LDL ${counts.ldl}, HDL ${counts.hdl}, TG ${counts.tg}`
    );

    await postBatch(observations);
    console.log(`  ✓ Posted ${observations.length} observations\n`);
    seededCount += 1;
  }

  console.log(
    seededCount > 0
      ? `Done. Seeded ${seededCount} cardiac care patient(s). Refresh patient charts to review.`
      : 'Done. All cardiac care patients already had this cohort data seeded.'
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
