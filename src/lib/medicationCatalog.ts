import catalogData from '@/data/medication-catalog.json';

export type MedicationCatalogEntry = {
  match: string[];
  displayName: string;
  rxnormCode?: string;
  doseMg: number;
  frequency: number;
  route: string;
  unit: string;
  form?: string;
};

export type ResolvedMedicationProfile = MedicationCatalogEntry & {
  dose: number;
};

const CATALOG_ENTRIES = catalogData.entries as MedicationCatalogEntry[];

const DEFAULT_FORM_BY_ROUTE: Record<string, string> = {
  Oral: 'Tablet',
  Subcutaneous: 'Injection',
  'Intravenous infusion': 'Infusion',
  Inhalation: 'Inhaler',
  Sublingual: 'Sublingual tablet',
  Topical: 'Ointment',
  Rectal: 'Suppository',
  Ophthalmic: 'Eye drops',
  Otic: 'Ear drops',
};

export function defaultFormForRoute(route: string): string {
  return DEFAULT_FORM_BY_ROUTE[route] || 'Tablet';
}

/** Infer dosage form from free-text medication names (e.g. "500 mg cap"). */
export function inferMedicationFormFromName(rawName: string): string | null {
  const text = rawName.toLowerCase();
  if (/\bsyrup\b|\bsuspension\b|\belixir\b/.test(text)) return 'Syrup';
  if (/\bointment\b|\bcream\b|\blotion\b|\bpaste\b/.test(text)) return 'Ointment';
  if (/\bgel\b/.test(text)) return 'Gel';
  if (/\bcapsule\b|\bcapsules\b|\bcaps?\b(?!\s*ule)/.test(text)) return 'Capsule';
  if (/\btablet\b|\btablets\b|\btabs?\b(?!\s*let)/.test(text)) return 'Tablet';
  if (/\binjection\b|\binjectable\b|\bprefilled pen\b|\bpen\b/.test(text)) return 'Injection';
  if (/\binhaler\b|\bnebulizer\b|\binhalation\b/.test(text)) return 'Inhaler';
  if (/\bdrops\b/.test(text)) return 'Drops';
  if (/\bsolution\b/.test(text)) return 'Solution';
  return null;
}

export function resolveMedicationForm(rawName: string, route?: string): string {
  const fromName = inferMedicationFormFromName(rawName);
  if (fromName) return fromName;

  const profile = lookupMedicationProfile(rawName);
  if (profile?.form) return profile.form;
  if (profile?.route) return defaultFormForRoute(profile.route);

  return defaultFormForRoute(route || 'Oral');
}

export function frequencyLabel(frequency: number): string {
  if (frequency === 1) return 'Once daily';
  if (frequency === 2) return 'Twice daily';
  if (frequency === 3) return 'Three times daily';
  return `${frequency}x daily`;
}

export function simplifyMedicationDisplayName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return 'Unknown Medication';

  const bracketMatch = trimmed.match(/\[([^\]]+)\]/);
  if (bracketMatch?.[1] && bracketMatch[1].length <= 80) {
    return bracketMatch[1].trim();
  }

  const profile = lookupMedicationProfile(trimmed);
  if (profile) return profile.displayName;

  if (trimmed.length > 72) {
    const short = trimmed.split(/[/{]/)[0]?.trim();
    return short && short.length <= 72 ? short : `${trimmed.slice(0, 69)}…`;
  }

  return trimmed;
}

export function lookupMedicationProfile(rawName: string): MedicationCatalogEntry | null {
  const searchTexts = buildMedicationSearchTexts(rawName);

  for (const entry of CATALOG_ENTRIES) {
    if (
      entry.match.some((needle) =>
        searchTexts.some((text) => text.includes(needle.toLowerCase()))
      )
    ) {
      return entry;
    }
  }

  return null;
}

function buildMedicationSearchTexts(rawName: string): string[] {
  const normalized = rawName.toLowerCase();
  const texts = new Set<string>([normalized]);

  const bracketMatch = rawName.match(/\[([^\]]+)\]/);
  if (bracketMatch?.[1]) texts.add(bracketMatch[1].toLowerCase());

  const packMatch = rawName.match(/\]\s*Pack\s*\[([^\]]+)\]/i);
  if (packMatch?.[1]) texts.add(packMatch[1].toLowerCase());

  return [...texts];
}

export function adjustMedicationDose(
  baseDose: number,
  age: number,
  weightKg: number
): number {
  let dose = baseDose;
  if (age >= 75) dose *= 0.7;
  else if (age >= 65) dose *= 0.85;
  if (weightKg > 0 && weightKg < 55) dose *= 0.85;
  if (weightKg >= 100) dose *= 1.1;
  if (dose >= 10) return Math.round(dose);
  return Math.round(dose * 10) / 10;
}

export function resolveMedicationProfile(
  rawName: string,
  age = 50,
  weightKg = 0
): ResolvedMedicationProfile {
  const matched = lookupMedicationProfile(rawName);
  const profile = matched ?? {
    match: [],
    displayName: simplifyMedicationDisplayName(rawName),
    rxnormCode: undefined,
    doseMg: 10,
    frequency: 1,
    route: 'Oral',
    unit: 'mg',
    form: 'Tablet',
  };

  return {
    ...profile,
    form: profile.form ?? defaultFormForRoute(profile.route),
    dose: adjustMedicationDose(profile.doseMg, age, weightKg),
  };
}

export function buildDosageInstructionFromProfile(
  profile: ResolvedMedicationProfile,
  startDate?: string,
  endDate?: string
) {
  const frequency = frequencyLabel(profile.frequency).toLowerCase();
  const instruction = {
    text: `${profile.dose} ${profile.unit} ${frequency}`,
    route: { text: profile.route },
    timing: {
      code: { text: frequencyLabel(profile.frequency) },
      repeat: {
        frequency: profile.frequency,
        period: 1,
        periodUnit: 'd',
        ...(startDate
          ? {
              boundsPeriod: endDate
                ? { start: startDate, end: endDate }
                : { start: startDate },
            }
          : {}),
      },
    },
    doseAndRate: [{ doseQuantity: { value: profile.dose, unit: profile.unit } }],
  };

  return instruction;
}

export function getCatalogEntries(): MedicationCatalogEntry[] {
  return CATALOG_ENTRIES;
}
