'use client';

import React from 'react';
import UserAvatar from '@/components/UserAvatar';
import type { PublicUser } from '@/lib/auth/types';

type UserAvatarUploadFormProps = {
  user: PublicUser;
  uploadAction: (formData: FormData) => void;
};

export default function UserAvatarUploadForm({ user, uploadAction }: UserAvatarUploadFormProps) {
  return (
    <form
      className="auth-avatar-form"
      action={uploadAction}
      encType="multipart/form-data"
    >
      <input type="hidden" name="userId" value={user.id} />
      <UserAvatar name={user.name} avatarPath={user.avatarPath} size={40} />
      <label className="auth-avatar-file-label">
        <span className="auth-avatar-file-label-text">Choose photo</span>
        <input
          className="auth-avatar-file-input"
          type="file"
          name="avatar"
          accept="image/jpeg,image/png,image/webp"
        />
      </label>
      <button type="submit" className="btn btn-secondary auth-avatar-upload-btn">
        Update
      </button>
    </form>
  );
}
