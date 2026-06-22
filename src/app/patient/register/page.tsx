'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import RpmLogoIcon from '@/components/RpmLogoIcon';
import HeaderUserChip from '@/components/HeaderUserChip';
import PortalSidebar from '@/components/PortalSidebar';
import PatientForm from '@/components/PatientForm';
import { useSessionUser } from '@/hooks/useSessionUser';
import type { CareCategory } from '@/lib/careCategory';

export default function RegisterPatientPage() {
  const router = useRouter();
  const { canMutate, isAdmin } = useSessionUser();

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
        <PortalSidebar isAdmin={isAdmin} canMutate={canMutate} active="register" />

        <div className="portal-main-content">
          <div className="patient-register-toolbar">
            <Link href="/" className="btn btn-primary">
              <ArrowLeft size={14} />
              Back to patients
            </Link>
          </div>

          {canMutate ? (
            <PatientForm variant="page" onClose={() => router.push('/')} onSuccess={handleSuccess} />
          ) : (
            <div className="glass-card patient-form-page">
              <h2 className="patient-form-page-title">Register New Patient</h2>
              <p className="text-muted" style={{ marginTop: '0.75rem' }}>
                Your account has read-only access. You can view patients and clinical data but cannot
                register new patients. Contact an administrator if you need edit access.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
