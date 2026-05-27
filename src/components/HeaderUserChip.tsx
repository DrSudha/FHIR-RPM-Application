'use client';

import React, { useEffect, useState } from 'react';
import { Power } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import UserAvatar from '@/components/UserAvatar';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/types';

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarPath?: string | null;
  loggedInAt: string;
};

function formatLoggedInAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HeaderUserChip() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        return data.user as SessionUser | null;
      })
      .then((nextUser) => {
        if (!cancelled) setUser(nextUser);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) {
    return (
      <div className="header-user-chip glass-card-subtle">
        <div className="header-user-details">
          <span className="header-user-name">Loading session…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="header-user-chip glass-card-subtle">
      <UserAvatar
        name={user.name}
        avatarPath={user.avatarPath}
        size={48}
        className="header-user-avatar-slot"
      />
      <div className="header-user-details">
        <span className="header-user-name">{user.name}</span>
        <span className="header-user-role">{ROLE_LABELS[user.role]}</span>
        <div className="header-user-session">
          <span className="header-user-session-badge">Active session</span>
          <div className="header-user-session-footer">
            <span className="header-user-login">Logged in at: {formatLoggedInAt(user.loggedInAt)}</span>
            <div className="header-user-actions-row">
              <button
                type="button"
                className="header-user-logout"
                onClick={() => {
                  if (!window.confirm('Log out of Pro Health?')) return;
                  logoutAction();
                }}
                title="Log out"
                aria-label="Log out"
              >
                <Power size={14} strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
