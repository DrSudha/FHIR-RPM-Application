/** Read primary phone from a FHIR Patient.telecom array. */
export function getPatientPhone(patient: { telecom?: Array<{ system?: string; value?: string }> }): string {
  const phone = patient.telecom?.find((entry) => entry.system === 'phone' && entry.value?.trim());
  return phone?.value?.trim() ?? '';
}

/** Build Patient.telecom with an updated phone entry. */
export function buildPatientTelecomWithPhone(
  phone: string,
  existingTelecom?: Array<{ system?: string; value?: string; use?: string }>
): Array<{ system: string; value: string; use?: string }> {
  const trimmed = phone.trim();
  const withoutPhone = (existingTelecom ?? []).filter((entry) => entry.system !== 'phone');
  const preserved = withoutPhone.filter(
    (entry): entry is { system: string; value: string; use?: string } =>
      Boolean(entry.system && entry.value)
  );
  return [...preserved, { system: 'phone', value: trimmed, use: 'mobile' }];
}

export function isValidPatientPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
