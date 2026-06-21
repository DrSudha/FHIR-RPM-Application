'use server';

import { redirect } from 'next/navigation';
import { requireAdminSession, requireSession, requireWriteSession } from '@/lib/auth/dal';
import { validatePassword, verifyPassword } from '@/lib/auth/password';
import {
  buildSessionPayload,
  clearSessionCookie,
  setSessionCookie,
} from '@/lib/auth/session';
import type { AuthActionState, UserRole } from '@/lib/auth/types';
import { isValidUserRole } from '@/lib/auth/permissions';
import {
  createUser,
  findUserByEmail,
  listUsers,
  setUserActive,
  updateUserAvatar,
  updateUserDetails,
  updateUserPassword,
} from '@/lib/auth/users';
import {
  extensionFromFileName,
  extensionFromMimeType,
  saveUserAvatarFile,
} from '@/lib/auth/avatarStorage';
import { MAX_AVATAR_BYTES } from '@/lib/auth/userAvatars';

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const user = await findUserByEmail(email);
  if (!user || !user.active) {
    return { error: 'Invalid email or password.' };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: 'Invalid email or password.' };
  }

  await setSessionCookie(
    buildSessionPayload({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })
  );

  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}

export async function listUsersAction() {
  await requireAdminSession();
  return listUsers();
}

export async function createUserAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  await requireAdminSession();

  const email = String(formData.get('email') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const password = String(formData.get('password') || '');
  const role = String(formData.get('role') || 'clinician') as UserRole;

  if (!email || !name || !password) {
    return { error: 'Name, email, and password are required.' };
  }

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  if (!isValidUserRole(role)) {
    return { error: 'Invalid role selected.' };
  }

  try {
    await createUser({ email, name, password, role });
    return { success: `User ${name} created successfully.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to create user.' };
  }
}

export async function resetUserPasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  await requireAdminSession();

  const userId = String(formData.get('userId') || '');
  const password = String(formData.get('password') || '');

  if (!userId || !password) {
    return { error: 'User and new password are required.' };
  }

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  try {
    await updateUserPassword(userId, password);
    return { success: 'Password updated successfully.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update password.' };
  }
}

export async function updateUserAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const session = await requireAdminSession();

  const userId = String(formData.get('userId') || '');
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const role = String(formData.get('role') || 'clinician') as UserRole;

  if (!userId || !name || !email) {
    return { error: 'Name and email are required.' };
  }

  if (!isValidUserRole(role)) {
    return { error: 'Invalid role selected.' };
  }

  try {
    const updated = await updateUserDetails(userId, { name, email, role });

    if (session.userId === userId) {
      await setSessionCookie(
        buildSessionPayload({
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
        })
      );
    }

    return { success: `Updated ${updated.name}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update user.' };
  }
}

export async function toggleUserActiveAction(userId: string, active: boolean): Promise<AuthActionState> {
  const session = await requireAdminSession();
  if (session.userId === userId && !active) {
    return { error: 'You cannot deactivate your own account.' };
  }

  try {
    await setUserActive(userId, active);
    return { success: active ? 'User reactivated.' : 'User deactivated.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update user status.' };
  }
}

export async function changeOwnPasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const session = await requireSession();
  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');

  if (!currentPassword || !newPassword) {
    return { error: 'Current and new passwords are required.' };
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) return { error: passwordError };

  const user = await findUserByEmail(session.email);
  if (!user) return { error: 'User not found.' };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { error: 'Current password is incorrect.' };

  await updateUserPassword(user.id, newPassword);
  return { success: 'Your password has been updated.' };
}

export async function uploadUserAvatarAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  await requireAdminSession();

  const userId = String(formData.get('userId') || '');
  const file = formData.get('avatar');

  if (!userId) {
    return { error: 'User is required.' };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a headshot image to upload.' };
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return { error: 'Headshot must be 2 MB or smaller.' };
  }

  const extension =
    extensionFromFileName(file.name) ?? extensionFromMimeType(file.type) ?? null;
  if (!extension) {
    return { error: 'Use a JPG, PNG, or WebP image.' };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const avatarPath = await saveUserAvatarFile(userId, bytes, extension);
    await updateUserAvatar(userId, avatarPath);
    return { success: 'Headshot updated successfully.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to upload headshot.' };
  }
}
