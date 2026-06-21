import type { UserRole } from '@/lib/auth/types';

export function isViewerRole(role: UserRole): boolean {
  return role === 'viewer';
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}

/** Clinicians and administrators may create, edit, or delete app data. */
export function canMutateData(role: UserRole): boolean {
  return role === 'admin' || role === 'clinician';
}

export function isValidUserRole(role: string): role is UserRole {
  return role === 'admin' || role === 'clinician' || role === 'viewer';
}
