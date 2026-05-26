import React from 'react';
import {
  getVitalReadingSeverity,
  vitalAlertTitle,
  type VitalAlertType,
} from '@/lib/vitalRangeAlerts';

interface VitalReadingCellProps {
  type: VitalAlertType;
  display: React.ReactNode;
  raw?: string;
}

export default function VitalReadingCell({ type, display, raw }: VitalReadingCellProps) {
  if (display == null || display === '—') {
    return <>—</>;
  }

  const severity = getVitalReadingSeverity(type, raw);

  return (
    <span className="vital-reading-cell">
      {display}
      {severity !== 'none' && (
        <span
          className={`vital-alert-mark ${
            severity === 'critical' ? 'vital-alert-mark-critical' : 'vital-alert-mark-warning'
          }`}
          title={vitalAlertTitle(type, severity)}
          aria-label={vitalAlertTitle(type, severity)}
        >
          {severity === 'critical' ? '!!' : '!'}
        </span>
      )}
    </span>
  );
}
