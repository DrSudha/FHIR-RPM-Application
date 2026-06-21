'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Settings2, UserPlus } from 'lucide-react';

export type PortalSidebarActive = 'register' | 'insights' | 'users' | 'home';

type PortalSidebarProps = {
  isAdmin: boolean;
  canMutate?: boolean;
  active?: PortalSidebarActive;
};

export default function PortalSidebar({
  isAdmin,
  canMutate = true,
  active = 'home',
}: PortalSidebarProps) {
  const router = useRouter();

  return (
    <aside className="portal-sidebar glass-card-subtle">
      <p className="portal-sidebar-label">Menu</p>
      <nav className="portal-sidebar-nav" aria-label="Portal menu">
        <button
          type="button"
          className={`btn btn-primary portal-sidebar-btn ${active === 'register' ? 'portal-sidebar-btn-active' : ''}`}
          onClick={() => {
            if (canMutate) router.push('/patient/register');
          }}
          disabled={!canMutate}
          title={canMutate ? 'Register a new patient' : 'Read-only access — registration disabled'}
          aria-disabled={!canMutate}
        >
          <UserPlus size={16} />
          Register Patient
        </button>
        <button
          type="button"
          className={`btn btn-primary portal-sidebar-btn ${active === 'users' ? 'portal-sidebar-btn-active' : ''}`}
          onClick={() => {
            if (isAdmin) router.push('/admin/users');
          }}
          disabled={!isAdmin}
          title={isAdmin ? 'User management' : 'Administrator access required'}
          aria-disabled={!isAdmin}
        >
          <Settings2 size={16} />
          User Management
        </button>
        <button
          type="button"
          className={`btn btn-primary portal-sidebar-btn ${active === 'insights' ? 'portal-sidebar-btn-active' : ''}`}
          onClick={() => router.push('/insights')}
        >
          <BarChart3 size={16} />
          Insights
        </button>
      </nav>
    </aside>
  );
}
