/**
 * Rewrites legacy "general care subcategory: {slug}" conditions to display labels (CKD, Obesity, etc.).
 * Usage: node scripts/fix-general-care-subcategory-labels.mjs [baseUrl]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const PREFIX = 'general care subcategory: ';

const SUBCATEGORY_LABELS = {
  ckd: 'CKD',
  obesity: 'Obesity',
  'muscle-weakness': 'Muscle weakness',
  'mobility-assistance': 'Mobility assistance',
};

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

async function fhirPut(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`PUT ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

function labelForLegacyText(text) {
  const normalized = text.toLowerCase().trim();
  if (!normalized.startsWith(PREFIX)) return null;

  const slug = normalized.slice(PREFIX.length).trim();
  return SUBCATEGORY_LABELS[slug] ?? null;
}

async function main() {
  console.log(`Fixing general care sub category labels via ${API_BASE}\n`);

  const patientBundle = await fhirGet('Patient?_count=100');
  const patients = (patientBundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'Patient');

  let updated = 0;

  for (const patient of patients) {
    const conditionBundle = await fhirGet(`Condition?patient=${patient.id}`);
    const conditions = (conditionBundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'Condition');

    for (const condition of conditions) {
      const currentText = condition.code?.text || '';
      const label = labelForLegacyText(currentText);
      if (!label) continue;

      await fhirPut(`Condition/${condition.id}`, {
        ...condition,
        code: {
          ...condition.code,
          text: label,
        },
      });

      const given = patient.name?.[0]?.given?.join(' ') || '';
      const family = patient.name?.[0]?.family || '';
      console.log(`  ✓ ${given} ${family}: "${currentText}" → "${label}"`);
      updated += 1;
    }
  }

  console.log(`\nDone. Updated ${updated} condition(s).`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
