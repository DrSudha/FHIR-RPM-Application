/** Generates EDSS score timeline from MS diagnosis to present. */

export const MS_DIAGNOSIS_DATE = '1999-04-17T10:30:00.000Z';
export const MS_RECORDED_DATE = '1999-04-17T14:15:00.000Z';
export const EDSS_SNOMED_CODE = '273513009';

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

function roundEdss(value) {
  return Math.round(value * 2) / 2;
}

/**
 * EDSS assessments every 6–8 months (randomised) from diagnosis until now.
 * Scores progress from early MS to current disability (>6).
 */
export function buildEdssScoreTimeline(
  patientId,
  {
    diagnosisDate = MS_DIAGNOSIS_DATE,
    endDate = new Date(),
    startScore = 1.5,
    currentScore = 6.5,
  } = {}
) {
  const diagnosis = new Date(diagnosisDate);
  const end = new Date(endDate);
  const schedule = [];
  let current = new Date(diagnosis);
  let index = 0;

  while (current.getTime() <= end.getTime()) {
    schedule.push(new Date(current));
    index += 1;
    const gapMonths = 6 + Math.floor(seeded(hashString(`${patientId}-edss-gap-${index}`)) * 3);
    current = addMonths(current, gapMonths);
  }

  const count = schedule.length;
  if (count === 0) return [];

  return schedule.map((date, i) => {
    const progress = count === 1 ? 1 : i / (count - 1);
    const trend = startScore + (currentScore - startScore) * progress;
    const noise = (seeded(hashString(`${patientId}-edss-val-${i}`)) - 0.5) * 0.6;
    let score = roundEdss(trend + noise);
    score = Math.max(0, Math.min(9.5, score));

    if (i === count - 1) {
      score = Math.max(currentScore, score);
    }

    const at = new Date(date);
    at.setHours(11, seeded(hashString(`${patientId}-edss-time-${i}`)) > 0.5 ? 30 : 0, 0, 0);

    return {
      date: at.toISOString(),
      score,
      monthsSinceDiagnosis: Math.round((at.getTime() - diagnosis.getTime()) / (30.44 * 24 * 3600 * 1000)),
    };
  });
}
