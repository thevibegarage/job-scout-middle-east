import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyseFit } from "@/lib/agents/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { jobId } = await request.json();
    if (!jobId) return NextResponse.json({ error: "A job ID is required." }, { status: 400 });
    const [profile, job] = await Promise.all([
      prisma.candidateProfile.findUnique({ where: { id: "default" } }),
      prisma.job.findUnique({ where: { id: String(jobId) } })
    ]);
    if (!profile) return NextResponse.json({ error: "Upload and analyse your resume first." }, { status: 400 });
    if (!job) return NextResponse.json({ error: "Job not found. Run search again to save it." }, { status: 404 });
    const fit = await analyseFit(profile.resumeText, {
      source: job.source, sourceJobId: job.sourceJobId, title: job.title, company: job.company,
      location: job.location, description: job.description, applyUrl: job.applyUrl,
      employmentType: job.employmentType, salaryText: job.salaryText, postedAt: job.postedAt?.toISOString()
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { fitScore: fit.fitScore, fitSummary: fit.summary, strengths: fit.strengths, gaps: fit.gaps }
    });
    return NextResponse.json({ fit });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Fitment analysis failed." }, { status: 500 });
  }
}
