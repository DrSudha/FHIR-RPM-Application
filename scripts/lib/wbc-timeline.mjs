/** Generates WBC lab timeline with gradual decline and fluctuation. */

import { MS_DIAGNOSIS_DATE } from './edss-timeline.mjs';

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

function addMonths(date, months) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== day) next.setDate(0);
  return next;
}

/**
 * WBC readings every 6–12 months (denser in the last 5 years).
 * Values trend downward with realistic fluctuation (×10⁹/L).
 */
export function buildWbcTimeline(
  patientId,
  {
    startDate = MS_DIAGNOSIS_DATE,
    endDate = new Date(),
    startWbc = 7.4,
    endWbc = 5.1,
  } = {}
) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const schedule = [];
  let current = new Date(start);
  let index = 0;

  while (current.getTime() <= end.getTime()) {
    schedule.push(new Date(current));
    index += 1;

    const yearsFromEnd = (end.getTime() - current.getTime()) / (365.25 * 24 * 3600 * 1000);
    const gapMonths =
      yearsFromEnd <= 5
        ? 6 + Math.floor(seeded(hashString(`${patientId}-wbc-gap-${index}`)) * 4)
        : 6 + Math.floor(seeded(hashString(`${patientId}-wbc-gap-${index}`)) * 7);

    current = addMonths(current, gapMonths);
  }

  const count = schedule.length;
  if (count === 0) return [];

  return schedule.map((date, i) => {
    const progress = count === 1 ? 1 : i / (count - 1);
    const trend = startWbc - (startWbc - endWbc) * progress;
    const noise = (seeded(hashString(`${patientId}-wbc-val-${i}`)) - 0.5) * 1.5;
    let value = Math.round((trend + noise) * 10) / 10;
    value = Math.max(3.8, Math.min(10.5, value));

    const at = new Date(date);
    at.setHours(8, 30, 0, 0);

    return { date: at.toISOString(), value };
  });
}
