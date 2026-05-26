import React from 'react';

// Common interface for the icons
interface VitalIconProps {
  className?: string;
  size?: number;
}

// 1. Heart Rate (Heart + ECG pulse) in pink/red tone
export function HeartRateIcon({ className = '', size = 32 }: VitalIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background soft bubble */}
      <circle cx="12" cy="18" r="8" fill="#fecdd3" opacity="0.8" />
      {/* Bold Heart silhouette */}
      <path
        d="M16 27.5C16 27.5 5 21 5 12C5 8.134 8.134 5 12 5C14.22 5 15.65 6.5 16 7.5C16.35 6.5 17.78 5 20 5C23.866 5 27 8.134 27 12C27 21 16 27.5 16 27.5Z"
        fill="#f43f5e"
        fillOpacity="0.35"
        stroke="#1e293b"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Telemetry pulse line overlay */}
      <path
        d="M6 13h4.5l2-4.5L16 19.5l3.5-9.5L21.5 15H26"
        stroke="#e11d48"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 2. Blood Pressure (Dial gauge + Telemetry bulb) in blue/sky tone
export function BloodPressureIcon({ className = '', size = 32 }: VitalIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background bubble */}
      <circle cx="21" cy="19" r="7.5" fill="#bae6fd" opacity="0.8" />
      {/* Pressure Gauge dial */}
      <circle cx="13" cy="12" r="7" fill="#f8fafc" stroke="#1e293b" strokeWidth="1.8" />
      {/* Indicator needle */}
      <path d="M13 12l4-4" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="13" cy="12" r="1.5" fill="#1e293b" />
      {/* Calibration tick marks */}
      <path d="M13 5v1.5M6 12h1.5M20 12h-1.5M13 19v-1.5" stroke="#1e293b" strokeWidth="1.2" />
      {/* Squeeze telemetry bulb */}
      <path
        d="M23 21c-1.5 0-3 1.5-3 3.5s1.5 3.5 3 3.5 3-1.5 3-3.5S24.5 21 23 21z"
        fill="#38bdf8"
        fillOpacity="0.4"
        stroke="#1e293b"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Connection tubes */}
      <path
        d="M13 19c0 2 2.5 3.5 5 3.5"
        stroke="#1e293b"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M23 21v-2" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// 3. Body Temperature (Clinical Glass Thermometer) in orange/amber tone
export function TemperatureIcon({ className = '', size = 32 }: VitalIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background bubble */}
      <circle cx="16" cy="22" r="8" fill="#fde047" opacity="0.65" />
      {/* Glass casing outlines */}
      <path
        d="M13 8c0-1.657 1.343-3 3-3s3 1.343 3 3v12.07c1.204 1.01 2 2.52 2 4.218 0 3.16-2.239 5.712-5 5.712s-5-2.552-5-5.712c0-1.697.796-3.207 2-4.218V8z"
        fill="#f8fafc"
        stroke="#1e293b"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Red warm mercury fluid */}
      <path
        d="M15 13v9.42c-.596.347-1 1.018-1 1.83 0 1.243.895 2.25 2 2.25s2-1.007 2-2.25c0-.812-.404-1.483-1-1.83V13h-2z"
        fill="#ea580c"
      />
      {/* Level indicators */}
      <path d="M19 7h-2M19 10h-2M19 13h-2M19 16h-2" stroke="#1e293b" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// 4. Respiratory Rate (Airflow lungs structure) in mint green tone
export function RespiratoryRateIcon({ className = '', size = 32 }: VitalIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background bubble */}
      <circle cx="16" cy="16" r="8.5" fill="#a7f3d0" opacity="0.8" />
      {/* Left Lung outline & fill */}
      <path
        d="M14 8c-2.5 0-5 2-5 6.5s2.5 10.5 5 10.5h1V8h-1z"
        fill="#10b981"
        fillOpacity="0.3"
        stroke="#1e293b"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right Lung outline & fill */}
      <path
        d="M18 8c2.5 0 5 2 5 6.5s-2.5 10.5-5 10.5h-1V8h1z"
        fill="#10b981"
        fillOpacity="0.3"
        stroke="#1e293b"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Bronchial central tube */}
      <path d="M16 5v12.5" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 14.5l-3.5 3M16 14.5l3.5 3" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// 5. Oxygen Saturation (Digital Pulse Oximeter Clip) in cyan tone
