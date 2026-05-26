'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type UserAvatarProps = {
  name: string;
  avatarPath?: string | null;
  size?: number;
  className?: string;
};

export default function UserAvatar({
  name,
  avatarPath,
  size = 48,
  className = '',
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(() => initialsFromName(name), [name]);
  const showImage = Boolean(avatarPath) && !imageFailed;

  return (
    <div
      className={`user-avatar ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden={!name}
    >
      {showImage ? (
        <Image
          src={avatarPath as string}
          alt={`${name} profile`}
          width={size}
          height={size}
          className="user-avatar-image"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="user-avatar-initials">{initials}</span>
      )}
    </div>
  );
}
