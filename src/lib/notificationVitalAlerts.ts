import type { CareCategory } from '@/lib/careCategory';
import type { TaskHighlight } from '@/lib/dailyTaskActions';
import { resolveCardiacVitalsTask } from '@/lib/dailyTaskActions';
import {
  findPatientsWithWeightGainWarning,
  resolveMissedGlucoseNotification,
} from '@/lib/notificationActions';

export type NotificationVitalType = 'heart-rate' | 'bp' | 'weight' | 'glucose' | 'o2';

export type NotificationVitalAlert = {
  notificationId: string;
  patientId: string;
  vitalType: NotificationVitalType;
  reason?: string;
};

export type NotificationForAlertSync = {
  id: string;
  action?: 'elevated-bp' | 'missed-glucose' | 'weight-gain';
  priority?: 'high' | 'medium' | 'low';
  reviewed?: boolean;
};

const STORAGE_KEY = 'prohealth_notification_vital_alerts';
const ALERTS_UPDATED_EVENT = 'prohealth-notification-alerts-updated';

function readAll(): NotificationVitalAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(alerts: NotificationVitalAlert[]): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  window.dispatchEvent(new CustomEvent(ALERTS_UPDATED_EVENT));
}

export function saveNotificationVitalAlerts(alerts: NotificationVitalAlert[]): void {
  writeAll(alerts);
}

export function clearNotificationVitalAlerts(notificationId: string): void {
  writeAll(readAll().filter((alert) => alert.notificationId !== notificationId));
}

export function getNotificationVitalAlertsForPatient(patientId: string): NotificationVitalAlert[] {
  return readAll().filter((alert) => alert.patientId === patientId);
}

export function patientHasVitalNotificationAlert(
  patientId: string,
  vitalType: NotificationVitalType
): boolean {
  return readAll().some(
    (alert) => alert.patientId === patientId && alert.vitalType === vitalType
  );
}

export function subscribeToNotificationVitalAlerts(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleUpdate = () => listener();
  window.addEventListener(ALERTS_UPDATED_EVENT, handleUpdate);
  window.addEventListener('focus', handleUpdate);

  return () => {
    window.removeEventListener(ALERTS_UPDATED_EVENT, handleUpdate);
    window.removeEventListener('focus', handleUpdate);
  };
}

function alertsFromHighlight(
  notificationId: string,
  highlight: TaskHighlight
): NotificationVitalAlert[] {
  const base = {
    notificationId,
    patientId: highlight.patientId,
    reason: highlight.reason,
  };

  if (highlight.vitalOverride?.type === 'bp') {
    return [{ ...base, vitalType: 'bp' }];
  }

  if (highlight.vitalOverride?.type === 'heart-rate') {
    return [{ ...base, vitalType: 'heart-rate' }];
  }

  const reasonLower = highlight.reason.toLowerCase();
  if (reasonLower.includes('weight')) {
    return [{ ...base, vitalType: 'weight' }];
  }
  if (reasonLower.includes('glucose') || reasonLower.includes('blood sugar')) {
    return [{ ...base, vitalType: 'glucose' }];
  }
  if (
    reasonLower.includes('blood pressure') ||
    reasonLower.includes('high bp') ||
    reasonLower.includes('systolic')
  ) {
    return [{ ...base, vitalType: 'bp' }];
  }
  if (reasonLower.includes('heart rate')) {
    return [{ ...base, vitalType: 'heart-rate' }];
  }

  return [];
}

/** Rebuild session alerts from all unreviewed vital-linked notifications. */
export async function syncNotificationVitalAlerts(
  notifications: NotificationForAlertSync[],
  patients: { id: string; clinicalCategory: CareCategory }[]
): Promise<void> {
  const alerts: NotificationVitalAlert[] = [];
  const patientPayload = patients.map((patient) => ({
    id: patient.id,
    clinicalCategory: patient.clinicalCategory,
  }));

  for (const note of notifications) {
    if (note.reviewed || !note.action || note.priority === 'low') continue;

    if (note.action === 'weight-gain') {
      const highlights = await findPatientsWithWeightGainWarning(patientPayload);
      highlights.forEach((highlight) => {
        alerts.push({
          notificationId: note.id,
          patientId: highlight.patientId,
          vitalType: 'weight',
          reason: highlight.reason,
        });
      });
      continue;
    }

    if (note.action === 'elevated-bp') {
      const cardiacPatients = patientPayload.filter(
        (patient) => patient.clinicalCategory === 'cardiac'
      );
      const result = await resolveCardiacVitalsTask(cardiacPatients);
      result.highlights.forEach((highlight) => {
        alerts.push(...alertsFromHighlight(note.id, highlight));
      });
      continue;
    }

    if (note.action === 'missed-glucose') {
      const diabeticPatients = patientPayload.filter(
        (patient) => patient.clinicalCategory === 'diabetic'
      );
      const result = await resolveMissedGlucoseNotification(diabeticPatients);
      result.highlights.forEach((highlight) => {
        alerts.push({
          notificationId: note.id,
          patientId: highlight.patientId,
          vitalType: 'glucose',
          reason: highlight.reason,
        });
      });
    }
  }

  saveNotificationVitalAlerts(alerts);
}
