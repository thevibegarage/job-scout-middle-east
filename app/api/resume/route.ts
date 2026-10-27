import { NextResponse } from "next/server";
import pdf from "pdf-parse";
import { prisma } from "@/lib/db";
import { analyzeResume } from "@/lib/agents/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY is required for resume analysis." }, { status: 500 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")) {
      return NextResponse.json({ error: "Upload a PDF resume." }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Keep the resume PDF under 8 MB." }, { status: 413 });
    const parsed = await pdf(Buffer.from(await file.arrayBuffer()));
    const resumeText = String(parsed.text || "").trim();
    if (resumeText.length < 50) return NextResponse.json({ error: "Not enough text could be extracted. Scanned PDFs need OCR, which this version does not include." }, { status: 422 });
    const analysis = await analyzeResume(resumeText);
    await prisma.candidateProfile.upsert({
      where: { id: "default" },
      create: { id: "default", fileName: file.name, resumeText, profileJson: analysis, strengths: analysis.strengths, gaps: analysis.gaps, summary: analysis.summary },
      update: { fileName: file.name, resumeText, profileJson: analysis, strengths: analysis.strengths, gaps: analysis.gaps, summary: analysis.summary }
    });
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resume analysis failed." }, { status: 500 });
  }
}
