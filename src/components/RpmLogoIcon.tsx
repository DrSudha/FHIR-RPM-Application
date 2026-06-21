import React from 'react';

interface RpmLogoIconProps {
  size?: number;
  className?: string;
}

/** Pro Health mark — shield, vitals pulse, and connected monitoring */
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
      <path
        d="M12 2.75L18.25 5.75V11.25C18.25 15.35 12 20.25 12 20.25C12 20.25 5.75 15.35 5.75 11.25V5.75L12 2.75Z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path
        d="M7.25 11.75H9.1L10.35 8.85L11.75 14.5L13.05 10.6H16.75"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.15" cy="6.85" r="1.15" fill="currentColor" />
      <path
        d="M15.35 4.65C16.15 5.45 16.65 6.55 16.65 7.85"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.72"
      />
    </svg>
  );
}
