'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Pill, RefreshCw, X } from 'lucide-react';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/types';
import { addClinicalNote } from '@/lib/patientClinicalWorkspace';
import {
  buildMedicationRefillNoteText,
  getMedicationAuthoredDays,
  isMedicationDueForRefill,
  isRefillInitiated,
  recordRefillInitiation,
  REFILL_DUE_DAYS,
} from '@/lib/medicationRefillWorkflow';
import {
  formatMedicationDate,
  getMedicationDosage,
  getMedicationFrequency,
  getMedicationName,
  getMedicationRoute,
  getMedicationStartDate,
  sortMedicationsForDisplay,
} from '@/lib/patientClinicalLists';

export type MedicationRefillPatient = {
  id: string;
  name: string;
  reason: string;
  dueMedicationIds: string[];
};

type SessionUser = {
  id: string;
  name: string;
  role: UserRole;
};

interface MedicationRefillModalProps {
  patients: MedicationRefillPatient[];
  initialPatientIndex?: number;
  onClose: () => void;
  onRefillInitiated: () => void;
  readOnly?: boolean;
}

export default function MedicationRefillModal({
  patients,
  initialPatientIndex = 0,
  onClose,
  onRefillInitiated,
  readOnly = false,
}: MedicationRefillModalProps) {
  const [activeIndex, setActiveIndex] = useState(initialPatientIndex);
  const [medications, setMedications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [initiatingId, setInitiatingId] = useState<string | null>(null);
  const [initiatedIds, setInitiatedIds] = useState<Set<string>>(new Set());

  const activePatient = patients[activeIndex] ?? patients[0];

  const refreshInitiatedState = useCallback(() => {
    if (!activePatient?.id) return;
    const ids = new Set<string>();
    medications.forEach((medication) => {
      if (medication.id && isRefillInitiated(activePatient.id, medication.id)) {
        ids.add(medication.id);
      }
    });
    setInitiatedIds(ids);
  }, [activePatient?.id, medications]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && data.user) {
          setCurrentUser(data.user);
        }
      } catch {
        // Notes will fall back to a generic author if session is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activePatient?.id) return undefined;

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/fhir/MedicationRequest?patient=${activePatient.id}&status=active&_sort=-date&_count=50`
        );
        if (!response.ok) {
          throw new Error(`Failed to load medications (${response.status})`);
        }

        const bundle = await response.json();
        const activeMeds = (bundle.entry || [])
          .map((entry: { resource?: any }) => entry.resource)
          .filter(Boolean);

        if (cancelled) return;
        setMedications(sortMedicationsForDisplay(activeMeds));
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load medications');
          setMedications([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePatient?.id]);

  useEffect(() => {
    refreshInitiatedState();
  }, [refreshInitiatedState]);

  const activeMedications = useMemo(
    () =>
      medications.filter((medication) => (medication.status || '').toLowerCase() === 'active'),
    [medications]
  );

  const handleInitiateRefill = async (medication: any) => {
    if (readOnly || !activePatient?.id || !medication.id || initiatingId) return;

    setInitiatingId(medication.id);

    try {
      const authorName = currentUser?.name ?? 'Care Coordinator';
      const authorRole = currentUser?.role ? ROLE_LABELS[currentUser.role] : 'Care Coordinator';

      addClinicalNote(activePatient.id, {
        author: authorName,
        role: authorRole,
        category: 'follow-up',
        text: buildMedicationRefillNoteText(medication),
      });

      recordRefillInitiation(
        activePatient.id,
        medication.id,
        currentUser?.id ?? 'unknown-user'
      );

      setInitiatedIds((current) => new Set([...current, medication.id]));
      onRefillInitiated();
    } catch (err) {
      console.error('Failed to initiate refill:', err);
    } finally {
      setInitiatingId(null);
    }
  };

  if (!activePatient) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-card medication-refill-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="medication-refill-modal-header">
          <div>
            <h2 className="medication-refill-modal-title">
              <Pill size={22} />
              Medication refills — {activePatient.name}
            </h2>
            <p className="medication-refill-modal-subtitle">{activePatient.reason}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={onClose}
            aria-label="Close medication refills"
          >
            <X size={18} />
          </button>
        </div>

        {patients.length > 1 && (
          <div className="medication-refill-patient-tabs">
            {patients.map((patient, index) => (
              <button
                key={patient.id}
                type="button"
                className={`medication-refill-patient-tab ${index === activeIndex ? 'active' : ''}`}
                onClick={() => setActiveIndex(index)}
              >
                {patient.name}
              </button>
            ))}
          </div>
        )}

        <p className="medication-refill-guidance">
          Active medications due for refill ({REFILL_DUE_DAYS}+ days since last prescription) are
          highlighted. Initiate the refill process to record a clinical note under your name.
        </p>

        {isLoading ? (
          <div className="medication-refill-loading">
            <RefreshCw size={20} className="spin" />
            Loading medications…
          </div>
        ) : error ? (
          <div className="medication-refill-error">{error}</div>
        ) : activeMedications.length === 0 ? (
          <div className="medication-refill-empty">No active medications found for this patient.</div>
        ) : (
          <div className="table-container medication-refill-table-container">
            <table className="premium-table medications-table">
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Route</th>
                  <th>Start Date</th>
                  <th>Days Active</th>
                  <th style={{ textAlign: 'right' }}>Refill</th>
                </tr>
              </thead>
              <tbody>
                {activeMedications.map((medication) => {
                  const due = isMedicationDueForRefill(medication);
                  const initiated =
                    initiatedIds.has(medication.id) ||
                    isRefillInitiated(activePatient.id, medication.id);
                  const daysActive = Math.floor(getMedicationAuthoredDays(medication));
                  const isProcessing = initiatingId === medication.id;

                  return (
                    <tr
                      key={medication.id}
                      className={due ? 'med-refill-due-row' : undefined}
                    >
                      <td style={{ fontWeight: 500 }}>{getMedicationName(medication)}</td>
                      <td>{getMedicationDosage(medication)}</td>
                      <td>{getMedicationFrequency(medication)}</td>
                      <td>{getMedicationRoute(medication)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {formatMedicationDate(getMedicationStartDate(medication))}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{daysActive}d</td>
                      <td style={{ textAlign: 'right' }}>
                        {due ? (
                          initiated ? (
                            <span className="med-refill-initiated-badge">
                              <CheckCircle2 size={14} />
                              Refill initiated
                            </span>
                          ) : readOnly ? (
                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                              View only
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary med-refill-initiate-btn"
                              disabled={isProcessing}
                              onClick={() => void handleInitiateRefill(medication)}
                            >
                              {isProcessing ? (
                                <>
                                  <RefreshCw size={14} className="spin" />
                                  Processing…
                                </>
                              ) : (
                                'Initiate refill process'
                              )}
                            </button>
                          )
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                            Not due
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="medication-refill-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
