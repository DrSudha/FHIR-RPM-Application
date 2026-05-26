/**
 * Seeds synthetic wearable vitals for a single patient:
 * - Heart rate: 30 days, 2–3 readings/day
 * - Blood pressure: 30 days, 2 readings/day
 * - O2 saturation: 30 days, 2 readings/day
 * - Weight: ~2 months, one reading every 2–3 days
 *
 * Usage: node scripts/seed-patient-wearable-vitals.mjs [baseUrl] [patientId]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const PATIENT_ID = process.argv[3] || '4be2f5e1-8740-4c6b-beb9-697337ffb95e';

const WEARABLE_DAYS = 30;
const WEIGHT_DAYS = 60;
const BP_HOURS = [8, 20];
const O2_HOURS = [9, 21];
const HR_HOURS_THREE = [7, 14, 21];
const HR_HOURS_TWO = [8, 19];

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

function atDayTime(day, hour, minute = 0) {
  const at = new Date(day);
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
}

function heartRateObservation(patientId, effectiveDateTime, bpm) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }],
      text: 'Heart rate',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: bpm,
      unit: '/min',
      system: 'http://unitsofmeasure.org',
      code: '/min',
    },
  };
}

function bloodPressureObservation(patientId, effectiveDateTime, systolic, diastolic) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: [{ system: 'http://loinc.org', code: '55284-4', display: 'Blood pressure panel' }],
      text: 'Blood pressure',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    component: [
      {
        code: {
          coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }],
        },
        valueQuantity: {
          value: systolic,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]',
        },
      },
      {
        code: {
          coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }],
        },
        valueQuantity: {
          value: diastolic,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]',
        },
      },
    ],
  };
}

function oxygenSaturationObservation(patientId, effectiveDateTime, percent) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: [{ system: 'http://loinc.org', code: '59408-5', display: 'Oxygen saturation' }],
      text: 'Oxygen saturation',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: percent,
      unit: '%',
      system: 'http://unitsofmeasure.org',
      code: '%',
    },
  };
}

function weightObservation(patientId, effectiveDateTime, weightKg) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }],
      text: 'Weight',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: weightKg,
      unit: 'kg',
      system: 'http://unitsofmeasure.org',
      code: 'kg',
    },
  };
}

function estimateBaseWeightKg(patientId, heightCm) {
  const hash = hashString(`${patientId}-weight`);
  const targetBmi = 22 + (hash % 8);
  return Math.round(targetBmi * (heightCm / 100) ** 2 * 10) / 10;
}

async function resolveBaseWeightKg(patientId) {
  const weightBundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=29463-7&_sort=-date&_count=1`
  );
  const latest = weightBundle.entry?.[0]?.resource?.valueQuantity?.value;
  if (typeof latest === 'number') return latest;

  const heightBundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=8302-2&_sort=-date&_count=1`
  );
  const heightCm = heightBundle.entry?.[0]?.resource?.valueQuantity?.value ?? 170;
  return estimateBaseWeightKg(patientId, heightCm);
}

function buildWearableReadings(patientId, baseWeightKg) {
  const observations = [];
  const now = new Date();

  for (let dayOffset = WEARABLE_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    const daySeed = hashString(`${patientId}-day-${dayOffset}`);
    const hrSlots = seeded(daySeed) > 0.45 ? 3 : 2;
    const hrHours = hrSlots === 3 ? HR_HOURS_THREE : HR_HOURS_TWO;

    for (let slot = 0; slot < hrHours.length; slot += 1) {
      const seed = daySeed * 100 + slot;
      const heartRate = Math.round(62 + seeded(seed) * 34);
      observations.push(
        heartRateObservation(
          patientId,
          atDayTime(day, hrHours[slot], 10 + slot * 8),
          heartRate
        )
      );
    }

    for (let slot = 0; slot < BP_HOURS.length; slot += 1) {
      const seed = daySeed * 200 + slot;
      const systolic = Math.round(112 + seeded(seed) * 28);
      const diastolic = Math.round(Math.min(systolic - 38, 68 + seeded(seed + 1) * 20));
      observations.push(
        bloodPressureObservation(
          patientId,
          atDayTime(day, BP_HOURS[slot], 20 + slot * 5),
          systolic,
          diastolic
        )
      );
    }

    for (let slot = 0; slot < O2_HOURS.length; slot += 1) {
      const seed = daySeed * 300 + slot;
      const o2 = Math.round(94 + seeded(seed) * 5);
      observations.push(
        oxygenSaturationObservation(
          patientId,
          atDayTime(day, O2_HOURS[slot], 30 + slot * 4),
          o2
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

    const seed = hashString(`${patientId}-weight-${weightIndex}`);
    const drift = (seeded(seed) - 0.5) * 1.8;
    const trend = (WEIGHT_DAYS - dayOffset) * 0.008;
    const weightKg = Math.round((baseWeightKg + drift + trend) * 10) / 10;

    observations.push(
      weightObservation(patientId, atDayTime(day, 7 + (weightIndex % 3) * 2, 45), weightKg)
    );

    const step = seeded(seed + 1) > 0.5 ? 2 : 3;
    dayOffset -= step;
    weightIndex += 1;
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
  const patient = await fhirGet(`Patient/${PATIENT_ID}`);
  if (patient.resourceType !== 'Patient') {
    throw new Error(`Patient/${PATIENT_ID} not found`);
  }

  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  const name = [given, family].filter(Boolean).join(' ') || PATIENT_ID;
  const baseWeightKg = await resolveBaseWeightKg(PATIENT_ID);
  const observations = buildWearableReadings(PATIENT_ID, baseWeightKg);

  const hrCount = observations.filter((o) => o.code?.coding?.[0]?.code === '8867-4').length;
  const bpCount = observations.filter((o) => o.code?.coding?.[0]?.code === '55284-4').length;
  const o2Count = observations.filter((o) => o.code?.coding?.[0]?.code === '59408-5').length;
  const weightCount = observations.filter((o) => o.code?.coding?.[0]?.code === '29463-7').length;

  console.log(`Seeding wearable vitals for ${name} (${PATIENT_ID})\n`);
  console.log(`  Heart rate:      ${hrCount} readings (${WEARABLE_DAYS} days, 2–3/day)`);
  console.log(`  Blood pressure:  ${bpCount} readings (${WEARABLE_DAYS} days, 2/day)`);
  console.log(`  O2 saturation:   ${o2Count} readings (${WEARABLE_DAYS} days, 2/day)`);
  console.log(`  Weight:          ${weightCount} readings (~${WEIGHT_DAYS} days, every 2–3 days)`);
  console.log(`  Total:           ${observations.length} observations\n`);

  await postBatch(observations);

  console.log('Done. Refresh the patient chart to view Vital Signs & wearables data.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
