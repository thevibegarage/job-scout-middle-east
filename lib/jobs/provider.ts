import { createHash } from "crypto";
import type { JobCandidate, ProviderStatus, SearchClient } from "@/lib/types";
import { resolveCountries, type MiddleEastCountry } from "@/lib/jobs/regions";
import { careerjetEnabled, searchCareerjet } from "@/lib/jobs/careerjet";
import { joobleEnabled, searchJooble } from "@/lib/jobs/jooble";
import { jsearchEnabled, searchJSearch } from "@/lib/jobs/jsearch";

// Keep a search inside the 60s route limit and the embedding budget: each provider/country
// query contributes a handful of jobs, and the merged list is capped.
const PER_QUERY_LIMIT = 10;
const MAX_RESULTS = 80;

function hashJob(job: Pick<JobCandidate, "title" | "company" | "location" | "applyUrl">) {
  return createHash("sha256")
    .update([job.title, job.company, job.location || "", job.applyUrl].join("|").toLowerCase())
    .digest("hex");
}

export function contentHash(job: Pick<JobCandidate, "title" | "company" | "location" | "applyUrl">) {
  return hashJob(job);
}

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type Query = { provider: string; country: MiddleEastCountry; run: () => Promise<JobCandidate[]> };

/**
 * Searches the Middle East only. Uses whichever of Careerjet, Jooble and JSearch have API keys;
 * with none configured it returns labelled illustrative listings. Does not scrape job boards.
 */
