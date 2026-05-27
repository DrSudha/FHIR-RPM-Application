'use client';

import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';

type BirthDatePickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function ddmmyyyyToIso(value: string): string {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) return '';
  const [day, month, year] = value.split('-');
  return `${year}-${month}-${day}`;
}

function isoToDdmmyyyy(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}-${month}-${year}`;
}

export default function BirthDatePicker({ id, value, onChange, disabled }: BirthDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const currentYear = new Date().getFullYear();

  const openPicker = () => {
    const input = inputRef.current;
    if (!input || disabled) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
    }
  };

  return (
    <div className="birth-date-input-wrap">
      <input
        ref={inputRef}
        id={id}
        type="date"
        className="form-input birth-date-input"
        value={ddmmyyyyToIso(value)}
        min={`${currentYear - 120}-01-01`}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(event) => onChange(isoToDdmmyyyy(event.target.value))}
        disabled={disabled}
      />
      <button
        type="button"
        className="birth-date-calendar-btn"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Open date of birth calendar"
      >
        <Calendar size={17} />
      </button>
    </div>
  );
}
