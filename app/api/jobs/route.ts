import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const jobs = await prisma.job.findMany({ orderBy: [{ updatedAt: "desc" }], take: 200 });
    return NextResponse.json({ jobs: jobs.map((job) => ({
      ...job,
      postedAt: job.postedAt?.toISOString() || null,
      strengths: Array.isArray(job.strengths) ? job.strengths : [],
      gaps: Array.isArray(job.gaps) ? job.gaps : []
    })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load saved jobs." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { jobId, status } = await request.json();
    const allowed = ["SAVED", "INTERESTED", "APPLIED", "SCREEN", "INTERVIEW", "REJECTED", "OFFER"];
    if (!jobId || !allowed.includes(status)) return NextResponse.json({ error: "Invalid job ID or status." }, { status: 400 });
    const job = await prisma.job.update({ where: { id: String(jobId) }, data: { status } });
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update job status." }, { status: 500 });
  }
}
