'use client';

import React, { useState, useEffect } from 'react';
import { X, UserPlus, Save, AlertCircle } from 'lucide-react';

import {
  type CareCategory,
  type GeneralCareSubCategory,
  CARE_CATEGORY_OPTIONS,
  GENERAL_CARE_SUBCATEGORY_OPTIONS,
  classifyCareCategoryFromResources,
  extractGeneralCareSubCategoryFromResources,
  buildCareCategoryCondition,
  buildGeneralCareSubCategoryCondition,
} from '@/lib/careCategory';
import {
  buildPatientTelecomWithPhone,
  getPatientPhone,
  isValidPatientPhone,
} from '@/lib/patientContact';
import {
  applyAllergiesToPatient,
  getPatientAllergies,
  MAX_PATIENT_ALLERGIES_LENGTH,
  normalizeAllergiesInput,
} from '@/lib/patientAllergies';
import BirthDatePicker from '@/components/BirthDatePicker';

const selectChevronStyle = {
  appearance: 'none' as const,
  background: `var(--bg-input) url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e") no-repeat right 0.75rem center/1.25rem`,
};

interface PatientFormProps {
  isOpen: boolean;
  onClose: () => void;
  patientToEdit?: any; // The original FHIR Patient resource if editing
  onSuccess: (result: { patientId: string; careCategory: CareCategory }) => void;
}

