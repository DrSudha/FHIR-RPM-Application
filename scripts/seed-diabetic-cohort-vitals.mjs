/**
 * Seeds wearable vitals, respiratory rate, and recent lab glucose for all
 * diabetic care enrolment patients (skips those already fully seeded).
 *
 * Includes warning and critical readings aligned with vitalRangeAlerts thresholds.
 *
 * Usage: node scripts/seed-diabetic-cohort-vitals.mjs [baseUrl]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const DIABETIC_ENROLMENT = 'diabetic care enrolment';
const SKIP_IF_HR_COUNT_AT_LEAST = 50;

const WEARABLE_DAYS = 30;
const WEIGHT_DAYS = 60;
const BP_HOURS = [8, 20];
const O2_HOURS = [9, 21];
const HR_HOURS_THREE = [7, 14, 21];
const HR_HOURS_TWO = [8, 19];
const RR_HOURS_THREE = [8, 14, 20];
const RR_HOURS_FOUR = [7, 12, 17, 22];
const GLUCOSE_HOURS = [7, 18];

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

function patientName(patient) {
  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  return [given, family].filter(Boolean).join(' ') || patient.id;
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
    valueQuantity: { value: percent, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
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
    valueQuantity: { value: weightKg, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
  };
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

function resolveHeartRate(patientId, patientIndex, dayOffset, slot, daySeed) {
  const seed = daySeed * 100 + slot;
  let bpm = Math.round(68 + seeded(seed) * 26);

  const spike = hashString(`${patientId}-hr-${dayOffset}-${slot}`);
  if (patientIndex % 3 === 0 && dayOffset === 4 && slot === 0) return 148;
  if (patientIndex % 3 === 1 && dayOffset === 9 && slot === 1) return 108;
  if (patientIndex % 3 === 2 && dayOffset === 14 && slot === 0) return 142;
  if (seeded(spike + 1) > 0.94) return 145;
  if (seeded(spike + 2) > 0.88) return 112;

  return bpm;
}

function resolveBloodPressure(patientId, patientIndex, dayOffset, slot, daySeed) {
  const seed = daySeed * 200 + slot;
  let systolic = Math.round(116 + seeded(seed) * 22);
  let diastolic = Math.round(Math.min(systolic - 40, 72 + seeded(seed + 1) * 16));

  if (patientIndex % 3 === 0 && dayOffset === 6 && slot === 1) return { systolic: 138, diastolic: 92 };
  if (patientIndex % 3 === 1 && dayOffset === 3 && slot === 0) return { systolic: 158, diastolic: 98 };
  if (patientIndex % 3 === 2 && dayOffset === 11 && slot === 1) return { systolic: 132, diastolic: 88 };
  if (seeded(seed + 3) > 0.93) return { systolic: 152, diastolic: 96 };
  if (seeded(seed + 4) > 0.86) return { systolic: 134, diastolic: 92 };

  return { systolic, diastolic };
}

function resolveO2(patientId, patientIndex, dayOffset, slot, daySeed) {
  const seed = daySeed * 300 + slot;
  let o2 = Math.round(94 + seeded(seed) * 5);

  if (patientIndex % 3 === 1 && dayOffset === 7 && slot === 0) return 88;
  if (patientIndex % 3 === 2 && dayOffset === 5 && slot === 1) return 78;
  if (patientIndex % 3 === 0 && dayOffset === 15 && slot === 0) return 89;
  if (seeded(seed + 5) > 0.92) return 79;
  if (seeded(seed + 6) > 0.85) return 88;

  return o2;
}

function resolveRespiratoryRate(patientId, patientIndex, dayOffset, slot, daySeed) {
  const seed = daySeed * 400 + slot;
  let rate = Math.round(14 + seeded(seed) * 8);

  if (patientIndex % 3 === 1 && dayOffset === 8 && slot === 2) return 32;
  if (patientIndex % 3 === 2 && dayOffset === 12 && slot === 1) return 27;
  if (patientIndex % 3 === 0 && dayOffset === 18 && slot === 0) return 28;
  if (seeded(seed + 7) > 0.93) return 31;
  if (seeded(seed + 8) > 0.87) return 26;

  return rate;
}

function resolveGlucose(patientId, patientIndex, dayOffset, slot, daySeed) {
  const seed = daySeed * 500 + slot;
  let glucose = Math.round(95 + seeded(seed) * 35);

  if (patientIndex % 3 === 0 && dayOffset === 2 && slot === 0) return 218;
  if (patientIndex % 3 === 1 && dayOffset === 6 && slot === 1) return 142;
  if (patientIndex % 3 === 2 && dayOffset === 10 && slot === 0) return 205;
  if (seeded(seed + 9) > 0.91) return 210;
  if (seeded(seed + 10) > 0.84) return 138;

  return glucose;
}

function estimateBaseWeightKg(patientId, heightCm) {
  const hash = hashString(`${patientId}-weight`);
  const targetBmi = 24 + (hash % 7);
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

function buildPatientObservations(patientId, patientIndex, baseWeightKg) {
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
      observations.push(
        heartRateObservation(
          patientId,
          atDayTime(day, hrHours[slot], 10 + slot * 8),
          resolveHeartRate(patientId, patientIndex, dayOffset, slot, daySeed)
        )
      );
    }

    for (let slot = 0; slot < BP_HOURS.length; slot += 1) {
      const { systolic, diastolic } = resolveBloodPressure(
        patientId,
        patientIndex,
        dayOffset,
        slot,
        daySeed
      );
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
      observations.push(
        oxygenSaturationObservation(
          patientId,
          atDayTime(day, O2_HOURS[slot], 30 + slot * 4),
          resolveO2(patientId, patientIndex, dayOffset, slot, daySeed)
        )
      );
    }

    const rrSlots = seeded(daySeed + 1) > 0.4 ? 4 : 3;
    const rrHours = rrSlots === 4 ? RR_HOURS_FOUR : RR_HOURS_THREE;
    for (let slot = 0; slot < rrHours.length; slot += 1) {
      observations.push(
        respiratoryRateObservation(
          patientId,
          atDayTime(day, rrHours[slot], 5 + slot * 11),
          resolveRespiratoryRate(patientId, patientIndex, dayOffset, slot, daySeed)
        )
      );
    }

    for (let slot = 0; slot < GLUCOSE_HOURS.length; slot += 1) {
      observations.push(
        glucoseObservation(
          patientId,
          atDayTime(day, GLUCOSE_HOURS[slot], 15 + slot * 10),
          resolveGlucose(patientId, patientIndex, dayOffset, slot, daySeed)
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

async function observationCount(patientId, code) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${code}&_summary=count`
  );
  return bundle.total ?? 0;
}

function isDiabeticEnrolment(text) {
  return (text || '').toLowerCase().trim() === DIABETIC_ENROLMENT;
}

async function findDiabeticCarePatients() {
  const patientBundle = await fhirGet('Patient?_count=100');
  const patients = (patientBundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'Patient');

  const diabetic = [];

  for (const patient of patients) {
    const conditionBundle = await fhirGet(`Condition?patient=${patient.id}`);
    const conditions = (conditionBundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'Condition');

    if (conditions.some((condition) => isDiabeticEnrolment(condition.code?.text))) {
      diabetic.push(patient);
    }
  }

  return diabetic;
}

async function main() {
  console.log(`Seeding diabetic care cohort vitals via ${API_BASE}\n`);

  const patients = await findDiabeticCarePatients();
  if (patients.length === 0) {
    console.log('No diabetic care enrolment patients found.');
    return;
  }

  let seededCount = 0;

  for (let index = 0; index < patients.length; index += 1) {
    const patient = patients[index];
    const name = patientName(patient);
    const hrCount = await observationCount(patient.id, '8867-4');

    if (hrCount >= SKIP_IF_HR_COUNT_AT_LEAST) {
      console.log(`· ${name} — skipped (already has ${hrCount} heart rate readings)`);
      continue;
    }

    const baseWeightKg = await resolveBaseWeightKg(patient.id);
    const observations = buildPatientObservations(patient.id, index, baseWeightKg);

    const counts = {
      hr: observations.filter((o) => o.code?.coding?.[0]?.code === '8867-4').length,
      bp: observations.filter((o) => o.code?.coding?.[0]?.code === '55284-4').length,
      o2: observations.filter((o) => o.code?.coding?.[0]?.code === '59408-5').length,
      rr: observations.filter((o) => o.code?.coding?.[0]?.code === '9279-1').length,
      weight: observations.filter((o) => o.code?.coding?.[0]?.code === '29463-7').length,
      glucose: observations.filter((o) => o.code?.coding?.[0]?.code === '15074-8').length,
    };

    console.log(`→ ${name} (${patient.id})`);
    console.log(
      `    HR ${counts.hr}, BP ${counts.bp}, O₂ ${counts.o2}, RR ${counts.rr}, weight ${counts.weight}, glucose ${counts.glucose}`
    );

    await postBatch(observations);
    console.log(`  ✓ Posted ${observations.length} observations\n`);
    seededCount += 1;
  }

  console.log(
    seededCount > 0
      ? `Done. Seeded ${seededCount} diabetic care patient(s). Refresh patient charts to review.`
      : 'Done. All diabetic care patients already had wearable vitals seeded.'
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
