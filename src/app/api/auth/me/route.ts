import { NextResponse } from 'next/server';
import { getCurrentUser, verifySessionFromRequest } from '@/lib/auth/dal';

export async function GET(request: Request) {
  const session = await verifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarPath: user.avatarPath ?? null,
      loggedInAt: session.loggedInAt,
    },
  });
}
