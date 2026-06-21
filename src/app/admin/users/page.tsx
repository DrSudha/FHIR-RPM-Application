'use client';

import React, { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Shield, UserPlus, X } from 'lucide-react';
import {
  changeOwnPasswordAction,
  createUserAction,
  listUsersAction,
  resetUserPasswordAction,
  toggleUserActiveAction,
  updateUserAction,
  uploadUserAvatarAction,
} from '@/app/actions/auth';
import UserAvatarUploadForm from '@/components/UserAvatarUploadForm';
import { ROLE_LABELS, type AuthActionState, PublicUser, UserRole } from '@/lib/auth/types';

const emptyState: AuthActionState = {};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; email: string; role: UserRole }>({
    name: '',
    email: '',
    role: 'clinician',
  });
  const [createState, createAction, createPending] = useActionState(createUserAction, emptyState);
  const [updateState, updateAction, updatePending] = useActionState(updateUserAction, emptyState);
  const [resetState, resetAction, resetPending] = useActionState(resetUserPasswordAction, emptyState);
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changeOwnPasswordAction,
    emptyState
  );
  const [avatarState, avatarAction, avatarPending] = useActionState(uploadUserAvatarAction, emptyState);
  const [isRefreshing, startRefresh] = useTransition();

  const refreshUsers = () => {
    startRefresh(async () => {
      try {
        const nextUsers = await listUsersAction();
        setUsers(nextUsers);
        setLoadError(null);
      } catch {
        setLoadError('Unable to load users. You may not have administrator access.');
      }
    });
  };

  useEffect(() => {
    refreshUsers();
  }, []);

  useEffect(() => {
    if (
      createState?.success ||
      updateState?.success ||
      resetState?.success ||
      passwordState?.success ||
      avatarState?.success
    ) {
      refreshUsers();
    }
  }, [
    createState?.success,
    updateState?.success,
    resetState?.success,
    passwordState?.success,
    avatarState?.success,
  ]);

  useEffect(() => {
    if (updateState?.success) {
      setEditingUserId(null);
    }
  }, [updateState?.success]);

  const startEditing = (user: PublicUser) => {
    setEditingUserId(user.id);
    setEditDraft({
      name: user.name,
      email: user.email,
      role: user.role,
    });
  };

  const cancelEditing = () => {
    setEditingUserId(null);
  };

  const handleToggleActive = async (userId: string, active: boolean) => {
    const result = await toggleUserActiveAction(userId, active);
    if (result.error) {
      window.alert(result.error);
      return;
    }
    refreshUsers();
  };

  return (
    <div className="app-container auth-admin-page">
      <div className="auth-admin-toolbar">
        <Link href="/" className="btn btn-secondary auth-admin-back">
          <ArrowLeft size={14} />
          Back to portal
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>User management</h1>
          <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            Create accounts, edit user details, manage headshots, reset passwords, and control access
          </p>
        </div>
      </div>

      {loadError && <p className="auth-form-error">{loadError}</p>}

      <div className="auth-admin-grid">
        <section className="glass-card auth-admin-card">
          <div className="auth-admin-card-header">
            <UserPlus size={18} style={{ color: 'var(--primary)' }} />
            <h2>Create user</h2>
          </div>
          <form className="auth-form" action={createAction}>
            <label className="form-group">
              <span className="form-label">Full name</span>
              <input className="form-input" name="name" placeholder="Dr. Jane Smith" required />
            </label>
            <label className="form-group">
              <span className="form-label">Email</span>
              <input
                className="form-input"
                type="email"
                name="email"
                placeholder="jane.smith@prohealth.local"
                required
              />
            </label>
            <label className="form-group">
              <span className="form-label">Temporary password</span>
              <input
                className="form-input"
                type="password"
                name="password"
                placeholder="Minimum 8 characters"
                required
              />
            </label>
            <label className="form-group">
              <span className="form-label">Role</span>
              <select className="form-input" name="role" defaultValue="clinician">
                <option value="clinician">{ROLE_LABELS.clinician}</option>
                <option value="viewer">{ROLE_LABELS.viewer}</option>
                <option value="admin">{ROLE_LABELS.admin}</option>
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
                Administrator: full access · Care Coordinator: clinical edits · Read-only Viewer: view only
              </span>
            </label>
            {createState?.error && <p className="auth-form-error">{createState.error}</p>}
            {createState?.success && <p className="auth-form-success">{createState.success}</p>}
            <button type="submit" className="btn btn-primary" disabled={createPending}>
              {createPending ? 'Creating…' : 'Create user'}
            </button>
          </form>
        </section>

        <section className="glass-card auth-admin-card">
          <div className="auth-admin-card-header">
            <Shield size={18} style={{ color: 'var(--primary)' }} />
            <h2>Change your password</h2>
          </div>
          <form className="auth-form" action={passwordAction}>
            <label className="form-group">
              <span className="form-label">Current password</span>
              <input className="form-input" type="password" name="currentPassword" required />
            </label>
            <label className="form-group">
              <span className="form-label">New password</span>
              <input className="form-input" type="password" name="newPassword" required />
            </label>
            {passwordState?.error && <p className="auth-form-error">{passwordState.error}</p>}
            {passwordState?.success && <p className="auth-form-success">{passwordState.success}</p>}
            <button type="submit" className="btn btn-primary" disabled={passwordPending}>
              {passwordPending ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>
      </div>

      <section className="glass-card auth-admin-card auth-admin-users-card">
        <div className="auth-admin-card-header">
          <h2>Portal users</h2>
          {isRefreshing && <span className="text-muted" style={{ fontSize: '0.8125rem' }}>Refreshing…</span>}
        </div>

        <div className="table-container">
          <table className="premium-table auth-users-table">
            <thead>
              <tr>
                <th>Headshot</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isEditing = editingUserId === user.id;

                return (
                <tr key={user.id} className={isEditing ? 'auth-user-row-editing' : undefined}>
                  <td>
                    <UserAvatarUploadForm user={user} uploadAction={avatarAction} />
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="form-input auth-user-edit-input"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((current) => ({ ...current, name: e.target.value }))}
                        required
                      />
                    ) : (
                      user.name
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="form-input auth-user-edit-input"
                        type="email"
                        value={editDraft.email}
                        onChange={(e) => setEditDraft((current) => ({ ...current, email: e.target.value }))}
                        required
                      />
                    ) : (
                      user.email
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select
                        className="form-input auth-user-edit-input"
                        value={editDraft.role}
                        onChange={(e) =>
                          setEditDraft((current) => ({
                            ...current,
                            role: e.target.value as UserRole,
                          }))
                        }
                      >
                        <option value="clinician">Care Coordinator</option>
                        <option value="viewer">Read-only Viewer</option>
                        <option value="admin">Administrator</option>
                      </select>
                    ) : (
                      ROLE_LABELS[user.role as UserRole]
                    )}
                  </td>
                  <td>
                    <span className={`auth-user-status ${user.active ? 'active' : 'inactive'}`}>
                      {user.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <div className="auth-user-actions">
                      {isEditing ? (
                        <form action={updateAction} className="auth-user-edit-form">
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="name" value={editDraft.name} />
                          <input type="hidden" name="email" value={editDraft.email} />
                          <input type="hidden" name="role" value={editDraft.role} />
                          <button type="submit" className="btn btn-primary auth-edit-btn" disabled={updatePending}>
                            {updatePending ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary auth-edit-btn"
                            onClick={cancelEditing}
                            disabled={updatePending}
                          >
                            <X size={14} />
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary auth-edit-btn"
                          onClick={() => startEditing(user)}
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                      )}
                      {!isEditing && (
                        <>
                      <form action={resetAction} className="auth-reset-form">
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          className="form-input auth-reset-input"
                          type="password"
                          name="password"
                          placeholder="New password"
                          required
                        />
                        <button
                          type="submit"
                          className="btn btn-secondary auth-reset-btn"
                          disabled={resetPending}
                        >
                          Reset
                        </button>
                      </form>
                      <button
                        type="button"
                        className="btn btn-secondary auth-toggle-btn"
                        onClick={() => handleToggleActive(user.id, !user.active)}
                      >
                        {user.active ? 'Deactivate' : 'Activate'}
                      </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })}
              {users.length === 0 && !isRefreshing && (
                <tr>
                  <td colSpan={7} className="text-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {resetState?.error && <p className="auth-form-error">{resetState.error}</p>}
        {resetState?.success && <p className="auth-form-success">{resetState.success}</p>}
        {updateState?.error && <p className="auth-form-error">{updateState.error}</p>}
        {updateState?.success && <p className="auth-form-success">{updateState.success}</p>}
        {avatarState?.error && <p className="auth-form-error">{avatarState.error}</p>}
        {avatarState?.success && <p className="auth-form-success">{avatarState.success}</p>}
        {avatarPending && (
          <p className="text-muted" style={{ fontSize: '0.8125rem', padding: '0 1.25rem 1rem' }}>
            Uploading headshot…
          </p>
        )}
      </section>
    </div>
  );
}
