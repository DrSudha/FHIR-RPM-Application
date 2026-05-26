import React from 'react';

interface RpmLogoIconProps {
  size?: number;
  className?: string;
}

/** Heart + vitals waveform + wireless signal — remote patient monitoring */
export default function RpmLogoIcon({ size = 20, className = '' }: RpmLogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Wireless signal arcs */}
      <path
        d="M18.5 5.5c1.2 1.2 1.9 2.8 1.9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M16.5 7.5c0.7 0.7 1.1 1.6 1.1 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      <circle cx="15.2" cy="11.2" r="1.1" fill="currentColor" />

      {/* Heart */}
      <path
        d="M12 18.5S4.5 14.2 4.5 9.5C4.5 7.2 6.3 5.5 8.5 5.5c1.4 0 2.6 0.7 3.5 1.7c0.9-1 2.1-1.7 3.5-1.7 2.2 0 4 1.7 4 4 0 4.7-7.5 9-7.5 9Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* ECG / vitals trace */}
      <path
        d="M6.5 11.2h1.8l1-2.2 1.4 4.4 1.2-3.1h4.6"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
