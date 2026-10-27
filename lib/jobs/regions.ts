export type MiddleEastCountry = {
  code: string;
  name: string;
  cities: string[];
  aliases?: string[];
  /** Careerjet locale, present only where Careerjet publishes a site for the country. */
  careerjetLocale?: string;
};

export const ALL_COUNTRIES = "ALL";

export const MIDDLE_EAST: MiddleEastCountry[] = [
  { code: "AE", name: "United Arab Emirates", cities: ["Dubai", "Abu Dhabi", "Sharjah"], aliases: ["uae"], careerjetLocale: "en_AE" },
  { code: "SA", name: "Saudi Arabia", cities: ["Riyadh", "Jeddah", "Dammam"], aliases: ["ksa"], careerjetLocale: "en_SA" },
  { code: "QA", name: "Qatar", cities: ["Doha"], careerjetLocale: "en_QA" },
  { code: "KW", name: "Kuwait", cities: ["Kuwait City"], careerjetLocale: "en_KW" },
  { code: "BH", name: "Bahrain", cities: ["Manama"] },
  { code: "OM", name: "Oman", cities: ["Muscat"], careerjetLocale: "en_OM" },
  { code: "EG", name: "Egypt", cities: ["Cairo", "Alexandria"] },
  { code: "JO", name: "Jordan", cities: ["Amman"] }
];

/**
 * Resolves the countries a search covers. A specific code wins; with "ALL", a city or country
 * named in the location box narrows the search to that country. Returns null for an unknown code
 * so callers can reject anything outside the Middle East.
 */
export function resolveCountries(code: string | undefined, location: string): MiddleEastCountry[] | null {
  const wanted = (code || ALL_COUNTRIES).toUpperCase();
  if (wanted !== ALL_COUNTRIES) {
    const match = MIDDLE_EAST.find((country) => country.code === wanted);
    return match ? [match] : null;
  }
  const text = location.trim().toLowerCase();
  if (text) {
    const named = MIDDLE_EAST.find((country) =>
      text.includes(country.name.toLowerCase()) ||
      country.cities.some((city) => text.includes(city.toLowerCase())) ||
      (country.aliases || []).some((alias) => new RegExp(`\\b${alias}\\b`).test(text))
    );
    if (named) return [named];
  }
  return MIDDLE_EAST;
}
