'use client';

import { useEffect, useState } from 'react';
import type { UserRole } from '@/lib/auth/types';
import { canMutateData, isAdminRole, isViewerRole } from '@/lib/auth/permissions';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarPath?: string | null;
  loggedInAt: string;
};

export function useSessionUser() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        return data.user as SessionUser | null;
      })
      .then((nextUser) => {
        if (!cancelled) {
          setUser(nextUser);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const role = user?.role;

  return {
    user,
    isLoading,
    canMutate: role ? canMutateData(role) : false,
    isAdmin: role ? isAdminRole(role) : false,
    isViewer: role ? isViewerRole(role) : false,
  };
}
