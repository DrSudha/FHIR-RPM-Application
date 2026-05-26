import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { hashPassword } from '@/lib/auth/password';
import { resolveDefaultAvatarPath } from '@/lib/auth/userAvatars';
import type { PublicUser, StoredUser, UserRole } from '@/lib/auth/types';

type UserStore = {
  users: StoredUser[];
};

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    avatarPath: user.avatarPath ?? null,
    createdAt: user.createdAt,
  };
}

function withResolvedAvatar(user: StoredUser): StoredUser {
  if (user.avatarPath) return user;
  const defaultAvatar = resolveDefaultAvatarPath(user.email, user.name);
  if (!defaultAvatar) return user;
  return { ...user, avatarPath: defaultAvatar };
}

async function readRawStore(): Promise<UserStore> {
  try {
    const raw = await readFile(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as UserStore;
    if (!Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch {
    return { users: [] };
  }
}

async function readStore(): Promise<UserStore> {
  const store = await readRawStore();
  return {
    users: store.users.map((user) => withResolvedAvatar(user as StoredUser)),
  };
}

async function writeStore(store: UserStore): Promise<void> {
  await mkdir(path.dirname(USERS_FILE), { recursive: true });
  await writeFile(USERS_FILE, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

async function ensureBootstrapAdmin(): Promise<void> {
  const store = await readRawStore();
  if (store.users.length > 0) return;

  const email = (process.env.ADMIN_EMAIL || 'admin@prohealth.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ProHealth2026!';
  const name = process.env.ADMIN_NAME || 'Dr. Sarah Mitchell';
  const now = new Date().toISOString();

  store.users.push({
    id: randomUUID(),
    email,
    passwordHash: await hashPassword(password),
    name,
    role: 'admin',
    active: true,
    avatarPath: resolveDefaultAvatarPath(email, name),
    createdAt: now,
    updatedAt: now,
  });

  await writeStore(store);
}

async function migrateDefaultAvatars(): Promise<void> {
  const store = await readRawStore();
  let changed = false;

  store.users = store.users.map((user) => {
    if (user.avatarPath) return user;
    const avatarPath = resolveDefaultAvatarPath(user.email, user.name);
    if (!avatarPath) return user;
    changed = true;
    return { ...user, avatarPath, updatedAt: new Date().toISOString() };
  });

  if (changed) {
    await writeStore(store);
  }
}

export async function listUsers(): Promise<PublicUser[]> {
  await ensureBootstrapAdmin();
  await migrateDefaultAvatars();
  const store = await readStore();
  return store.users.map(toPublicUser).sort((a, b) => a.name.localeCompare(b.name));
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  await ensureBootstrapAdmin();
  await migrateDefaultAvatars();
  const normalized = email.trim().toLowerCase();
  const store = await readStore();
  return store.users.find((user) => user.email === normalized) ?? null;
}

export async function findUserById(userId: string): Promise<StoredUser | null> {
  await ensureBootstrapAdmin();
  await migrateDefaultAvatars();
  const store = await readStore();
  return store.users.find((user) => user.id === userId) ?? null;
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}): Promise<PublicUser> {
  await ensureBootstrapAdmin();
  const store = await readStore();
  const email = input.email.trim().toLowerCase();

  if (store.users.some((user) => user.email === email)) {
    throw new Error('A user with this email already exists.');
  }

  const now = new Date().toISOString();
  const user: StoredUser = {
    id: randomUUID(),
    email,
    passwordHash: await hashPassword(input.password),
    name: input.name.trim(),
    role: input.role,
    active: true,
    avatarPath: resolveDefaultAvatarPath(email, input.name.trim()),
    createdAt: now,
    updatedAt: now,
  };

  store.users.push(user);
  await writeStore(store);
  return toPublicUser(user);
}

export async function updateUserPassword(userId: string, password: string): Promise<void> {
  const store = await readStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) throw new Error('User not found.');

  user.passwordHash = await hashPassword(password);
  user.updatedAt = new Date().toISOString();
  await writeStore(store);
}

export async function setUserActive(userId: string, active: boolean): Promise<PublicUser> {
  const store = await readStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) throw new Error('User not found.');

  user.active = active;
  user.updatedAt = new Date().toISOString();
  await writeStore(store);
  return toPublicUser(user);
}

export async function updateUserAvatar(userId: string, avatarPath: string | null): Promise<PublicUser> {
  const store = await readRawStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) throw new Error('User not found.');

  user.avatarPath = avatarPath;
  user.updatedAt = new Date().toISOString();
  await writeStore(store);
  return toPublicUser(withResolvedAvatar(user));
}
