import { NextResponse } from "next/server";
import { runJobSearch } from "@/lib/agents/graph";
import { resolveCountries } from "@/lib/jobs/regions";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const keyword = String(body.keyword || "").trim();
    const location = String(body.location || "").trim();
    const country = String(body.country || "ALL").trim();
    if (keyword.length < 2) return NextResponse.json({ error: "Enter a search keyword of at least two characters." }, { status: 400 });
    if (!resolveCountries(country, location)) return NextResponse.json({ error: "Choose a country in the Middle East." }, { status: 400 });

    const client = {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "127.0.0.1",
      userAgent: request.headers.get("user-agent") || "Mozilla/5.0"
    };
    // Feeds the 15% resume-overlap signal in ranking; absent until a resume has been analysed.
    const profile = await prisma.candidateProfile.findUnique({ where: { id: "default" }, select: { resumeText: true } });

    const result = await runJobSearch({ keyword, location, country, resumeText: profile?.resumeText, client });
    const ids = result.discovered.map((job) => job.applyUrl);
    const stored = await prisma.job.findMany({ where: { applyUrl: { in: ids } } });
    const storedByUrl = new Map(stored.map((job) => [job.applyUrl, job]));
    const jobs = result.ranked.map((ranked) => {
      const record = storedByUrl.get(ranked.applyUrl);
      return {
        ...ranked,
        id: record?.id,
        status: record?.status || "SAVED",
        fitScore: record?.fitScore,
        fitSummary: record?.fitSummary,
        strengths: record?.strengths,
        gaps: record?.gaps
      };
    });
    return NextResponse.json({ jobs, source: result.source, providers: result.providers, savedCount: result.savedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job search failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
