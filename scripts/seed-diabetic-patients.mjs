/**
 * Creates diabetic patients on the FHIR server via the local Next.js proxy.
 * Usage: node scripts/seed-diabetic-patients.mjs [baseUrl]
 * Default baseUrl: http://localhost:3000/api/fhir
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';

const PATIENTS = [
  {
    given: ['Anita'],
    family: 'Sharma',
    gender: 'female',
    birthDate: '1968-03-14',
    condition: 'Type 2 diabetes mellitus',
  },
  {
    given: ['Robert'],
    family: 'Nguyen',
    gender: 'male',
    birthDate: '1955-11-02',
    condition: 'Diabetes mellitus, controlled',
  },
  {
    given: ['Elena'],
    family: 'Kowalski',
    gender: 'female',
    birthDate: '1972-07-28',
    condition: 'Gestational diabetes history',
  },
  {
    given: ['James'],
    family: 'Okafor',
    gender: 'male',
    birthDate: '1981-01-19',
    condition: 'Hyperglycemia — monitoring',
  },
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

async function main() {
  console.log(`Seeding ${PATIENTS.length} diabetic patients via ${API_BASE}\n`);

  for (const p of PATIENTS) {
    const patient = await fhirPost('Patient', {
      resourceType: 'Patient',
      name: [{ use: 'official', family: p.family, given: p.given }],
      gender: p.gender,
      birthDate: p.birthDate,
    });

    const patientId = patient.id;
    if (!patientId) {
      throw new Error(`Patient created but no id returned for ${p.given.join(' ')} ${p.family}`);
    }

    await fhirPost('Condition', {
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
        text: p.condition,
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '44054006',
            display: 'Diabetes mellitus type 2',
          },
        ],
      },
      subject: { reference: `Patient/${patientId}` },
      onsetDateTime: `${p.birthDate.split('-')[0]}-06-01`,
      recordedDate: new Date().toISOString(),
    });

    console.log(`  ✓ ${p.given.join(' ')} ${p.family} (Patient/${patientId}) — ${p.condition}`);
  }

  console.log('\nDone. Refresh the app home page to see them under Diabetic Care.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
