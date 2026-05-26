export type DailyStepReading = {
  date: Date;
  dateStr: string;
  steps: number;
};

export type DailySleepReading = {
  date: Date;
  dateStr: string;
  hours: number;
  quality: 'Good' | 'Fair' | 'Poor';
};

type ObservationPoint = { date: Date; dateStr: string; value: number };

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function seeded(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function dayAtOffset(daysAgo: number): Date {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - daysAgo);
  return day;
}

function sleepQuality(hours: number): DailySleepReading['quality'] {
  if (hours >= 7) return 'Good';
  if (hours >= 5.5) return 'Fair';
  return 'Poor';
}

function collapseByCalendarDay(points: ObservationPoint[]): ObservationPoint[] {
  const byDay = new Map<string, ObservationPoint>();

  points.forEach((point) => {
    const dayKey = point.date.toISOString().slice(0, 10);
    const existing = byDay.get(dayKey);
    if (!existing || point.date.getTime() > existing.date.getTime()) {
      byDay.set(dayKey, point);
    }
  });

  return Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Resolve daily step totals from FHIR Observation readings (LOINC 55423-8). */
export function resolveDailyStepCountsFromObservations(
  stepPoints: ObservationPoint[],
  fallbackPatientId?: string,
  days = 7
): DailyStepReading[] {
  const collapsed = collapseByCalendarDay(stepPoints);
  if (collapsed.length > 0) {
    return collapsed.slice(-days).map((point) => ({
      date: point.date,
      dateStr: point.dateStr,
      steps: Math.round(point.value),
    }));
  }

  if (fallbackPatientId) {
    return generateDailyStepCounts(fallbackPatientId, days);
  }

  return [];
}

/** Resolve nightly sleep duration from FHIR Observation readings (LOINC 93832-4). */
export function resolveSleepPatternFromObservations(
  sleepPoints: ObservationPoint[],
  fallbackPatientId?: string,
  days = 7
): DailySleepReading[] {
  const collapsed = collapseByCalendarDay(sleepPoints);
  if (collapsed.length > 0) {
    return collapsed.slice(-days).map((point) => ({
      date: point.date,
      dateStr: point.dateStr,
      hours: point.value,
      quality: sleepQuality(point.value),
    }));
  }

  if (fallbackPatientId) {
    return generateSleepPattern(fallbackPatientId, days);
  }

  return [];
}

/** Deterministic daily step totals for wearable display. */
export function generateDailyStepCounts(patientId: string, days = 7): DailyStepReading[] {
  const readings: DailyStepReading[] = [];

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
    const date = dayAtOffset(dayOffset);
    const seed = hashString(`${patientId}-steps-${dayOffset}`);
    const base = 5200 + (hashString(patientId) % 2800);
    const weekdayAdjust = date.getDay() === 0 || date.getDay() === 6 ? 900 : 0;
    const steps = Math.round(base + weekdayAdjust + seeded(seed) * 3200);

    readings.push({
      date,
      dateStr: date.toISOString(),
      steps,
    });
  }

  return readings.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Deterministic nightly sleep duration for wearable display. */
export function generateSleepPattern(patientId: string, days = 7): DailySleepReading[] {
  const readings: DailySleepReading[] = [];

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
    const date = dayAtOffset(dayOffset);
    const seed = hashString(`${patientId}-sleep-${dayOffset}`);
    const hours = Math.round((5.2 + seeded(seed) * 3.4) * 10) / 10;

    readings.push({
      date,
      dateStr: date.toISOString(),
      hours,
      quality: sleepQuality(hours),
    });
  }

  return readings.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function formatSteps(steps: number): string {
  return steps.toLocaleString();
}

export function formatSleepHours(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
}
