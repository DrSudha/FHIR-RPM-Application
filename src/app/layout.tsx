import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pro Health - Remote Patient Monitoring | FHIR R4 Clinical Portal',
  description: 'Enterprise-grade clinical data visualization, demographics tracker, and vital signs monitoring powered by standard HL7 FHIR R4 protocols.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: 'light' }}>
      <body>{children}</body>
    </html>
  );
}
