/**
 * Removes weight observations that create impossible day-to-day changes
 * (e.g. anthropometric backfill duplicates on the same day as seeded vitals).
 *
 * Usage: node scripts/fix-outlier-weight-observations.mjs [baseUrl]
 */

const API_BASE = process.argv[2] || 'http://localhost:3000/api/fhir';
const MAX_DAILY_CHANGE_KG = 3;

async function fhirGet(path) {
  const res = await fetch(`${API_BASE}/${path}`, {
    headers: { Accept: 'application/fhir+json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function fhirDelete(path) {
  const res = await fetch(`${API_BASE}/${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`DELETE ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
}

function toDayKey(iso) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function findOutlierIds(readings) {
  const toDelete = new Set();

  const byDay = new Map();
  for (const reading of readings) {
    const key = toDayKey(reading.iso);
    const group = byDay.get(key) || [];
    group.push(reading);
    byDay.set(key, group);
  }

  for (const group of byDay.values()) {
    if (group.length < 2) continue;
    const values = group.map((r) => r.kg);
    const spread = Math.max(...values) - Math.min(...values);
    if (spread <= MAX_DAILY_CHANGE_KG) continue;

    const dayKey = toDayKey(group[0].iso);
    const referenceValues = readings
      .filter((reading) => toDayKey(reading.iso) !== dayKey)
      .map((reading) => reading.kg);
    const referenceMedian =
      referenceValues.length > 0 ? median(referenceValues) : median(values);

    const keep = group.reduce((best, current) =>
      Math.abs(current.kg - referenceMedian) < Math.abs(best.kg - referenceMedian) ? current : best
    );

    for (const reading of group) {
      if (reading.id !== keep.id) {
        toDelete.add(reading.id);
      }
    }
  }

  for (let i = 1; i < readings.length; i += 1) {
    const prev = readings[i - 1];
    const cur = readings[i];
    const delta = cur.kg - prev.kg;
    if (Math.abs(delta) <= MAX_DAILY_CHANGE_KG) continue;
    if (toDayKey(prev.iso) === toDayKey(cur.iso)) continue;

    const prevDay = new Date(prev.iso);
    const curDay = new Date(cur.iso);
    const dayGap = Math.round((curDay - prevDay) / (24 * 60 * 60 * 1000));
    if (dayGap > 1) {
      const next = readings[i + 1];
      if (!next || Math.abs(next.kg - cur.kg) > MAX_DAILY_CHANGE_KG) {
        toDelete.add(cur.id);
      }
      continue;
    }

    const next = readings[i + 1];
    const prevPrev = readings[i - 2];
    const curDistNext = next ? Math.abs(cur.kg - next.kg) : Infinity;
    const prevDistNext = next ? Math.abs(prev.kg - next.kg) : Infinity;
    const curDistPrevPrev = prevPrev ? Math.abs(cur.kg - prevPrev.kg) : Infinity;
    const prevDistPrevPrev = prevPrev ? Math.abs(prev.kg - prevPrev.kg) : Infinity;

    if (curDistNext > prevDistNext && curDistPrevPrev > prevDistPrevPrev) {
      toDelete.add(cur.id);
    } else if (prevDistNext > curDistNext && prevDistPrevPrev > curDistPrevPrev) {
      toDelete.add(prev.id);
    }
  }

  return [...toDelete];
}

async function main() {
  console.log(`Fixing outlier weight observations via ${API_BASE}\n`);

  const patientBundle = await fhirGet('Patient?_count=100');
  const patients = (patientBundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'Patient');

  let deleted = 0;

  for (const patient of patients) {
    const name = [patient.name?.[0]?.given?.join(' '), patient.name?.[0]?.family]
      .filter(Boolean)
      .join(' ');

    const bundle = await fhirGet(
      `Observation?subject=Patient/${patient.id}&code=29463-7&_sort=date&_count=200`
    );
    const readings = (bundle.entry || [])
      .map((entry) => entry.resource)
      .filter((resource) => resource?.resourceType === 'Observation')
      .map((resource) => ({
        id: resource.id,
        iso: resource.effectiveDateTime,
        kg: resource.valueQuantity?.value,
      }))
      .filter((reading) => typeof reading.kg === 'number' && reading.iso);

    if (readings.length < 2) continue;

    const outlierIds = findOutlierIds(readings);
    if (outlierIds.length === 0) continue;

    console.log(`→ ${name} — removing ${outlierIds.length} outlier weight reading(s)`);
    for (const id of outlierIds) {
      const reading = readings.find((r) => r.id === id);
      await fhirDelete(`Observation/${id}`);
      console.log(`  ✓ deleted ${reading?.kg} kg on ${reading?.iso?.slice(0, 10)}`);
      deleted += 1;
    }
  }

  console.log(deleted > 0 ? `\nDone. Removed ${deleted} outlier weight observation(s).` : '\nDone. No outlier weights found.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
