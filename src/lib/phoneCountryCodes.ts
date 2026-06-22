import phoneCountryData from '@/data/phone-country-codes.json';

export type PhoneCountry = {
  id: string;
  name: string;
  dialCode: string;
};

export const DEFAULT_PHONE_COUNTRY_ID = phoneCountryData.defaultCountryId;

const PHONE_COUNTRIES = phoneCountryData.countries as PhoneCountry[];

const COUNTRY_BY_ID = new Map(PHONE_COUNTRIES.map((country) => [country.id, country]));

/** Countries sorted by dial-code length (longest first) for parsing international numbers. */
const COUNTRIES_BY_DIAL_LENGTH = [...PHONE_COUNTRIES].sort(
  (a, b) => b.dialCode.replace(/\D/g, '').length - a.dialCode.replace(/\D/g, '').length
);

export function getPhoneCountries(): PhoneCountry[] {
  return PHONE_COUNTRIES;
}

export function getPhoneCountryById(countryId: string): PhoneCountry {
  return COUNTRY_BY_ID.get(countryId) ?? COUNTRY_BY_ID.get(DEFAULT_PHONE_COUNTRY_ID)!;
}

export function formatPatientPhone(countryId: string, localNumber: string): string {
  const digits = localNumber.replace(/\D/g, '');
  if (!digits) return '';

  const country = getPhoneCountryById(countryId);
  return `${country.dialCode}${digits}`;
}

export function parsePatientPhone(fullPhone: string): { countryId: string; localNumber: string } {
  const trimmed = fullPhone.trim();
  if (!trimmed) {
    return { countryId: DEFAULT_PHONE_COUNTRY_ID, localNumber: '' };
  }

  const normalized = trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/\D/g, '')}`;
  const allDigits = normalized.replace(/\D/g, '');

  for (const country of COUNTRIES_BY_DIAL_LENGTH) {
    const dialDigits = country.dialCode.replace(/\D/g, '');
    if (allDigits.startsWith(dialDigits) && allDigits.length > dialDigits.length) {
      return {
        countryId: country.id,
        localNumber: allDigits.slice(dialDigits.length),
      };
    }
  }

  return {
    countryId: DEFAULT_PHONE_COUNTRY_ID,
    localNumber: trimmed.replace(/\D/g, ''),
  };
}
