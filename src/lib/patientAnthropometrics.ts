export type AnthropometricSnapshot = {
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
};

type VitalPoint = {
  value: number;
  date?: Date;
  dateStr?: string;
};

export function calculateBmi(heightCm: number, weightKg: number): number | null {
  if (heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  if (!Number.isFinite(bmi) || bmi <= 0) return null;
  return Math.round(bmi * 10) / 10;
}

export function resolvePatientHeightCm(vitals: {
  [key: string]: VitalPoint[] | undefined;
}): number | null {
  return latestValue(vitals['8302-2']);
}

function dayKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** One weight per day; when duplicates disagree, keep the reading closest to the series median. */
export function collapseWeightObservationsByDay(
  points: Array<{ date: Date; dateStr: string; value: number }>
): Array<{ date: Date; dateStr: string; value: number }> {
  if (points.length <= 1) return points;

  const seriesMedian = median(points.map((point) => point.value));
  const byDay = new Map<string, Array<{ date: Date; dateStr: string; value: number }>>();

  points.forEach((point) => {
    const key = dayKeyFromDate(point.date);
    const group = byDay.get(key) || [];
    group.push(point);
    byDay.set(key, group);
  });

  const collapsed = [...byDay.entries()]
    .map(([, group]) => {
      if (group.length === 1) return group[0];
      return group.reduce((best, current) =>
        Math.abs(current.value - seriesMedian) < Math.abs(best.value - seriesMedian) ? current : best
      );
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return collapsed;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function latestValue(points: VitalPoint[] | undefined): number | null {
  if (!points?.length) return null;
  const value = points[points.length - 1]?.value;
  return typeof value === 'number' && value > 0 ? value : null;
}

export function resolveWeightObservationsFromVitals(vitals: {
  [key: string]: VitalPoint[] | undefined;
}): Array<{ date: Date; dateStr: string; value: number }> {
  const raw = vitals['29463-7'] || [];
  const withDates = raw.filter(
    (point): point is VitalPoint & { date: Date; dateStr: string; value: number } =>
      point.date instanceof Date &&
      typeof point.dateStr === 'string' &&
      typeof point.value === 'number'
  );
  return collapseWeightObservationsByDay(withDates);
}

export function resolveAnthropometricsFromVitals(vitals: {
  [key: string]: VitalPoint[] | undefined;
}): AnthropometricSnapshot {
  const heightCm = resolvePatientHeightCm(vitals);
  const weightSeries = resolveWeightObservationsFromVitals(vitals);
  const weightKg = latestValue(weightSeries);
  const recordedBmi = latestValue(vitals['39156-5']);

  let resolvedHeight = heightCm;
  if (!resolvedHeight && weightKg && recordedBmi) {
    resolvedHeight = Math.round((Math.sqrt(weightKg / recordedBmi) * 100) * 10) / 10;
  }

  const bmi =
    resolvedHeight && weightKg
      ? calculateBmi(resolvedHeight, weightKg)
      : recordedBmi;

  return {
    heightCm: resolvedHeight,
    weightKg,
    bmi,
  };
}

export function formatHeight(heightCm: number | null): string {
  return heightCm != null ? `${heightCm} cm` : '—';
}

export function formatWeight(weightKg: number | null): string {
  return weightKg != null ? `${weightKg} kg` : '—';
}

export function formatBmi(bmi: number | null): string {
  return bmi != null ? `${bmi} kg/m²` : '—';
}

export type DailyWeightIncrease = {
  dateStr: string;
  previousDateStr: string;
  previousKg: number;
  currentKg: number;
  deltaKg: number;
};

function calendarDayGap(previous: Date, current: Date): number {
  const start = new Date(previous);
  start.setHours(0, 0, 0, 0);
  const end = new Date(current);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

/** Largest 1-day weight increase from a chronologically sorted series (after daily collapse). */
export function findLargestDailyWeightIncrease(
  points: Array<{ date: Date; dateStr: string; value: number }>
): DailyWeightIncrease | null {
  const collapsed = collapseWeightObservationsByDay(points);
  let largest: DailyWeightIncrease | null = null;

  for (let index = 1; index < collapsed.length; index += 1) {
    const previous = collapsed[index - 1];
    const current = collapsed[index];
    if (calendarDayGap(previous.date, current.date) !== 1) continue;

    const deltaKg = Math.round((current.value - previous.value) * 10) / 10;
    if (deltaKg < 1) continue;

    if (!largest || deltaKg > largest.deltaKg) {
      largest = {
        dateStr: current.dateStr,
        previousDateStr: previous.dateStr,
        previousKg: previous.value,
        currentKg: current.value,
        deltaKg,
      };
    }
  }

  return largest;
}

export function findLatestDailyWeightIncrease(
  points: Array<{ date: Date; dateStr: string; value: number }>
): DailyWeightIncrease | null {
  const collapsed = collapseWeightObservationsByDay(points);
  for (let index = collapsed.length - 1; index >= 1; index -= 1) {
    const previous = collapsed[index - 1];
    const current = collapsed[index];
    if (calendarDayGap(previous.date, current.date) !== 1) continue;

    const deltaKg = Math.round((current.value - previous.value) * 10) / 10;
    if (deltaKg >= 1) {
      return {
        dateStr: current.dateStr,
        previousDateStr: previous.dateStr,
        previousKg: previous.value,
        currentKg: current.value,
        deltaKg,
      };
    }
  }

  return null;
}

export function buildWeightChangeLabels(
  readings: Array<{ date: Date; dateStr: string; value: number }>
): Map<string, string> {
  const chronological = [...readings].sort((a, b) => a.date.getTime() - b.date.getTime());
  const labels = new Map<string, string>();

  chronological.forEach((point, index) => {
    if (index === 0) {
      labels.set(point.dateStr, '—');
      return;
    }

    const previous = chronological[index - 1].value;
    const diff = Math.round((point.value - previous) * 10) / 10;
    if (diff > 0) {
      labels.set(point.dateStr, `Increased ${diff} kg`);
    } else if (diff < 0) {
      labels.set(point.dateStr, `Decreased ${Math.abs(diff)} kg`);
    } else {
      labels.set(point.dateStr, 'No change');
    }
  });

  return labels;
}

export function formatWeightChartDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
