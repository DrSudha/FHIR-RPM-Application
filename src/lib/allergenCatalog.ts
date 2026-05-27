import allergenCatalogData from '@/data/allergen-catalog.json';

export type AllergenCatalogEntry = {
  id: 'peanut' | 'soybean' | string;
  match: string[];
  display: string;
  snomedCode: string;
  category: 'medication' | 'food' | 'environment' | 'biologic';
};

/** SNOMED CT substance codes — peanut and soybean are distinct allergens. */
export const PEANUT_ALLERGEN_SNOMED = '75413007';
export const SOYBEAN_ALLERGEN_SNOMED = '256355007';

const ALLERGEN_ENTRIES = allergenCatalogData.entries as AllergenCatalogEntry[];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collapse common spellings to a canonical token before catalog lookup. */
export function normalizeAllergyToken(raw: string): string {
  let token = raw
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bbeens\b/g, 'beans');

  if (/^(soyabeans?|soybeans?|soya beans?|soy beans?)$/.test(token)) {
    return 'soybean';
  }

  if (/^(peanuts?|groundnuts?|arachis)$/.test(token)) {
    return 'peanut';
  }

  return token;
}

function singularizeToken(token: string): string {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith('es') && token.length > 3) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && token.length > 2) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenMatchesNeedle(token: string, needle: string): boolean {
  const normalizedNeedle = needle.toLowerCase().trim();
  if (!normalizedNeedle) return false;

  if (token === normalizedNeedle) return true;

  const singularToken = singularizeToken(token);
  const singularNeedle = singularizeToken(normalizedNeedle);
  if (singularToken === singularNeedle) return true;

  const wordPattern = new RegExp(`\\b${escapeRegExp(normalizedNeedle)}\\b`, 'i');
  if (wordPattern.test(token)) return true;

  if (normalizedNeedle.length >= 5 && token.includes(normalizedNeedle)) return true;

  return false;
}

/** Map one allergy token to exactly one SNOMED-coded catalog entry (peanut ≠ soybean). */
export function lookupAllergenConcept(rawToken: string): AllergenCatalogEntry | null {
  const token = normalizeAllergyToken(rawToken);
  if (!token) return null;

  let bestMatch: { entry: AllergenCatalogEntry; score: number } | null = null;

  for (const entry of ALLERGEN_ENTRIES) {
    for (const needle of entry.match) {
      if (!tokenMatchesNeedle(token, needle)) continue;

      const normalizedNeedle = needle.toLowerCase().trim();
      let score = normalizedNeedle.length;
      if (token === normalizedNeedle) score += 100;
      else if (singularizeToken(token) === singularizeToken(normalizedNeedle)) score += 80;
      else if (new RegExp(`\\b${escapeRegExp(normalizedNeedle)}\\b`, 'i').test(token)) score += 40;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { entry, score };
      }
    }
  }

  return bestMatch?.entry ?? null;
}

export function getAllergenCatalogEntries(): AllergenCatalogEntry[] {
  return ALLERGEN_ENTRIES;
}

export function getAllergenSnomedCode(entry: AllergenCatalogEntry): string {
  return entry.snomedCode;
}
