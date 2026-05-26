'use client';

import React from 'react';

interface VitalNotificationBadgeProps {
  title?: string;
}

export default function VitalNotificationBadge({ title }: VitalNotificationBadgeProps) {
  return (
    <span
      className="vital-notification-alert"
      title={title ?? 'Linked notification requires review'}
      aria-label={title ?? 'Notification alert'}
    >
      <span className="vital-notification-alert-mark" aria-hidden="true">
        !
      </span>
    </span>
  );
}
