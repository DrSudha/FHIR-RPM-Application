const DEFAULT_AVATARS_BY_EMAIL: Record<string, string> = {
  'admin@prohealth.local': '/avatars/sarah-mitchell.jpg',
  'nancy@prohealth.local': '/avatars/nancy-dawson.jpg',
  'jjane@prohealth.local': '/avatars/jane-smith.jpg',
};

const DEFAULT_AVATARS_BY_NAME: Record<string, string> = {
  'dr. sarah mitchell': '/avatars/sarah-mitchell.jpg',
  'sister nancy dawson': '/avatars/nancy-dawson.jpg',
  'nancy dawson': '/avatars/nancy-dawson.jpg',
  'dr jane smith': '/avatars/jane-smith.jpg',
};

export function resolveDefaultAvatarPath(email: string, name: string): string | null {
  const byEmail = DEFAULT_AVATARS_BY_EMAIL[email.trim().toLowerCase()];
  if (byEmail) return byEmail;
  const byName = DEFAULT_AVATARS_BY_NAME[name.trim().toLowerCase()];
  return byName ?? null;
}

export const ALLOWED_AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function avatarPublicPath(userId: string, extension: string): string {
  return `/avatars/users/${userId}${extension}`;
}

export function avatarStorageFileName(userId: string, extension: string): string {
  return `${userId}${extension}`;
}
