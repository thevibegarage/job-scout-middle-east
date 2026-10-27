import type { JobCandidate } from "@/lib/types";
import type { MiddleEastCountry } from "@/lib/jobs/regions";
import { withCountry } from "@/lib/jobs/util";

// JSearch aggregates Google for Jobs, which indexes Gulf boards and employer career pages.
// Accessed through RapidAPI with a personal key.
const HOST = "jsearch.p.rapidapi.com";

export const jsearchEnabled = () => Boolean(process.env.JSEARCH_API_KEY);

export async function searchJSearch(keyword: string, city: string, country: MiddleEastCountry, limit: number): Promise<JobCandidate[]> {
  const params = new URLSearchParams({
    query: `${keyword} in ${city ? `${city}, ${country.name}` : country.name}`,
    country: country.code.toLowerCase(), page: "1", num_pages: "1"
  });
  const response = await fetch(`https://${HOST}/search?${params.toString()}`, {
    headers: { "X-RapidAPI-Key": process.env.JSEARCH_API_KEY!, "X-RapidAPI-Host": HOST, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${country.name}`);
  const data = await response.json();

  return (data.data || [])
    // Google for Jobs can return neighbouring-country postings; keep only the country searched.
    .filter((item: any) => String(item.job_country || "").toUpperCase() === country.code)
    .slice(0, limit)
    .map((item: any): JobCandidate => {
      const place = [item.job_city, item.job_state].filter(Boolean).join(", ");
      const min = item.job_min_salary, max = item.job_max_salary;
      return {
        source: "jsearch",
        sourceJobId: item.job_id ? String(item.job_id) : null,
        title: String(item.job_title || "Untitled role"),
        company: String(item.employer_name || "Company not listed"),
        location: withCountry(place, country),
        remoteType: item.job_is_remote ? "Remote" : null,
        description: String(item.job_description || ""),
        applyUrl: String(item.job_apply_link || ""),
        employmentType: item.job_employment_type ? String(item.job_employment_type) : null,
        salaryText: min || max ? `${min ?? "?"} - ${max ?? "?"} ${item.job_salary_currency || ""} ${item.job_salary_period ? `per ${String(item.job_salary_period).toLowerCase()}` : ""}`.trim() : null,
        postedAt: item.job_posted_at_datetime_utc || null
      };
    })
    .filter((job: JobCandidate) => job.applyUrl);
}
