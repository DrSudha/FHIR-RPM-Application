import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { SessionPayload, UserRole } from '@/lib/auth/types';

export const SESSION_COOKIE = 'prohealth_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error('SESSION_SECRET must be set to at least 16 characters.');
  }
  return new TextEncoder().encode(secret.trim());
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      algorithms: ['HS256'],
    });
    const userId = payload.userId;
    const email = payload.email;
    const name = payload.name;
    const role = payload.role;
    const loggedInAt = payload.loggedInAt;
    if (
      typeof userId !== 'string' ||
      typeof email !== 'string' ||
      typeof name !== 'string' ||
      (role !== 'admin' && role !== 'clinician') ||
      typeof loggedInAt !== 'string'
    ) {
      return null;
    }
    return { userId, email, name, role, loggedInAt };
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const cookieStore = await cookies();
  const token = await createSessionToken(payload);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export function buildSessionPayload(user: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}): SessionPayload {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    loggedInAt: new Date().toISOString(),
  };
}
