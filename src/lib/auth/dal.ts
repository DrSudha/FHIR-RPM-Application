import { getSessionFromCookies, getSessionFromRequest } from '@/lib/auth/session';
import { findUserById } from '@/lib/auth/users';
import type { PublicUser, SessionPayload } from '@/lib/auth/types';

export async function verifySession(): Promise<SessionPayload | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const user = await findUserById(session.userId);
  if (!user || !user.active) return null;
  return session;
}

export async function verifySessionFromRequest(
  request: Request | import('next/server').NextRequest
): Promise<SessionPayload | null> {
  const session = await getSessionFromRequest(request as import('next/server').NextRequest);
  if (!session) return null;

  const user = await findUserById(session.userId);
  if (!user || !user.active) return null;
  return session;
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const session = await verifySession();
  if (!session) return null;

  const user = await findUserById(session.userId);
  return user
    ? {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        active: user.active,
        avatarPath: user.avatarPath ?? null,
        createdAt: user.createdAt,
      }
    : null;
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await verifySession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function requireAdminSession(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== 'admin') {
    throw new Error('Forbidden');
  }
  return session;
}
