/**
 * Seeds diagnoses and vitals for Jonathan Newberhoff (cardiac / AF profile):
 *
 * - Atrial Fibrillation, Type 2 DM, Diabetic retinopathy (problem list)
 * - Heart rate: 3 readings/day × 30 days (elevated for AF)
 * - Blood pressure: 2 readings/day × 30 days
 * - Blood glucose: 1 reading/day × 30 days (hyperglycemia range)
 *
 * Usage: node scripts/seed-jonathan-newberhoff-clinical.mjs [baseUrl]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const PATIENT_ID = '963ea7ba-7405-4186-9548-65c87e4cad97';
const PATIENT_NAME = 'Jonathan Newberhoff';

const VITAL_DAYS = 30;
const HR_READINGS_PER_DAY = 3;
const HR_HOURS = [8, 14, 20];
const BP_HOURS = [9, 19];
const GLUCOSE_HOUR = 7;

const CONDITIONS = [
  {
    text: 'Atrial Fibrillation',
    snomed: { code: '49436004', display: 'Atrial fibrillation' },
    recordedDate: '2024-06-17T10:30:00.000Z',
    onsetDateTime: '2024-06-12T08:00:00.000Z',
  },
  {
    text: 'Type 2 diabetes mellitus',
    snomed: { code: '44054006', display: 'Type 2 diabetes mellitus' },
    recordedDate: '2000-03-08T14:15:00.000Z',
    onsetDateTime: '2000-03-08T14:15:00.000Z',
  },
  {
    text: 'Diabetic retinopathy',
    snomed: { code: '4855003', display: 'Diabetic retinopathy' },
    recordedDate: '2020-06-22T11:45:00.000Z',
    onsetDateTime: '2019-11-03T09:00:00.000Z',
  },
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

function labCategory() {
  return [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'laboratory',
          display: 'Laboratory',
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

function toDayKey(isoOrDate) {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildCondition(patientId, { text, snomed, recordedDate, onsetDateTime }) {
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
      coding: [{ system: 'http://snomed.info/sct', code: snomed.code, display: snomed.display }],
    },
    subject: { reference: `Patient/${patientId}` },
    recordedDate,
    onsetDateTime,
  };
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
    valueQuantity: { value: bpm, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
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
        valueQuantity: { value: systolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      },
      {
        code: {
          coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }],
        },
        valueQuantity: { value: diastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      },
    ],
  };
}

function glucoseObservation(patientId, effectiveDateTime, mgDl) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: labCategory(),
    code: {
      coding: [{ system: 'http://loinc.org', code: '15074-8', display: 'Glucose [Moles/volume] in Blood' }],
      text: 'Blood glucose',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: { value: mgDl, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' },
  };
}

/** AF profile — mostly 92–128 bpm with warning/critical spikes. */
function resolveHeartRate(dayOffset, slot) {
  const seed = hashString(`jonathan-hr-${dayOffset}-${slot}`);
  let bpm = Math.round(94 + seeded(seed) * 32);

  if (dayOffset === 3 && slot === 1) return 148;
  if (dayOffset === 8 && slot === 0) return 112;
  if (dayOffset === 14 && slot === 2) return 138;
  if (dayOffset === 21 && slot === 1) return 145;
  if (seeded(seed + 1) > 0.9) return 118;
  if (seeded(seed + 2) > 0.93) return 132;

  return bpm;
}

function resolveBloodPressure(dayOffset, slot) {
  const seed = hashString(`jonathan-bp-${dayOffset}-${slot}`);
  const systolic = Math.round(124 + seeded(seed) * 24);
  const diastolic = Math.round(Math.min(systolic - 38, 78 + seeded(seed + 1) * 18));
  return { systolic, diastolic };
}

/** Hyperglycemia — warning and critical values mixed in. */
function resolveGlucose(dayOffset) {
  const seed = hashString(`jonathan-glucose-${dayOffset}`);
  let glucose = Math.round(138 + seeded(seed) * 52);

  if (dayOffset === 2) return 218;
  if (dayOffset === 9) return 205;
  if (dayOffset === 16) return 192;
  if (dayOffset === 24) return 228;
  if (seeded(seed + 3) > 0.88) return 176;
  if (seeded(seed + 4) > 0.92) return 214;

  return glucose;
}

