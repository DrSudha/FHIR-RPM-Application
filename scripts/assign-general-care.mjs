/**
 * Assigns General care enrolment to patients who should appear under General Care.
 * Usage: node scripts/assign-general-care.mjs [baseUrl]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';

const GENERAL_CARE_PATIENTS = [
  { id: '46976cf7-b0bf-be20-39a5-9f425a52886d', name: 'Lindsay Michelle Zieme' },
  { id: '62f60bdb-cc5c-8305-b98b-f2b229a55eca', name: 'Angel Rocio Konopelski' },
  { id: '6fbddf55-7096-b883-7cd3-260f27953080', name: "Clarinda Serena O'Connell" },
  { id: '66e7c70a-819c-4aba-a112-44f3215872ef', name: 'Elena Kowalski' },
];

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

async function hasGeneralEnrolment(patientId) {
  const res = await fetch(`${API_BASE}/Condition?patient=${patientId}`);
  const data = await res.json().catch(() => ({}));
  return (
    data.entry?.some((e) =>
      (e.resource?.code?.text || '').toLowerCase() === 'general care enrolment'
    ) ?? false
  );
}

function generalCareCondition(patientId) {
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
    code: { text: 'General care enrolment' },
    subject: { reference: `Patient/${patientId}` },
    recordedDate: new Date().toISOString(),
  };
}

async function main() {
  console.log(`Assigning General care enrolment via ${API_BASE}\n`);

  for (const patient of GENERAL_CARE_PATIENTS) {
    if (await hasGeneralEnrolment(patient.id)) {
      console.log(`  · ${patient.name} — already General care`);
      continue;
    }

    await fhirPost('Condition', generalCareCondition(patient.id));
    console.log(`  ✓ ${patient.name} (Patient/${patient.id})`);
  }

  console.log('\nDone. Refresh the home page to see them under General Care.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
