import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import type { JobCandidate, RankedJob } from "@/lib/types";

const embeddingModel = () => new OpenAIEmbeddings({ model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small" });

function cosine(a: number[], b: number[]) {
  if (!a.length || !b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function tokens(text: string) {
  return new Set((text.toLowerCase().match(/[a-z0-9+#.]+/g) || []).filter((x) => x.length > 1));
}

function lexicalScore(query: string, job: JobCandidate) {
  const queryTokens = tokens(query);
  const titleTokens = tokens(job.title);
  const bodyTokens = tokens(`${job.company} ${job.description} ${job.location || ""}`);
  if (!queryTokens.size) return 0;
  let titleMatches = 0, bodyMatches = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) titleMatches++;
    if (bodyTokens.has(token)) bodyMatches++;
  }
  // Title matches carry more weight than generic mentions in the description.
  return Math.min(1, (titleMatches / queryTokens.size) * 0.7 + (bodyMatches / queryTokens.size) * 0.3);
}

function recencyScore(postedAt?: string | null) {
  if (!postedAt) return 0.35;
  const ageDays = Math.max(0, (Date.now() - new Date(postedAt).getTime()) / 86400000);
  if (!Number.isFinite(ageDays)) return 0.35;
  return Math.exp(-ageDays / 30);
}

function profileOverlap(profileText: string, job: JobCandidate) {
  if (!profileText.trim()) return 0;
  const profile = tokens(profileText);
  const jobTokens = tokens(`${job.title} ${job.description}`);
  if (!jobTokens.size) return 0;
  let overlap = 0;
  for (const token of jobTokens) if (profile.has(token)) overlap++;
  return Math.min(1, overlap / Math.max(1, Math.min(jobTokens.size, 40)));
}

export async function rankJobs(query: string, jobs: JobCandidate[], profileText = ""): Promise<RankedJob[]> {
  if (!jobs.length) return [];
  if (!process.env.OPENAI_API_KEY) {
    return jobs.map((job) => {
      const lex = lexicalScore(query, job);
      const rec = recencyScore(job.postedAt);
      const prof = profileOverlap(profileText, job);
      return { ...job, semanticScore: 0, lexicalScore: lex, recencyScore: rec, profileScore: prof, finalScore: 0.65 * lex + 0.2 * prof + 0.15 * rec, scoreExplanation: ["Keyword matching only: add OPENAI_API_KEY to enable semantic embeddings."] };
    }).sort((a, b) => b.finalScore - a.finalScore);
  }

  const embeddings = embeddingModel();
  const texts = jobs.map((job) => `${job.title}\n${job.company}\n${job.location || ""}\n${job.description}`);
  const [queryVector, jobVectors] = await Promise.all([
    embeddings.embedQuery(query),
    embeddings.embedDocuments(texts)
  ]);

  return jobs.map((job, i) => {
    const sem = Math.max(0, cosine(queryVector, jobVectors[i]));
    const lex = lexicalScore(query, job);
    const rec = recencyScore(job.postedAt);
    const prof = profileOverlap(profileText, job);
    // Weighted hybrid ranking: semantic relevance is primary; lexical exactness,
    // profile overlap and recency are supporting signals.
    const finalScore = 0.55 * sem + 0.25 * lex + 0.15 * prof + 0.05 * rec;
    return {
      ...job, semanticScore: sem, lexicalScore: lex, recencyScore: rec, profileScore: prof,
      finalScore: Math.min(1, finalScore),
      scoreExplanation: [
        `Semantic similarity: ${(sem * 100).toFixed(0)}% (55% weight)`,
        `Keyword/title overlap: ${(lex * 100).toFixed(0)}% (25% weight)`,
        `Resume/profile overlap: ${(prof * 100).toFixed(0)}% (15% weight)`,
        `Recency signal: ${(rec * 100).toFixed(0)}% (5% weight)`
      ]
    };
  }).sort((a, b) => b.finalScore - a.finalScore);
}

export async function analyzeResume(resumeText: string) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Add OPENAI_API_KEY to generate AI resume analysis.");
  const model = new ChatOpenAI({ model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini", temperature: 0.1 });
  const result = await model.invoke([
    { role: "system", content: `You are a rigorous career analyst. Analyse only the resume content supplied. Do not invent achievements, skills, metrics, employers, or qualifications. Identify evidence-backed strengths, gaps/weaknesses, target role families, skills, seniority, and a concise summary. Distinguish missing evidence from proof that the candidate lacks a skill. Return valid JSON only with keys: summary (string), strengths (string array), gaps (string array), targetRoles (string array), skills (string array), seniority (string).` },
    { role: "user", content: resumeText.slice(0, 24000) }
  ]);
  const raw = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export async function analyseFit(resumeText: string, job: JobCandidate) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Add OPENAI_API_KEY to generate AI fitment analysis.");
  const model = new ChatOpenAI({ model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini", temperature: 0.1 });
  const result = await model.invoke([
    { role: "system", content: `You are a careful recruitment-fit analyst. Compare the resume with the job description. Score only evidence-based fit, not protected characteristics. Never invent resume evidence. Explicitly separate demonstrated strengths, gaps or missing evidence, and suggested interview/application positioning. Treat the score as decision support, not a hiring decision. Return valid JSON only with keys: fitScore (integer 0-100), summary (string), strengths (string array), gaps (string array), keywordsToSurface (string array), questionsToValidate (string array).` },
    { role: "user", content: `RESUME:\n${resumeText.slice(0, 18000)}\n\nJOB TITLE: ${job.title}\nCOMPANY: ${job.company}\nLOCATION: ${job.location || "Not specified"}\nJOB DESCRIPTION:\n${job.description.slice(0, 16000)}` }
  ]);
  const raw = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
  return JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}