export function OxygenSatIcon({ className = '', size = 32 }: VitalIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background bubble */}
      <circle cx="13" cy="18" r="8" fill="#cffafe" opacity="0.85" />
      {/* Oximeter device body */}
      <rect x="7" y="14" width="18" height="12" rx="2" fill="#0891b2" fillOpacity="0.25" stroke="#1e293b" strokeWidth="1.8" />
      {/* Finger insert line */}
      <path d="M11 14V9a2 2 0 012-2h6a2 2 0 012 2v5" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 7V4" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" />
      {/* % indicator display */}
      <circle cx="12" cy="20" r="1.2" fill="#0e7490" stroke="#1e293b" strokeWidth="1" />
      <circle cx="20" cy="20" r="1.2" fill="#0e7490" stroke="#1e293b" strokeWidth="1" />
      <line x1="10.5" y1="21.5" x2="21.5" y2="18.5" stroke="#1e293b" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// 6. Weight (Bathroom Digital Weighing Scale) in purple/lavender tone
export function WeightIcon({ className = '', size = 32 }: VitalIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background bubble */}
      <circle cx="16" cy="21" r="8" fill="#f3e8ff" opacity="0.85" />
      {/* Scale Body */}
      <rect x="6" y="6" width="20" height="20" rx="3.5" fill="#8b5cf6" fillOpacity="0.2" stroke="#1e293b" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="8.5" y="8.5" width="15" height="15" rx="2" stroke="#1e293b" strokeWidth="1.2" strokeDasharray="2 2" />
      {/* Digital LED Screen */}
      <rect x="11" y="9" width="10" height="4.5" rx="1.2" fill="#f8fafc" stroke="#1e293b" strokeWidth="1.4" />
      <path d="M13 11.2h6" stroke="#8b5cf6" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// 7. BMI (Body silhouette and tape measure) in indigo tone
export function BmiIcon({ className = '', size = 32 }: VitalIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background bubble */}
      <circle cx="13" cy="17" r="7.5" fill="#e0e7ff" opacity="0.85" />
      {/* Vertical Tape measure */}
      <rect x="21" y="5" width="5" height="22" rx="1" fill="#6366f1" fillOpacity="0.25" stroke="#1e293b" strokeWidth="1.8" />
      {/* Tape marks */}
      <path d="M21 9h2.5M21 13h4M21 17h2.5M21 21h4M21 25h2.5" stroke="#1e293b" strokeWidth="1.2" strokeLinecap="round" />
      {/* Body avatar head & shoulders */}
      <circle cx="11.5" cy="10" r="3" fill="#818cf8" stroke="#1e293b" strokeWidth="1.8" />
      <path
        d="M6 25v-4c0-2.5 2-4 5.5-4s5.5 1.5 5.5 4v4H6z"
        fill="#818cf8"
        stroke="#1e293b"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 8. Blood Glucose (Device Reader & Blood droplet) in yellow/amber tone
export function BloodGlucoseIcon({ className = '', size = 32 }: VitalIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background bubble */}
      <circle cx="20" cy="18" r="8" fill="#fef3c7" opacity="0.85" />
      {/* Handheld glucose reader device */}
      <rect x="6" y="8" width="14" height="19" rx="3.5" fill="#f59e0b" fillOpacity="0.25" stroke="#1e293b" strokeWidth="1.8" />
      {/* LCD Reader window */}
      <rect x="8.5" y="11" width="9" height="7" rx="1.2" fill="#ffffff" stroke="#1e293b" strokeWidth="1.4" />
      {/* Micro reading representation */}
      <path d="M10.5 14.5h5M12.5 13.5v2" stroke="#1e293b" strokeWidth="1.2" strokeLinecap="round" />
      {/* Reagent test strip */}
      <rect x="11.5" y="27" width="3" height="3" rx="0.5" fill="#cbd5e1" stroke="#1e293b" strokeWidth="1.4" />
      {/* Red blood drop clip */}
      <path
        d="M24.5 17c0 2.485-1.79 4.5-4 4.5s-4-2.015-4-4.5S20.5 10 20.5 10s4 4.523 4 7z"
        fill="#dc2626"
        stroke="#1e293b"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
