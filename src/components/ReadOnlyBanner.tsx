'use client';

import React from 'react';
import { Eye } from 'lucide-react';

type ReadOnlyBannerProps = {
  className?: string;
};

export default function ReadOnlyBanner({ className }: ReadOnlyBannerProps) {
  return (
    <div
      className={`read-only-banner glass-card-subtle ${className ?? ''}`.trim()}
      role="status"
    >
      <Eye size={16} aria-hidden="true" />
      <span>
        Read-only access — you can view patients, tasks, notifications, and insights, but cannot
        add, edit, or delete records.
      </span>
    </div>
  );
}
