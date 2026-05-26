'use client';

import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchClinicalPreview,
  type ClinicalPreviewData,
} from '@/lib/patientClinicalPreview';

interface PatientNameHoverPreviewProps {
  patient: any;
  fullName: string;
}

interface PopupPosition {
  top: number;
  left: number;
}

const POPUP_ESTIMATED_HEIGHT = 100;

function computePopupPosition(trigger: HTMLElement): PopupPosition {
  const rect = trigger.getBoundingClientRect();
  const belowTop = rect.bottom + 6;
  const fitsBelow = belowTop + POPUP_ESTIMATED_HEIGHT <= window.innerHeight - 8;

  return {
    top: fitsBelow ? belowTop : Math.max(8, rect.top - POPUP_ESTIMATED_HEIGHT - 6),
    left: Math.min(rect.left, window.innerWidth - 280),
  };
}

function formatMedications(preview: ClinicalPreviewData): string {
  if (preview.activeMedications.length === 0) {
    return 'None';
  }

  const listed = preview.activeMedications.join(', ');
  if (preview.additionalMedicationCount && preview.additionalMedicationCount > 0) {
    return `${listed} (+${preview.additionalMedicationCount} more)`;
  }

  return listed;
}

export default function PatientNameHoverPreview({
  patient,
  fullName,
}: PatientNameHoverPreviewProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<PopupPosition>({ top: 0, left: 0 });
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ClinicalPreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchStarted = useRef(false);

  const loadPreview = useCallback(async () => {
    if (!patient?.id || fetchStarted.current) return;
    fetchStarted.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClinicalPreview(patient.id);
      setPreview(data);
    } catch {
      setError('Unable to load clinical summary.');
    } finally {
      setLoading(false);
    }
  }, [patient?.id]);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      setPosition(computePopupPosition(triggerRef.current));
    }
    setVisible(true);
    if (!preview && !loading) {
      void loadPreview();
    }
  };

  const handleMouseLeave = () => {
    setVisible(false);
  };

  const popup =
    visible &&
    createPortal(
      <div
        className="patient-name-preview-popup patient-name-preview-popup-portal"
        style={{ top: position.top, left: position.left }}
        role="tooltip"
      >
        <div className="patient-name-preview-popup-header">Clinical snapshot</div>

        {loading && !preview && (
          <div className="patient-name-preview-loading">Loading…</div>
        )}

        {error && !preview && (
          <div className="patient-name-preview-error">{error}</div>
        )}

        {preview && (
          <dl className="patient-name-preview-body">
            <div className="patient-name-preview-row">
              <dt>Clinical history</dt>
              <dd>{preview.clinicalHistory}</dd>
            </div>
            <div className="patient-name-preview-row">
              <dt>Medications</dt>
              <dd>{formatMedications(preview)}</dd>
            </div>
          </dl>
        )}
      </div>,
      document.body
    );

  return (
    <>
      <span
        ref={triggerRef}
        className="patient-name-preview"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="patient-name-preview-trigger">{fullName}</span>
      </span>
      {popup}
    </>
  );
}
