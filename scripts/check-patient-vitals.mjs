const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const PATIENT_ID = process.argv[3] || '4be2f5e1-8740-4c6b-beb9-697337ffb95e';

const CODES = {
  '8867-4': 'heart rate',
  '55284-4': 'blood pressure',
  '59408-5': 'o2',
  '29463-7': 'weight',
};

async function fhirGet(path) {
  const res = await fetch(`${API_BASE}/${path}`, {
    headers: { Accept: 'application/fhir+json' },
  });
  const data = await res.json().catch(() => ({}));
  console.log(`${path} -> ${res.status}`);
  return { res, data };
}

async function main() {
  for (const [code, label] of Object.entries(CODES)) {
    const { data } = await fhirGet(
      `Observation?subject=Patient/${PATIENT_ID}&code=${code}&_count=3&_sort=-date`
    );
    const total = data.total ?? data.entry?.length ?? 0;
    const latest = data.entry?.[0]?.resource?.effectiveDateTime ?? 'none';
    console.log(`  ${label}: ${total} (latest ${latest})`);
  }

  const combined = await fhirGet(
    `Observation?subject=Patient/${PATIENT_ID}&code=8867-4,8310-5,9279-1,59408-5,8302-2,29463-7,39156-5,55284-4,15074-8&_count=1000`
  );
  const entries = combined.data.entry || [];
  const byCode = {};
  entries.forEach((e) => {
    const code = e.resource?.code?.coding?.[0]?.code || 'unknown';
    byCode[code] = (byCode[code] || 0) + 1;
  });
  console.log('\nCombined query (same as app):', entries.length, 'entries');
  console.log(byCode);
}

main().catch(console.error);
