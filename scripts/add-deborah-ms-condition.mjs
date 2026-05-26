/**
 * Adds Early Multiple Sclerosis to Deborah Jackson's problem list.
 * Usage: node scripts/add-deborah-ms-condition.mjs [baseUrl]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const TARGET_GIVEN = 'Deborah';
const TARGET_FAMILY = 'Jackson';
const CONDITION_TEXT = 'Early Multiple Sclerosis';

async function fhirGet(path) {
  const res = await fetch(`${API_BASE}/${path}`, {
    headers: { Accept: 'application/fhir+json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GET ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function fhirPost(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`POST ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

function patientDisplayName(patient) {
  const given = patient.name?.[0]?.given?.join(' ') || '';
  const family = patient.name?.[0]?.family || '';
  return [given, family].filter(Boolean).join(' ');
}

function matchesDeborahJackson(patient) {
  const given = (patient.name?.[0]?.given?.join(' ') || '').toLowerCase();
  const family = (patient.name?.[0]?.family || '').toLowerCase();
  return given.includes(TARGET_GIVEN.toLowerCase()) && family === TARGET_FAMILY.toLowerCase();
}

function buildProblemListCondition(patientId) {
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
      text: CONDITION_TEXT,
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '24700007',
          display: 'Multiple sclerosis',
        },
      ],
    },
    subject: { reference: `Patient/${patientId}` },
    recordedDate: new Date().toISOString(),
  };
}

async function findDeborahJackson() {
  const searches = [
    `Patient?family=${encodeURIComponent(TARGET_FAMILY)}&given=${encodeURIComponent(TARGET_GIVEN)}`,
    `Patient?name=${encodeURIComponent(`${TARGET_GIVEN} ${TARGET_FAMILY}`)}`,
    `Patient?family=${encodeURIComponent(TARGET_FAMILY)}`,
  ];

  for (const path of searches) {
    const bundle = await fhirGet(path);
    const patients = (bundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'Patient');

    const match = patients.find(matchesDeborahJackson);
    if (match) return match;
  }

  return null;
}

async function hasCondition(patientId, text) {
  const bundle = await fhirGet(`Condition?patient=${patientId}`);
  return (
    bundle.entry?.some((entry) => {
      const condition = entry.resource;
      const label = (condition?.code?.text || condition?.code?.coding?.[0]?.display || '').toLowerCase();
      return label === text.toLowerCase();
    }) ?? false
  );
}

async function main() {
  console.log(`Looking up ${TARGET_GIVEN} ${TARGET_FAMILY} via ${API_BASE}\n`);

  const patient = await findDeborahJackson();
  if (!patient) {
    throw new Error(`Patient ${TARGET_GIVEN} ${TARGET_FAMILY} was not found.`);
  }

  console.log(`Found ${patientDisplayName(patient)} (Patient/${patient.id})`);

  if (await hasCondition(patient.id, CONDITION_TEXT)) {
    console.log(`Already has problem list item: ${CONDITION_TEXT}`);
    return;
  }

  const created = await fhirPost('Condition', buildProblemListCondition(patient.id));
  console.log(`Added problem list item: ${CONDITION_TEXT}`);
  console.log(`Condition/${created.id}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
