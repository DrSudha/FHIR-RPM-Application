'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ClipboardPen, Plus } from 'lucide-react';
import {
  addClinicalNote,
  formatClinicalNoteTimestamp,
  formatNoteCategory,
  getClinicalNotesForPatient,
  type ClinicalNote,
  type ClinicalNoteCategory,
  type ClinicalWorkspaceSnapshot,
} from '@/lib/patientClinicalWorkspace';

const NOTE_CATEGORIES: ClinicalNoteCategory[] = [
  'monitoring',
  'care-plan',
  'follow-up',
  'general',
];

const DEFAULT_AUTHOR = 'Dr. Sarah Mitchell';
const DEFAULT_ROLE = 'Care Coordinator';

interface PatientClinicalNotesSectionProps {
  patientId: string;
  snapshot: ClinicalWorkspaceSnapshot | null;
}

export default function PatientClinicalNotesSection({
  patientId,
  snapshot,
}: PatientClinicalNotesSectionProps) {
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<ClinicalNoteCategory>('monitoring');
  const [text, setText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setNotes(getClinicalNotesForPatient(patientId, snapshot));
  }, [patientId, snapshot]);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()),
    [notes]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      setFormError('Please enter at least a brief clinical note (10 characters minimum).');
      return;
    }

    addClinicalNote(patientId, {
      author: DEFAULT_AUTHOR,
      role: DEFAULT_ROLE,
      category,
      text: trimmed,
    });

    setNotes(getClinicalNotesForPatient(patientId, snapshot));
    setText('');
    setCategory('monitoring');
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
          <ClipboardPen size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div className="clinical-workspace-header-text">
            <h3 style={{ margin: 0 }}>Clinical notes</h3>
            <p className="clinical-workspace-subtitle">
              {isExpanded
                ? 'Short notes recorded by the care team'
                : `${sortedNotes.length} note${sortedNotes.length === 1 ? '' : 's'} — click to expand`}
            </p>
          </div>
        </button>
        {isExpanded && (
          <button
            type="button"
            className="btn btn-secondary clinical-workspace-header-action"
            onClick={() => setShowForm((current) => !current)}
          >
            <Plus size={14} />
            {showForm ? 'Cancel' : 'Record note'}
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          {showForm && (
            <form className="clinical-workspace-form" onSubmit={handleSubmit}>
              <div className="clinical-workspace-form-grid">
                <label className="form-group clinical-workspace-field">
                  <span className="form-label">Category</span>
                  <select
                    className="form-input"
                    value={category}
                    onChange={(event) => setCategory(event.target.value as ClinicalNoteCategory)}
                  >
                    {NOTE_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {formatNoteCategory(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-group clinical-workspace-field clinical-workspace-field-wide">
                  <span className="form-label">Clinical note</span>
                  <textarea
                    className="form-input clinical-note-textarea"
                    rows={4}
                    placeholder="Document observations, patient-reported symptoms, care plan updates, or follow-up actions…"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                </label>
              </div>
              {formError && <p className="clinical-workspace-form-error">{formError}</p>}
              <div className="clinical-workspace-form-actions">
                <button type="submit" className="btn btn-primary">
                  Save note
                </button>
              </div>
            </form>
          )}

          <div className="clinical-workspace-body">
            {sortedNotes.length === 0 ? (
              <p className="clinical-workspace-empty">No clinical notes recorded yet.</p>
            ) : (
              <ul className="clinical-notes-list">
                {sortedNotes.map((note) => (
                  <li key={note.id} className="clinical-note-item">
                    <div className="clinical-note-item-header">
                      <div>
                        <span className="clinical-note-author">{note.author}</span>
                        <span className="clinical-note-role"> · {note.role}</span>
                      </div>
                      <span className="clinical-note-category">{formatNoteCategory(note.category)}</span>
                    </div>
                    <p className="clinical-note-text">{note.text}</p>
                    <time className="clinical-note-time" dateTime={note.recordedAt}>
                      {formatClinicalNoteTimestamp(note.recordedAt)}
                    </time>
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
