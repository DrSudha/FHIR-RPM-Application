'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ListChecks, Plus } from 'lucide-react';
import {
  assignAssessmentFromTemplate,
  formatAssessmentStatus,
  getAssessmentTemplatesForCohort,
  getAssessmentsForPatient,
  type ClinicalWorkspaceCohort,
  type ClinicalWorkspaceSnapshot,
  type PatientAssessment,
} from '@/lib/patientClinicalWorkspace';
import { formatClinicalDateFromString } from '@/lib/patientClinicalLists';

const DEFAULT_ASSIGNED_BY = 'Dr. Sarah Mitchell';

function statusClassName(status: PatientAssessment['status']): string {
  switch (status) {
    case 'completed':
      return 'assessment-status-completed';
    case 'in-progress':
      return 'assessment-status-progress';
    case 'overdue':
      return 'assessment-status-overdue';
    default:
      return 'assessment-status-assigned';
  }
}

interface PatientAssessmentsSectionProps {
  patientId: string;
  cohort: ClinicalWorkspaceCohort;
  snapshot: ClinicalWorkspaceSnapshot | null;
  readOnly?: boolean;
}

export default function PatientAssessmentsSection({
  patientId,
  cohort,
  snapshot,
  readOnly = false,
}: PatientAssessmentsSectionProps) {
  const templates = getAssessmentTemplatesForCohort(cohort);
  const [assessments, setAssessments] = useState<PatientAssessment[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [reason, setReason] = useState(templates[0]?.defaultReason ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setAssessments(getAssessmentsForPatient(patientId, snapshot, cohort));
  }, [patientId, snapshot, cohort]);

  const sortedAssessments = useMemo(
    () =>
      [...assessments].sort(
        (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
      ),
    [assessments]
  );

  const overdueCount = useMemo(
    () => sortedAssessments.filter((assessment) => assessment.status === 'overdue').length,
    [sortedAssessments]
  );

  const collapsedSummary = useMemo(() => {
    const count = sortedAssessments.length;
    if (count === 0) return 'No assessments assigned — click to expand';
    const base = `${count} assigned`;
    if (overdueCount > 0) {
      return `${base} · ${overdueCount} overdue — click to expand`;
    }
    return `${base} — click to expand`;
  }, [sortedAssessments.length, overdueCount]);

  const selectedTemplate = templates.find((template) => template.id === templateId) ?? templates[0];

  const handleTemplateChange = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
    const template = templates.find((item) => item.id === nextTemplateId);
    if (template) setReason(template.defaultReason);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    if (!selectedTemplate) {
      setFormError('Select an assessment to assign.');
      return;
    }

    const created = assignAssessmentFromTemplate(
      patientId,
      selectedTemplate,
      DEFAULT_ASSIGNED_BY,
      reason
    );

    setAssessments(getAssessmentsForPatient(patientId, snapshot, cohort));
    setFormError(null);
    setShowForm(false);
  };

  return (
    <div className={`glass-card clinical-workspace-card ${isExpanded ? 'is-expanded' : ''}`}>
      <div className="clinical-record-card-header clinical-workspace-collapsible-header">
        <button
          type="button"
          className={`clinical-workspace-toggle ${isExpanded ? 'expanded' : ''}`}
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
        >
          <ChevronRight size={18} className="clinical-workspace-chevron" />
          <ListChecks size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div className="clinical-workspace-header-text">
            <h3 style={{ margin: 0 }}>Assessments</h3>
            <p className="clinical-workspace-subtitle">
              {isExpanded
                ? 'Standard questionnaires for the patient to complete remotely'
                : collapsedSummary}
            </p>
          </div>
        </button>
        {isExpanded && !readOnly && (
          <button
            type="button"
            className="btn btn-secondary clinical-workspace-header-action"
            onClick={() => setShowForm((current) => !current)}
          >
            <Plus size={14} />
            {showForm ? 'Cancel' : 'Assign Assessments'}
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          {showForm && (
            <form className="clinical-workspace-form" onSubmit={handleSubmit}>
              <div className="clinical-workspace-form-grid">
                <label className="form-group clinical-workspace-field clinical-workspace-field-wide">
                  <span className="form-label">Assessment</span>
                  <select
                    className="form-input"
                    value={templateId}
                    onChange={(event) => handleTemplateChange(event.target.value)}
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.title}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedTemplate && (
                  <p className="clinical-workspace-template-hint">{selectedTemplate.description}</p>
                )}
                <label className="form-group clinical-workspace-field clinical-workspace-field-wide">
                  <span className="form-label">Reason for assignment</span>
                  <textarea
                    className="form-input clinical-note-textarea"
                    rows={2}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              </div>
              {formError && <p className="clinical-workspace-form-error">{formError}</p>}
              <div className="clinical-workspace-form-actions">
                <button type="submit" className="btn btn-primary">
                  Assign to patient
                </button>
              </div>
            </form>
          )}

          <div className="clinical-workspace-body">
            {sortedAssessments.length === 0 ? (
              <p className="clinical-workspace-empty">No assessments assigned yet.</p>
            ) : (
              <ul className="clinical-assessments-list">
                {sortedAssessments.map((assessment) => (
                  <li key={assessment.id} className="clinical-assessment-item">
                    <div className="clinical-assessment-item-top">
                      <div>
                        <h4 className="clinical-assessment-title">{assessment.title}</h4>
                        <p className="clinical-assessment-description">{assessment.description}</p>
                      </div>
                      <span className={`assessment-status-badge ${statusClassName(assessment.status)}`}>
                        {formatAssessmentStatus(assessment.status)}
                      </span>
                    </div>
                    <p className="clinical-assessment-reason">
                      <strong>Reason:</strong> {assessment.reason}
                    </p>
                    <div className="clinical-assessment-meta">
                      <span>Assigned by {assessment.assignedBy}</span>
                      {assessment.dueDate && (
                        <span>
                          Due{' '}
                          {formatClinicalDateFromString(`${assessment.dueDate}T12:00:00.000Z`)}
                        </span>
                      )}
                      {assessment.completedAt && (
                        <span>
                          Completed{' '}
                          {formatClinicalDateFromString(assessment.completedAt)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
