import type { MiddleEastCountry } from "@/lib/jobs/regions";

export function stripTags(text: string) {
  return text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Providers often return only a city; append the country so every saved job reads unambiguously. */
export function withCountry(location: unknown, country: MiddleEastCountry) {
  const text = String(location || "").trim();
  if (!text) return country.name;
  return text.toLowerCase().includes(country.name.toLowerCase()) ? text : `${text}, ${country.name}`;
}
