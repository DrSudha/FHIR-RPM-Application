/**
 * Seeds respiratory rate readings for a patient: 30 days, 3–4 readings per day.
 *
 * Usage: node scripts/seed-patient-respiratory-rate.mjs [baseUrl] [patientId]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const PATIENT_ID = process.argv[3] || '4be2f5e1-8740-4c6b-beb9-697337ffb95e';

const DAYS = 30;
const RR_HOURS_THREE = [8, 14, 20];
const RR_HOURS_FOUR = [7, 12, 17, 22];

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
    valueQuantity: {
      value: rate,
      unit: '/min',
      system: 'http://unitsofmeasure.org',
      code: '/min',
    },
  };
}

function buildRespiratoryReadings(patientId) {
  const observations = [];
  const now = new Date();

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    const daySeed = hashString(`${patientId}-rr-${dayOffset}`);
    const slots = seeded(daySeed) > 0.4 ? 4 : 3;
    const hours = slots === 4 ? RR_HOURS_FOUR : RR_HOURS_THREE;

    for (let slot = 0; slot < hours.length; slot += 1) {
      const seed = daySeed * 100 + slot;
      const rate = Math.round(14 + seeded(seed) * 8);
      observations.push(
        respiratoryRateObservation(
          patientId,
          atDayTime(day, hours[slot], 5 + slot * 11),
          rate
        )
      );
    }
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
  const observations = buildRespiratoryReadings(PATIENT_ID);
  console.log(
    `Seeding ${observations.length} respiratory rate readings (${DAYS} days, 3–4/day) for Patient/${PATIENT_ID}\n`
  );
  await postBatch(observations);
  console.log('Done. Refresh the patient table view to see respiratory rate data.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
