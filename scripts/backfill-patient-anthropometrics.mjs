/**
 * Ensures height (registration LOINC 8302-2) and latest weight (29463-7) exist for all patients.
 * Usage: node scripts/backfill-patient-anthropometrics.mjs [baseUrl]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';

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

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function calculateAgeYears(birthDate) {
  if (!birthDate) return 50;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 50;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function estimateHeightCm(patientId, age, gender) {
  const hash = hashString(patientId);
  const base = gender === 'female' ? 162 : 175;
  const ageAdjust = age >= 70 ? -3 : age <= 25 ? 2 : 0;
  return Math.round(base + (hash % 19) - 9 + ageAdjust);
}

function estimateWeightKg(patientId, heightCm, age) {
  const hash = hashString(`${patientId}-weight`);
  const targetBmi = 21.5 + (hash % 10);
  const weight = targetBmi * (heightCm / 100) ** 2;
  const ageAdjust = age >= 70 ? 1.03 : 1;
  return Math.round(weight * ageAdjust * 10) / 10;
}

function buildHeightObservation(patientId, heightCm) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '8302-2',
          display: 'Body height',
        },
      ],
      text: 'Height',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: new Date().toISOString(),
    valueQuantity: { value: heightCm, unit: 'cm', system: 'http://unitsofmeasure.org', code: 'cm' },
  };
}

function buildWeightObservation(patientId, weightKg) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '29463-7',
          display: 'Body weight',
        },
      ],
      text: 'Weight',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: new Date().toISOString(),
    valueQuantity: { value: weightKg, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
  };
}

async function hasObservation(patientId, code) {
  const bundle = await fhirGet(
    `Observation?subject=Patient/${patientId}&code=${code}&_summary=count`
  );
  return (bundle.total ?? 0) > 0;
}

async function main() {
  console.log(`Backfilling height/weight via ${API_BASE}\n`);

  const patientBundle = await fhirGet('Patient?_count=100');
  const patients = (patientBundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'Patient');

  for (const patient of patients) {
    const given = patient.name?.[0]?.given?.join(' ') || '';
    const family = patient.name?.[0]?.family || '';
    const name = [given, family].filter(Boolean).join(' ');
    const age = calculateAgeYears(patient.birthDate);
    const gender = patient.gender || 'unknown';

    const hasHeight = await hasObservation(patient.id, '8302-2');
    const hasWeight = await hasObservation(patient.id, '29463-7');

    let heightCm = null;
    const added = [];

    if (!hasHeight) {
      heightCm = estimateHeightCm(patient.id, age, gender);
      await fhirPost('Observation', buildHeightObservation(patient.id, heightCm));
      added.push(`height ${heightCm} cm`);
    }

    if (!hasWeight) {
      if (!heightCm) {
        const heightBundle = await fhirGet(
          `Observation?subject=Patient/${patient.id}&code=8302-2&_sort=-date&_count=1`
        );
        heightCm = heightBundle.entry?.[0]?.resource?.valueQuantity?.value ?? estimateHeightCm(patient.id, age, gender);
      }
      const weightKg = estimateWeightKg(patient.id, heightCm, age);
      await fhirPost('Observation', buildWeightObservation(patient.id, weightKg));
      added.push(`weight ${weightKg} kg`);
    }

    console.log(`  ${added.length ? '✓' : '·'} ${name}${added.length ? ` — added ${added.join(', ')}` : ' — already complete'}`);
  }

  console.log('\nDone. Refresh patient detail pages to see banner BMI.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
