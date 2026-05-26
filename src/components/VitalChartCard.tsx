'use client';

import React from 'react';
import VitalNotificationBadge from '@/components/VitalNotificationBadge';

interface VitalChartCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  showAlert?: boolean;
  alertTitle?: string;
}

export default function VitalChartCard({
  children,
  className = '',
  style,
  showAlert = false,
  alertTitle,
}: VitalChartCardProps) {
  return (
    <div
      className={`vital-chart-card-wrap ${className}`.trim()}
      style={style}
    >
      {showAlert && <VitalNotificationBadge title={alertTitle} />}
      {children}
    </div>
  );
}
