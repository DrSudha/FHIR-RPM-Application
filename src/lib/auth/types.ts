export type UserRole = 'admin' | 'clinician';

export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  active: boolean;
  avatarPath?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  avatarPath?: string | null;
  createdAt: string;
};

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  loggedInAt: string;
};

export type AuthActionState = {
  error?: string;
  success?: string;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  clinician: 'Care Coordinator',
};
