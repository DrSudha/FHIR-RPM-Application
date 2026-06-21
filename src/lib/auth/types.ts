export type UserRole = 'admin' | 'clinician' | 'viewer';

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
  viewer: 'Read-only Viewer',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access including user management and all clinical actions.',
  clinician: 'Can register and manage patients, complete tasks, and edit clinical data.',
  viewer: 'Can browse the portal and view all data; cannot add, edit, or delete anything.',
};