async function hasCondition(patientId, text) {
  const bundle = await fhirGet(`Condition?patient=${patientId}`);
  return (
    bundle.entry?.some((entry) => {
      const label = (entry.resource?.code?.text || '').toLowerCase();
      return label === text.toLowerCase();
    }) ?? false
  );
}

async function existingGlucoseDayKeys(patientId) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=15074-8&_sort=-date&_count=200`
  );
  const keys = new Set();
  for (const entry of bundle.entry || []) {
    const iso = entry.resource?.effectiveDateTime;
    if (iso) keys.add(toDayKey(iso));
  }
  return keys;
}

function buildVitalObservations(patientId, glucoseDayKeys) {
  const observations = [];
  const now = new Date();

  for (let dayOffset = VITAL_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    for (let slot = 0; slot < HR_READINGS_PER_DAY; slot += 1) {
      observations.push(
        heartRateObservation(
          patientId,
          atDayTime(day, HR_HOURS[slot], 12 + slot * 6),
          resolveHeartRate(dayOffset, slot)
        )
      );
    }

    for (let slot = 0; slot < BP_HOURS.length; slot += 1) {
      const { systolic, diastolic } = resolveBloodPressure(dayOffset, slot);
      observations.push(
        bloodPressureObservation(
          patientId,
          atDayTime(day, BP_HOURS[slot], 20 + slot * 8),
          systolic,
          diastolic
        )
      );
    }

    const dayKey = toDayKey(day);
    if (!glucoseDayKeys.has(dayKey)) {
      observations.push(
        glucoseObservation(
          patientId,
          atDayTime(day, GLUCOSE_HOUR, 35),
          resolveGlucose(dayOffset)
        )
      );
    }
  }

  return observations;
}

async function postBatch(resources, batchSize = 10) {
  for (let i = 0; i < resources.length; i += batchSize) {
    const batch = resources.slice(i, i + batchSize);
    await Promise.all(batch.map((resource) => fhirPost(resource.resourceType, resource)));
  }
}

async function observationCount(patientId, code) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${code}&_summary=count`
  );
  return bundle.total ?? 0;
}

async function main() {
  console.log(`Seeding ${PATIENT_NAME} clinical profile via ${API_BASE}\n`);

  const patient = await fhirGet(`Patient/${PATIENT_ID}`);
  if (patient.resourceType !== 'Patient') {
    throw new Error(`Patient/${PATIENT_ID} not found`);
  }

  let conditionsAdded = 0;
  for (const condition of CONDITIONS) {
    if (await hasCondition(PATIENT_ID, condition.text)) {
      console.log(`· Condition already exists: ${condition.text}`);
      continue;
    }
    const created = await fhirPost('Condition', buildCondition(PATIENT_ID, condition));
    console.log(`✓ Added condition: ${condition.text} (Condition/${created.id})`);
    conditionsAdded += 1;
  }

  const hrCount = await observationCount(PATIENT_ID, '8867-4');
  const bpCount = await observationCount(PATIENT_ID, '55284-4');

  if (hrCount >= 50) {
    console.log(`· Skipping vitals — already has ${hrCount} heart rate reading(s)`);
  } else {
    const glucoseDayKeys = await existingGlucoseDayKeys(PATIENT_ID);
    const observations = buildVitalObservations(PATIENT_ID, glucoseDayKeys);

    const counts = {
      hr: observations.filter((o) => o.code?.coding?.[0]?.code === '8867-4').length,
      bp: observations.filter((o) => o.code?.coding?.[0]?.code === '55284-4').length,
      glucose: observations.filter((o) => o.code?.coding?.[0]?.code === '15074-8').length,
    };

    console.log(`→ Posting vitals: HR ${counts.hr}, BP ${counts.bp}, glucose ${counts.glucose}`);
    await postBatch(observations);
    console.log(`✓ Posted ${observations.length} observations`);
  }

  console.log(
    `\nDone. Open ${PATIENT_NAME}'s chart to review diagnoses and vitals.`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
