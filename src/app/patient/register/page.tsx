'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import RpmLogoIcon from '@/components/RpmLogoIcon';
import HeaderUserChip from '@/components/HeaderUserChip';
import PortalSidebar from '@/components/PortalSidebar';
import PatientForm from '@/components/PatientForm';
import type { CareCategory } from '@/lib/careCategory';

export default function RegisterPatientPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        return data.user as { role?: string } | null;
      })
      .then((user) => {
        if (!cancelled) setIsAdmin(user?.role === 'admin');
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSuccess = ({ patientId }: { patientId: string; careCategory: CareCategory }) => {
    router.push(`/patient/${patientId}`);
  };

  return (
    <div className="app-container app-home">
      <header className="app-header-bar">
        <div className="app-header-brand">
          <div className="app-logo-mark">
            <RpmLogoIcon size={22} className="app-logo-icon" />
          </div>
          <h1 className="app-header-title">Pro Health - Remote Patient Monitoring</h1>
          <p className="app-header-tagline">
            <span className="app-header-tagline-lead">Register new patient</span>
          </p>
        </div>
        <HeaderUserChip />
      </header>

      <div className="portal-main-layout">
        <PortalSidebar isAdmin={isAdmin} active="register" />

        <div className="portal-main-content">
          <div className="patient-register-toolbar">
            <Link href="/" className="btn btn-secondary">
              <ArrowLeft size={14} />
              Back to patients
            </Link>
          </div>

          <PatientForm variant="page" onClose={() => router.push('/')} onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
}
