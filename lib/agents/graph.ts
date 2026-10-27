import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { prisma } from "@/lib/db";
import { contentHash, searchJobs } from "@/lib/jobs/provider";
import { rankJobs } from "@/lib/agents/scoring";
import type { JobCandidate, ProviderStatus, RankedJob, SearchClient } from "@/lib/types";

const SearchState = Annotation.Root({
  keyword: Annotation<string>(),
  location: Annotation<string>(),
  country: Annotation<string>(),
  client: Annotation<SearchClient>(),
  resumeText: Annotation<string>(),
  source: Annotation<string>(),
  providers: Annotation<ProviderStatus[]>(),
  discovered: Annotation<JobCandidate[]>(),
  savedCount: Annotation<number>(),
  ranked: Annotation<RankedJob[]>(),
  error: Annotation<string>()
});

async function searchNode(state: typeof SearchState.State) {
  const result = await searchJobs(state.keyword, state.location, state.country, state.client);
  return { discovered: result.jobs, source: result.source, providers: result.providers };
}

async function persistNode(state: typeof SearchState.State) {
  let savedCount = 0;
  // Upsert in small parallel batches: a search can return dozens of jobs and a hosted
  // database round trip per row would otherwise dominate the request time.
  for (let start = 0; start < state.discovered.length; start += 10) {
    await Promise.all(state.discovered.slice(start, start + 10).map(async (job) => {
      const hash = contentHash(job);
      const postedAt = job.postedAt ? new Date(job.postedAt) : null;
      const safePostedAt = postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null;
      await prisma.job.upsert({
        where: { contentHash: hash },
        create: {
          ...job,
          contentHash: hash,
          postedAt: safePostedAt,
          lastSeenAt: new Date(),
          searchKeyword: state.keyword
        },
        update: {
          title: job.title,
          description: job.description,
          applyUrl: job.applyUrl,
          lastSeenAt: new Date(),
          searchKeyword: state.keyword
        }
      });
      savedCount++;
    }));
  }
  await prisma.searchRun.create({
    data: { keyword: state.keyword, location: state.location || null, source: state.source, resultCount: state.discovered.length }
  });
  return { savedCount };
}

async function rankNode(state: typeof SearchState.State) {
  const ranked = await rankJobs(state.keyword, state.discovered, state.resumeText);
  return { ranked };
}

export function createJobSearchGraph() {
  return new StateGraph(SearchState)
    .addNode("search", searchNode)
    .addNode("persist", persistNode)
    .addNode("rank", rankNode)
    .addEdge(START, "search")
    .addEdge("search", "persist")
    .addEdge("persist", "rank")
    .addEdge("rank", END)
    .compile();
}

export async function runJobSearch(input: { keyword: string; location?: string; country?: string; resumeText?: string; client: SearchClient }) {
  const graph = createJobSearchGraph();
  return graph.invoke({
    keyword: input.keyword,
    location: input.location || "",
    country: input.country || "ALL",
    client: input.client,
    resumeText: input.resumeText || "",
    source: "",
    providers: [],
    discovered: [],
    savedCount: 0,
    ranked: [],
    error: ""
  });
}
