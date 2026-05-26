/**
 * Seeds 3 heart-rate and 3 blood-pressure readings per day for the past 30 days
 * for specified cardiac patients.
 *
 * Usage: node scripts/seed-cardiac-vitals.mjs [baseUrl]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';

const PATIENT_IDS = [
  '385d809e-fef6-4c71-aa45-2c9969c45fba',
  '5785016a-c621-48e3-bb7e-3fbf4e1f39ee',
];

const DAYS = 30;
const READINGS_PER_DAY = 3;
const HOURS = [8, 14, 20];

function seeded(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

async function fhirPost(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
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

function heartRateObservation(patientId, effectiveDateTime, bpm) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '8867-4',
          display: 'Heart rate',
        },
      ],
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
      coding: [
        {
          system: 'http://loinc.org',
          code: '55284-4',
          display: 'Blood pressure panel',
        },
      ],
      text: 'Blood pressure',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    component: [
      {
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8480-6',
              display: 'Systolic blood pressure',
            },
          ],
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
          coding: [
            {
              system: 'http://loinc.org',
              code: '8462-4',
              display: 'Diastolic blood pressure',
            },
          ],
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

function buildReadings(patientId, patientIndex) {
  const observations = [];
  const now = new Date();

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    for (let slot = 0; slot < READINGS_PER_DAY; slot++) {
      const at = new Date(day);
      at.setHours(HOURS[slot], 15 + slot * 7, 0, 0);

      const seed =
        patientIndex * 10000 + dayOffset * 100 + slot + patientId.charCodeAt(0);
      const r1 = seeded(seed);
      const r2 = seeded(seed + 1);
      const r3 = seeded(seed + 2);

      const heartRate = Math.round(68 + r1 * 28);
      const systolic = Math.round(118 + r2 * 32);
      const diastolic = Math.round(Math.min(systolic - 35, 72 + r3 * 22));

      const iso = at.toISOString();
      observations.push(
        heartRateObservation(patientId, iso, heartRate),
        bloodPressureObservation(patientId, iso, systolic, diastolic)
      );
    }
  }

  return observations;
}

async function postBatch(observations, batchSize = 8) {
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await Promise.all(batch.map((obs) => fhirPost('Observation', obs)));
  }
}

async function main() {
  console.log(
    `Seeding cardiac vitals (${DAYS} days × ${READINGS_PER_DAY}/day) for ${PATIENT_IDS.length} patients\n`
  );

  for (let i = 0; i < PATIENT_IDS.length; i++) {
    const patientId = PATIENT_IDS[i];
    const observations = buildReadings(patientId, i);
    const hrCount = observations.filter((o) => o.code?.coding?.[0]?.code === '8867-4').length;
    const bpCount = observations.length - hrCount;

    console.log(`  Patient/${patientId}: posting ${hrCount} heart rate + ${bpCount} blood pressure...`);
    await postBatch(observations);
    console.log(`  ✓ Done Patient/${patientId}`);
  }

  console.log('\nDone. Open each patient chart and use 1 Week / 2 Weeks / 1 Month on Heart Rate and Blood Pressure.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
