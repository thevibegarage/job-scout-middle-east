import type { JobCandidate } from "@/lib/types";
import type { MiddleEastCountry } from "@/lib/jobs/regions";
import { stripTags, toIso, withCountry } from "@/lib/jobs/util";

// Jooble REST API: POST JSON to /api/{key}. Free keys are issued from jooble.org/api/about.
export const joobleEnabled = () => Boolean(process.env.JOOBLE_API_KEY);

export async function searchJooble(keyword: string, city: string, country: MiddleEastCountry, limit: number): Promise<JobCandidate[]> {
  const response = await fetch(`https://jooble.org/api/${encodeURIComponent(process.env.JOOBLE_API_KEY!)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ keywords: keyword, location: city ? `${city}, ${country.name}` : country.name, page: 1 }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${country.name}`);
  const data = await response.json();

  return (data.jobs || []).slice(0, limit).map((item: any): JobCandidate => ({
    source: "jooble",
    sourceJobId: item.id != null ? String(item.id) : null,
    title: stripTags(String(item.title || "Untitled role")),
    company: String(item.company || "Company not listed"),
    location: withCountry(item.location, country),
    description: stripTags(String(item.snippet || "")),
    applyUrl: String(item.link || ""),
    employmentType: item.type ? String(item.type) : null,
    salaryText: item.salary ? String(item.salary) : null,
    postedAt: toIso(item.updated)
  })).filter((job: JobCandidate) => job.applyUrl);
}