export default function PatientForm({
  isOpen,
  onClose,
  patientToEdit,
  onSuccess,
}: PatientFormProps) {
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [allergies, setAllergies] = useState('');
  const [height, setHeight] = useState('');
  const [careCategory, setCareCategory] = useState<CareCategory | ''>('');
  const [initialCareCategory, setInitialCareCategory] = useState<CareCategory | ''>('');
  const [generalCareSubCategory, setGeneralCareSubCategory] = useState<GeneralCareSubCategory | ''>('');
  const [initialGeneralCareSubCategory, setInitialGeneralCareSubCategory] = useState<
    GeneralCareSubCategory | ''
  >('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (patientToEdit) {
      // Pre-fill form fields from existing Patient resource
      const given = patientToEdit.name?.[0]?.given?.join(' ') || '';
      const family = patientToEdit.name?.[0]?.family || '';
      const g = patientToEdit.gender || '';
      const bDate = patientToEdit.birthDate || '';
      
      setGivenName(given);
      setFamilyName(family);
      setGender(g);
      setPhone(getPatientPhone(patientToEdit));
      setAllergies(getPatientAllergies(patientToEdit));
      setHeight(''); // Clear initially, will fetch below
      
      // If server returned YYYY-MM-DD, convert to DD-MM-YYYY for the form
      if (/^\d{4}-\d{2}-\d{2}$/.test(bDate)) {
        const [year, month, day] = bDate.split('-');
        setBirthDate(`${day}-${month}-${year}`);
      } else {
        setBirthDate(bDate);
      }

      // Fetch the latest height observation (LOINC 8302-2) for this patient
      fetch(`/api/fhir/Observation?subject=Patient/${patientToEdit.id}&code=8302-2&_count=1`)
        .then(res => res.json())
        .then(data => {
          if (data.resourceType === 'Bundle' && data.entry && data.entry[0]) {
            const obs = data.entry[0].resource;
            if (obs && obs.valueQuantity && typeof obs.valueQuantity.value === 'number') {
              setHeight(String(obs.valueQuantity.value));
            }
          }
        })
        .catch(err => {
          console.error('Error fetching height observation:', err);
        });

      fetch(`/api/fhir/Condition?patient=${patientToEdit.id}`)
        .then(res => res.json())
        .then(data => {
          const conditions =
            data.resourceType === 'Bundle' && data.entry
              ? data.entry
                  .filter((e: any) => e.resource?.resourceType === 'Condition')
                  .map((e: any) => e.resource)
              : [];
          const inferred = classifyCareCategoryFromResources(conditions);
          const inferredSubCategory = extractGeneralCareSubCategoryFromResources(conditions);
          setCareCategory(inferred);
          setInitialCareCategory(inferred);
          setGeneralCareSubCategory(inferredSubCategory ?? '');
          setInitialGeneralCareSubCategory(inferredSubCategory ?? '');
        })
        .catch(err => {
          console.error('Error fetching patient conditions:', err);
          setCareCategory('other');
          setInitialCareCategory('other');
          setGeneralCareSubCategory('');
          setInitialGeneralCareSubCategory('');
        });
    } else {
      // Clear form for new patient
      setGivenName('');
      setFamilyName('');
      setGender('');
      setBirthDate('');
      setPhone('');
      setAllergies('');
      setHeight('');
      setCareCategory('');
      setInitialCareCategory('');
      setGeneralCareSubCategory('');
      setInitialGeneralCareSubCategory('');
    }
    setError(null);
    setValidationErrors({});
  }, [patientToEdit, isOpen]);

  if (!isOpen) return null;

  // Validate the DD-MM-YYYY date format
  const validateDate = (dateStr: string): boolean => {
    if (!/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return false;
    const [day, month, year] = dateStr.split('-').map(Number);
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    
    // Leap year / day count check
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return false;
    }

    // Check if the date is in the future
    if (date > new Date()) return false;
    
    // Check if unreasonably old (e.g., > 150 years ago)
    if (year < new Date().getFullYear() - 150) return false;

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: { [key: string]: string } = {};

    // Validate fields
    if (!givenName.trim()) {
      errors.givenName = 'Given (First) name is required';
    }
    if (!familyName.trim()) {
      errors.familyName = 'Family (Last) name is required';
    }
    if (!gender) {
      errors.gender = 'Gender selection is required';
    }
    if (!careCategory) {
      errors.careCategory = 'Care category selection is required';
    }
    if (careCategory === 'other' && !generalCareSubCategory) {
      errors.generalCareSubCategory = 'Sub category is required for General Care patients';
    }
    if (!birthDate.trim()) {
      errors.birthDate = 'Date of birth is required';
    } else if (!validateDate(birthDate)) {
      errors.birthDate = 'Please enter a valid past date in DD-MM-YYYY format (e.g. 25-05-1990)';
    }
    if (!phone.trim()) {
      errors.phone = 'Phone / contact number is required';
    } else if (!isValidPatientPhone(phone)) {
      errors.phone = 'Please enter a valid phone number (7–15 digits)';
    }

    if (height.trim()) {
      const hVal = parseFloat(height);
      if (isNaN(hVal) || hVal < 30 || hVal > 250) {
        errors.height = 'Please enter a valid height between 30 and 250 cm';
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});
    setIsSubmitting(true);

    try {
      let url = '/api/fhir/Patient';
      let method = 'POST';
      
      // Convert birthDate from DD-MM-YYYY to YYYY-MM-DD standard format for the FHIR server
      const [day, month, year] = birthDate.split('-');
      const standardBirthDate = `${year}-${month}-${day}`;
      
      // Construct base FHIR resource
      let patientResource: any = {
        resourceType: 'Patient',
        name: [
          {
            use: 'official',
            family: familyName.trim(),
            given: givenName.trim().split(/\s+/),
          },
        ],
        gender: gender,
        birthDate: standardBirthDate,
        telecom: buildPatientTelecomWithPhone(phone),
      };

      if (patientToEdit) {
        url = `/api/fhir/Patient/${patientToEdit.id}`;
        method = 'PUT';
        // Preserve all original fields to avoid deleting server data, but update name, gender, birthDate
        patientResource = applyAllergiesToPatient(
          {
            ...patientToEdit,
            name: [
              {
                use: 'official',
                family: familyName.trim(),
                given: givenName.trim().split(/\s+/),
              },
            ],
            gender: gender,
            birthDate: standardBirthDate,
            telecom: buildPatientTelecomWithPhone(phone, patientToEdit.telecom),
          },
          allergies
        );
      } else {
        patientResource = applyAllergiesToPatient(patientResource, allergies);
      }

      // 1. Save Patient
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/fhir+json',
        },
        body: JSON.stringify(patientResource),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.error || 
          `Failed to save patient. Server responded with code ${response.status}.`
        );
      }

      const savedPatient = await response.json();
      const savedPatientId = savedPatient.id || patientToEdit?.id;

      // 2. If Height is provided, POST a new Height Observation resource (LOINC 8302-2)
      if (height.trim() && savedPatientId) {
        const heightObs = {
          resourceType: 'Observation',
          status: 'final',
          category: [{
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs'
            }]
          }],
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: '8302-2',
              display: 'Body height'
            }],
            text: 'Height'
          },
          subject: { reference: `Patient/${savedPatientId}` },
          effectiveDateTime: new Date().toISOString(),
          valueQuantity: {
            value: parseFloat(height),
            unit: 'cm',
            system: 'http://unitsofmeasure.org',
            code: 'cm'
          }
        };

        const obsResponse = await fetch('/api/fhir/Observation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/fhir+json',
          },
          body: JSON.stringify(heightObs)
        });

        if (!obsResponse.ok) {
          console.error('Failed to save height observation resource:', obsResponse.status);
        }
      }

      // 3. Save care category enrolment only when the user selected/changed it in the form
      const categoryToSave = careCategory as CareCategory;
      if (savedPatientId && categoryToSave && categoryToSave !== initialCareCategory) {
        const condResponse = await fetch('/api/fhir/Condition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/fhir+json',
          },
          body: JSON.stringify(buildCareCategoryCondition(savedPatientId, categoryToSave)),
        });

        if (!condResponse.ok) {
          console.error('Failed to save care category condition:', condResponse.status);
        }
      }

      // 4. Save general care sub category when General Care is selected and value changed
      if (
        savedPatientId &&
        categoryToSave === 'other' &&
        generalCareSubCategory &&
        generalCareSubCategory !== initialGeneralCareSubCategory
      ) {
        const subCategoryResponse = await fetch('/api/fhir/Condition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/fhir+json',
          },
          body: JSON.stringify(
            buildGeneralCareSubCategoryCondition(savedPatientId, generalCareSubCategory)
          ),
        });

        if (!subCategoryResponse.ok) {
          console.error('Failed to save general care sub category condition:', subCategoryResponse.status);
        }
      }

      onSuccess({
        patientId: savedPatientId,
        careCategory: categoryToSave,
      });
      onClose();
    } catch (err: any) {
      console.error('Error saving patient:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ borderBottom: '1px solid var(--border-card)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
            <UserPlus size={20} className="text-muted" style={{ color: 'var(--primary)' }} />
            {patientToEdit ? 'Edit Patient Demographics' : 'Register New Patient'}
          </h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid-cols-2">
            <div className="form-group">
              <label htmlFor="givenName" className="form-label">Given Name(s)</label>
              <input
                id="givenName"
                type="text"
                className="form-input"
                placeholder="e.g. John"
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                disabled={isSubmitting}
              />
              {validationErrors.givenName && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
                  {validationErrors.givenName}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="familyName" className="form-label">Family Name</label>
              <input
                id="familyName"
                type="text"
                className="form-input"
                placeholder="e.g. Doe"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                disabled={isSubmitting}
              />
              {validationErrors.familyName && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
                  {validationErrors.familyName}
                </span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="gender" className="form-label">Administrative Gender</label>
            <select
              id="gender"
              className="form-input"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={isSubmitting}
              style={selectChevronStyle}
            >
              <option value="">Select gender...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="unknown">Unknown</option>
            </select>
            {validationErrors.gender && (
              <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
                {validationErrors.gender}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="careCategory" className="form-label">Care Category</label>
            <select
              id="careCategory"
              className="form-input"
              value={careCategory}
              onChange={(e) => {
                const value = e.target.value as CareCategory | '';
                setCareCategory(value);
                if (value !== 'other') {
                  setGeneralCareSubCategory('');
                }
              }}
              disabled={isSubmitting}
              style={selectChevronStyle}
            >
              <option value="">Select care category...</option>
              {CARE_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {validationErrors.careCategory && (
              <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
                {validationErrors.careCategory}
              </span>
            )}
          </div>

          {careCategory === 'other' && (
            <div className="form-group">
              <label htmlFor="generalCareSubCategory" className="form-label">Sub Category</label>
              <select
                id="generalCareSubCategory"
                className="form-input"
                value={generalCareSubCategory}
                onChange={(e) =>
                  setGeneralCareSubCategory(e.target.value as GeneralCareSubCategory | '')
                }
                disabled={isSubmitting}
                style={selectChevronStyle}
              >
                <option value="">Select sub category...</option>
                {GENERAL_CARE_SUBCATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {validationErrors.generalCareSubCategory && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
                  {validationErrors.generalCareSubCategory}
                </span>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="phone" className="form-label">Phone / Contact Number</label>
            <input
              id="phone"
              type="tel"
              className="form-input"
              placeholder="e.g. +41 79 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
              autoComplete="tel"
            />
            {validationErrors.phone && (
              <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
                {validationErrors.phone}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="allergies" className="form-label">
              Allergies <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
            </label>
            <input
              id="allergies"
              type="text"
              className="form-input"
              placeholder="e.g. Penicillin, Latex — leave blank for NKA"
              value={allergies}
              onChange={(e) => setAllergies(normalizeAllergiesInput(e.target.value))}
              disabled={isSubmitting}
              maxLength={MAX_PATIENT_ALLERGIES_LENGTH}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
              Free text, up to {MAX_PATIENT_ALLERGIES_LENGTH} characters. Leave empty to record no known allergies (NKA).
            </span>
          </div>

          <div className="grid-cols-2">
            <div className="form-group">
              <label htmlFor="birthDate" className="form-label">Date of Birth</label>
              <BirthDatePicker
                id="birthDate"
                value={birthDate}
                onChange={setBirthDate}
                disabled={isSubmitting}
              />
              {validationErrors.birthDate && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
                  {validationErrors.birthDate}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="height" className="form-label">Height (cm)</label>
              <input
                id="height"
                type="number"
                step="any"
                className="form-input"
                placeholder="e.g. 175"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                disabled={isSubmitting}
              />
              {validationErrors.height && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
                  {validationErrors.height}
                </span>
              )}
            </div>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '1.25rem' }}>
            * Click the calendar icon to choose date of birth and scroll back to earlier years. Phone number is required for patient contact. Allergies are optional; leave blank for NKA. Care category and General Care sub category are stored as clinical Conditions linked to this patient. Height is recorded as a separate Observation.
          </span>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem', borderTop: '1px solid var(--border-card)', paddingTop: '1.25rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              <Save size={16} />
              {isSubmitting ? 'Saving...' : 'Save Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
