import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import {
  ALLOWED_AVATAR_EXTENSIONS,
  avatarPublicPath,
  avatarStorageFileName,
} from '@/lib/auth/userAvatars';

const AVATARS_DIR = path.join(process.cwd(), 'public', 'avatars', 'users');

export function extensionFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  const match = ALLOWED_AVATAR_EXTENSIONS.find((ext) => lower.endsWith(ext));
  return match ?? null;
}

export function extensionFromMimeType(mimeType: string): string | null {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return null;
  }
}

async function removeExistingUserAvatarFiles(userId: string): Promise<void> {
  await Promise.all(
    ALLOWED_AVATAR_EXTENSIONS.map(async (extension) => {
      try {
        await unlink(path.join(AVATARS_DIR, avatarStorageFileName(userId, extension)));
      } catch {
        // ignore missing files
      }
    })
  );
}

export async function saveUserAvatarFile(
  userId: string,
  bytes: Buffer,
  extension: string
): Promise<string> {
  if (!ALLOWED_AVATAR_EXTENSIONS.includes(extension as (typeof ALLOWED_AVATAR_EXTENSIONS)[number])) {
    throw new Error('Unsupported avatar file type.');
  }

  await mkdir(AVATARS_DIR, { recursive: true });
  await removeExistingUserAvatarFiles(userId);

  const fileName = avatarStorageFileName(userId, extension);
  await writeFile(path.join(AVATARS_DIR, fileName), bytes);
  return avatarPublicPath(userId, extension);
}

export async function removeUserAvatarFile(userId: string): Promise<void> {
  await removeExistingUserAvatarFiles(userId);
}
