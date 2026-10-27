import type { JobCandidate, SearchClient } from "@/lib/types";
import type { MiddleEastCountry } from "@/lib/jobs/regions";
import { stripTags, toIso, withCountry } from "@/lib/jobs/util";

// Careerjet Search API v4: GET with HTTP basic auth (API key as username, empty password).
// It requires the end user's IP and user agent on every call.
const ENDPOINT = "https://search.api.careerjet.net/v4/query";

export const careerjetEnabled = () => Boolean(process.env.CAREERJET_API_KEY);

export async function searchCareerjet(keyword: string, city: string, country: MiddleEastCountry, client: SearchClient, limit: number): Promise<JobCandidate[]> {
  // Careerjet has no site for this country; skip rather than send an unsupported locale (HTTP 400).
  if (!country.careerjetLocale) return [];
  const auth = Buffer.from(`${process.env.CAREERJET_API_KEY}:`).toString("base64");

  async function run(location: string) {
    const params = new URLSearchParams({
      locale_code: country.careerjetLocale!, keywords: keyword, page_size: String(limit),
      sort: "relevance", user_ip: client.ip, user_agent: client.userAgent
    });
    if (location) params.set("location", location);
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Basic ${auth}` }, cache: "no-store", signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${country.name}`);
    return response.json();
  }

  let data = await run(city);
  // An unrecognised city comes back as a location list rather than jobs; retry country-wide.
  if (data.type === "LOCATIONS" && city) data = await run("");
  if (data.type !== "JOBS") return [];

  return (data.jobs || []).slice(0, limit).map((item: any): JobCandidate => ({
    source: "careerjet",
    sourceJobId: null,
    title: String(item.title || "Untitled role"),
    company: String(item.company || "Company not listed"),
    location: withCountry(item.locations, country),
    description: stripTags(String(item.description || "")),
    applyUrl: String(item.url || ""),
    salaryText: item.salary ? String(item.salary) : null,
    postedAt: toIso(item.date)
  })).filter((job: JobCandidate) => job.applyUrl);
}