export async function searchJobs(
  keyword: string,
  location: string,
  countryCode: string | undefined,
  client: SearchClient
): Promise<{ jobs: JobCandidate[]; source: string; providers: ProviderStatus[] }> {
  const countries = resolveCountries(countryCode, location);
  if (!countries) throw new Error("Choose a country in the Middle East.");
  // When a city names the country (or a country is picked), the city is passed on as-is.
  const city = location.trim();

  const queries: Query[] = [];
  for (const country of countries) {
    if (careerjetEnabled()) queries.push({ provider: "careerjet", country, run: () => searchCareerjet(keyword, city, country, client, PER_QUERY_LIMIT) });
    if (joobleEnabled()) queries.push({ provider: "jooble", country, run: () => searchJooble(keyword, city, country, PER_QUERY_LIMIT) });
    if (jsearchEnabled()) queries.push({ provider: "jsearch", country, run: () => searchJSearch(keyword, city, country, PER_QUERY_LIMIT) });
  }

  if (!queries.length) {
    const jobs = demoJobs(keyword, countries);
    return { jobs, source: "demo", providers: [{ provider: "demo", ok: true, count: jobs.length }] };
  }

  const settled = await Promise.allSettled(queries.map((query) => query.run()));

  const statuses = new Map<string, ProviderStatus>();
  const lists: { country: string; jobs: JobCandidate[] }[] = [];
  settled.forEach((result, i) => {
    const { provider, country } = queries[i];
    const status = statuses.get(provider) || { provider, ok: true, count: 0 };
    if (result.status === "fulfilled") {
      status.count += result.value.length;
      lists.push({ country: country.code, jobs: result.value });
    } else {
      status.ok = false;
      const reason = result.reason instanceof Error ? result.reason.message : "request failed";
      status.message = status.message ? `${status.message}; ${reason}` : reason;
    }
    statuses.set(provider, status);
  });

  // Round-robin across provider/country lists so the cap never drops a whole country.
  const merged: { job: JobCandidate; country: string }[] = [];
  for (let i = 0; merged.length < MAX_RESULTS * 2; i++) {
    let added = false;
    for (const list of lists) if (list.jobs[i]) { merged.push({ job: list.jobs[i], country: list.country }); added = true; }
    if (!added) break;
  }

  // The same vacancy often appears on several providers; keep the first per title, company and country.
  const seen = new Set<string>();
  const jobs: JobCandidate[] = [];
  for (const { job, country } of merged) {
    const key = `${normalise(job.title)}|${normalise(job.company)}|${country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push(job);
    if (jobs.length >= MAX_RESULTS) break;
  }

  const providers = [...statuses.values()];
  const live = providers.filter((p) => p.count > 0).map((p) => p.provider);
  return { jobs, source: live.length ? live.join(" + ") : "none", providers };
}

const DEMO_NOTE = "DEMO LISTING — not a real vacancy. ";

function demoJobs(keyword: string, countries: MiddleEastCountry[]): JobCandidate[] {
  const demos: (JobCandidate & { country: string })[] = [
    { country: "AE", source: "demo", sourceJobId: "demo-pm-ai-001", title: "Senior Product Manager, AI Platform", company: "Illustrative Company A", location: "Dubai, United Arab Emirates", remoteType: "Hybrid",
      description: `${DEMO_NOTE}Own product strategy for AI-powered customer experiences. Define roadmap, partner with engineering, design, data science and operations. Experience with AI products, experimentation, APIs, customer discovery, metrics, and cross-functional leadership preferred.`,
      applyUrl: "https://example.com/demo-job-1", employmentType: "Full-time", postedAt: new Date().toISOString() },
    { country: "SA", source: "demo", sourceJobId: "demo-pm-growth-002", title: "Group Product Manager, Growth", company: "Illustrative Company B", location: "Riyadh, Saudi Arabia", remoteType: "Hybrid",
      description: `${DEMO_NOTE}Lead a portfolio of growth initiatives, funnel optimisation, retention, experimentation, pricing, and lifecycle engagement. Requires product leadership, analytics, stakeholder management, and measurable business outcomes.`,
      applyUrl: "https://example.com/demo-job-2", employmentType: "Full-time", postedAt: new Date().toISOString() },
    { country: "QA", source: "demo", sourceJobId: "demo-pm-platform-003", title: "Principal Product Manager, Platform APIs", company: "Illustrative Company C", location: "Doha, Qatar", remoteType: "Remote",
      description: `${DEMO_NOTE}Drive platform APIs and developer experience. Partner with software engineering on API strategy, reliability, adoption, developer documentation, platform metrics, and long-term technical roadmap.`,
      applyUrl: "https://example.com/demo-job-3", employmentType: "Full-time", postedAt: new Date().toISOString() },
    { country: "AE", source: "demo", sourceJobId: "demo-pm-marketplace-004", title: "Product Lead, Marketplace", company: "Illustrative Company D", location: "Abu Dhabi, United Arab Emirates", remoteType: "Hybrid",
      description: `${DEMO_NOTE}Own marketplace strategy, supply and demand, customer experience, monetisation, pricing, and operational quality. Use cohort analysis, customer research, experimentation, and cross-functional leadership.`,
      applyUrl: "https://example.com/demo-job-4", employmentType: "Full-time", postedAt: new Date().toISOString() },
    { country: "KW", source: "demo", sourceJobId: "demo-data-005", title: "Senior Data Analyst, Customer Insights", company: "Illustrative Company E", location: "Kuwait City, Kuwait", remoteType: "On-site",
      description: `${DEMO_NOTE}Turn customer and transaction data into decisions. Build dashboards, run cohort and funnel analysis, and partner with product and marketing on experimentation. SQL, Python and a BI tool expected.`,
      applyUrl: "https://example.com/demo-job-5", employmentType: "Full-time", postedAt: new Date().toISOString() },
    { country: "BH", source: "demo", sourceJobId: "demo-eng-006", title: "Engineering Manager, Payments", company: "Illustrative Company F", location: "Manama, Bahrain", remoteType: "Hybrid",
      description: `${DEMO_NOTE}Lead a team building payment APIs and settlement systems. Own reliability, security reviews, delivery planning and hiring. Experience with distributed systems and financial services regulation preferred.`,
      applyUrl: "https://example.com/demo-job-6", employmentType: "Full-time", postedAt: new Date().toISOString() }
  ];
  const codes = new Set(countries.map((country) => country.code));
  const inRegion = demos.filter((job) => codes.has(job.country));
  const tokens = keyword.toLowerCase().split(/\W+/).filter(Boolean);
  const matching = inRegion.filter((job) => tokens.length === 0 || tokens.some((token) => `${job.title} ${job.description}`.toLowerCase().includes(token)));
  return (matching.length ? matching : inRegion).map(({ country: _country, ...job }) => job);
}
