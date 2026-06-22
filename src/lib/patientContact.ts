import {
  DEFAULT_PHONE_COUNTRY_ID,
  formatPatientPhone,
  parsePatientPhone,
} from '@/lib/phoneCountryCodes';

/** Read primary phone from a FHIR Patient.telecom array. */
export function getPatientPhone(patient: { telecom?: Array<{ system?: string; value?: string }> }): string {
  const phone = patient.telecom?.find((entry) => entry.system === 'phone' && entry.value?.trim());
  return phone?.value?.trim() ?? '';
}

export function getPatientPhoneParts(patient: { telecom?: Array<{ system?: string; value?: string }> }): {
  countryId: string;
  localNumber: string;
} {
  return parsePatientPhone(getPatientPhone(patient));
}

/** Build Patient.telecom with an updated phone entry. */
export function buildPatientTelecomWithPhone(
  countryId: string,
  localNumber: string,
  existingTelecom?: Array<{ system?: string; value?: string; use?: string }>
): Array<{ system: string; value: string; use?: string }> {
  const fullPhone = formatPatientPhone(countryId, localNumber);
  const withoutPhone = (existingTelecom ?? []).filter((entry) => entry.system !== 'phone');
  const preserved = withoutPhone.filter(
    (entry): entry is { system: string; value: string; use?: string } =>
      Boolean(entry.system && entry.value)
  );

  if (!fullPhone) {
    return preserved;
  }

  return [...preserved, { system: 'phone', value: fullPhone, use: 'mobile' }];
}

export function isValidPatientPhoneLocalNumber(localNumber: string): boolean {
  const digits = localNumber.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/** @deprecated Use isValidPatientPhoneLocalNumber for split country/number fields. */
export function isValidPatientPhone(phone: string): boolean {
  const { localNumber } = parsePatientPhone(phone);
  return isValidPatientPhoneLocalNumber(localNumber);
}

export { DEFAULT_PHONE_COUNTRY_ID };
