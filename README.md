# Job Scout — Middle East Multi-Agent Job Search

A Next.js app for the Middle East job market that combines job discovery, PostgreSQL persistence, hybrid job ranking, resume profile analysis, job-specific fitment analysis, LangGraph orchestration, LangChain model integrations, and optional LangSmith tracing.

## What is included

- Search jobs by keyword, country and city across the Middle East only: UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, Egypt and Jordan. Requests for any other country are rejected.
- Queries Careerjet, Jooble and JSearch in parallel for each country (whichever have keys), removes duplicates across sources, and reports any source that failed. Without keys, the app uses clearly labelled **illustrative demo listings**, not fabricated live vacancies.
- Saves/upserts jobs and search history in PostgreSQL.
- Hybrid ranking with semantic embeddings, keyword/title matching, resume/profile overlap, and recency.
- PDF resume upload and evidence-based strengths/gaps analysis.
- Per-job resume fitment analysis, strengths, gaps, and keywords to surface.
- Application status tracking.
- LangGraph search workflow and LangChain model integrations.
- Optional LangSmith tracing via environment variables.
- UI built on the IIM L design system (tokens in `app/tokens.css`, `iim-` components in `app/iim.css`), with light and dark themes.
- Next.js app suitable for GitHub + Vercel deployment.

## Important: secure the prototype before public use

This is a single-user prototype, not a production-ready multi-tenant service. It has no login or authorization. Do **not** deploy it publicly with a real resume or personal data until authentication, per-user data isolation, rate limiting, upload controls, and a privacy/retention policy are added. Any visitor who can reach the API could otherwise access or modify shared saved-job/profile data. Use test data during demos.

## Requirements

- Node.js 20+
- PostgreSQL database (Neon, Supabase, or Vercel Postgres)
- OpenAI API key for semantic embeddings and LLM analyses
- At least one Middle East job source key for real listings (see below)

## Run locally

1. Unzip and open this folder in VS Code.
2. In the integrated terminal:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local`.
4. Configure at minimum:

   ```text
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
   OPENAI_API_KEY="your-key"
   ```

5. To retrieve real job listings, set one or more source keys:

   ```text
   CAREERJET_API_KEY="your-careerjet-key"
   JOOBLE_API_KEY="your-jooble-key"
   JSEARCH_API_KEY="your-rapidapi-key"
   ```

   See [Middle East job sources](#middle-east-job-sources) for coverage and sign-up. The app deliberately does not scrape LinkedIn, Indeed, Bayt or Naukrigulf.

6. Optional LangSmith observability:

   ```text
   LANGSMITH_TRACING=true
   LANGSMITH_API_KEY="your-langsmith-key"
   LANGSMITH_PROJECT="job-scout-multi-agent"
   ```

   LangChain can automatically emit traces when these variables are set. Keep API keys server-side.

7. Create/update the database schema:

   ```bash
   npx prisma generate
   npx prisma db push
   ```

8. Run:

   ```bash
   npm run dev
   ```

9. Open `http://localhost:3000`.

## GitHub and Vercel deployment

1. Create an empty GitHub repository.
2. From the project folder:

   ```bash
   git init
   git add .
   git commit -m "Build Job Scout multi-agent portal"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

3. Import the GitHub repository into Vercel.
4. Configure `DATABASE_URL`, `OPENAI_API_KEY`, and any optional provider/observability variables in Vercel Project Settings → Environment Variables.
5. Ensure the database schema is applied with `npx prisma db push` from a trusted environment before first use. For a team/production environment, replace `db push` with reviewed Prisma migrations.
6. Deploy.

Do not commit `.env.local`.

## Middle East job sources

Adzuna, the source in earlier versions, covers no Middle East country, so it was replaced with these official APIs:

| Source | Countries | Key | Notes |
|---|---|---|---|
| [Careerjet](https://www.careerjet.com/partners/api) | UAE, Saudi Arabia, Qatar, Kuwait, Oman | Free partner key | API v4. Sends the visitor's IP and user agent, which Careerjet requires. Bahrain, Egypt and Jordan have no Careerjet locale and are skipped. |
| [Jooble](https://jooble.org/api/about) | All 8 | Free key by request | Searched with "city, country" as the location. |
| [JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) | All 8 | RapidAPI key (free tier, then paid) | Google for Jobs aggregate, which indexes Gulf boards and employer career pages. Postings outside the searched country are dropped. |

How a search fans out (`lib/jobs/provider.ts`):

- "All Middle East" queries every supported country for every configured source. A city in the location box narrows it to that country (for example "Riyadh" → Saudi Arabia).
- Each source and country contributes up to 10 jobs. Results are interleaved across countries, de-duplicated by title, company and country, and capped at 80.
- One failing source (bad key, rate limit) is reported in the UI as an error; the others still return.
- Fan-out costs quota: "All Middle East" with all three keys is up to 21 API calls per search. Pick a country to use fewer.

Considered and not used: [JobSpy](https://github.com/speedyapply/JobSpy) covers Bayt and Middle East Indeed, but it scrapes those sites (against their terms), is Python, and does not run on Vercel's Node runtime. Hosted scraper services for Bayt and GulfTalent exist but have the same terms problem.

The Jooble and JSearch adapters follow their published request and response formats. They were tested against recorded response shapes, not live calls, so confirm them with a real key before relying on them.

## Retrieval mechanics: why hybrid ranking?

The ranking implementation combines four signals:

| Signal | Weight | Purpose |
|---|---:|---|
| Semantic cosine similarity | 55% | Finds conceptually relevant jobs even when wording differs |
| Keyword/title overlap | 25% | Preserves exact role/skill matches and rewards title relevance |
| Resume/profile overlap | 15% | Gives a small boost to jobs whose vocabulary overlaps the candidate's resume |
| Recency | 5% | Helps newer listings without letting recency dominate relevance |

The weights are transparent starter heuristics, not universal constants. Evaluate them against a labelled set of queries and relevant jobs before treating the ranking as production-quality.

### Why not pure keyword search?

A keyword-only search misses semantic matches. For example, “customer retention” may be relevant to “lifecycle growth” even if the exact phrase is absent. Embeddings can capture some of that conceptual similarity.

### Why not pure vector search?

Pure vector search may rank a broadly related job above one with an exact title or skill match. A lexical component helps preserve exact-match precision. The resume-overlap and recency signals are modest tie-breakers.

### Is this BM25?

No. This V1 uses a transparent token-overlap score, not BM25. For a larger production corpus, consider PostgreSQL full-text search with `tsvector`/`tsquery` and `ts_rank_cd`, combine it with vector retrieval (pgvector or an external vector store), and use reciprocal rank fusion (RRF) to combine the two ranked lists. This project stores embeddings in JSON for simplicity; it computes query-to-job embedding similarities in application code and is intended for a small prototype, not a large corpus.

## Agent architecture

```text
User keyword + Middle East country / city
          |
          v
    LangGraph workflow
          |
    Search Agent / node
    (Careerjet + Jooble + JSearch, or labelled demo provider)
          |
          v
  Persistence Agent / node
  (PostgreSQL upsert + search history)
          |
          v
    Ranking Agent / node
  (semantic + lexical + profile + recency)
          |
          v
  Ranked opportunities in UI
          |
          +---- Resume Analyst
          |     PDF text extraction → strengths/gaps/skills/targets → PostgreSQL
          |
          +---- Fitment Analyst
                Resume + selected JD → structured fit score, evidence-backed strengths,
                gaps/missing evidence, keywords to surface, validation questions
```

The search workflow is explicitly orchestrated with LangGraph. Resume and fitment analyses are separate model-powered workflows in V1; they can be added as nodes in a larger graph when you want a single end-to-end orchestrated run.

## LangSmith observability

Set `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, and `LANGSMITH_PROJECT`. LangChain model calls can then be traced. Check traces in LangSmith to inspect latency, inputs/outputs, and errors. Avoid sending sensitive resume data to an observability workspace unless your privacy controls and retention settings permit it; use synthetic resumes while teaching.

## Known V1 limitations

- Coverage is limited to the 8 listed countries, and varies by source (Careerjet covers 5).
- Without any source key, results are illustrative and visibly labelled demo data.
- No authentication or multi-user isolation yet.
- Resume PDF parsing extracts text only; scanned/image-only PDFs need OCR.
- Resume text and extracted profile are persisted in PostgreSQL.
- The hybrid score weights need evaluation and tuning against real relevance judgements.
- No application automation: the user must review the job and apply through the external listing.
- The ranking path embeds discovered jobs per search. For scale, precompute and store embeddings when ingesting jobs and use pgvector or another vector index.
- The `Job.embedding` JSON field is reserved for a future persistent vector index; current scoring computes embeddings on demand.
- AI fitment scores are decision-support estimates, not guarantees of interview success or a substitute for human judgement.

## Suggested next improvements

1. Add authentication and per-user data ownership.
2. Add employer career-site feeds (Greenhouse, Lever, Workable) for Gulf employers, and more countries where a permitted source covers them.
3. Persist job embeddings and use pgvector for efficient semantic retrieval.
4. Replace the token-overlap score with PostgreSQL full-text search / BM25-like ranking and combine rankings using Reciprocal Rank Fusion.
5. Build offline evaluation: labelled query/job pairs, Recall@K, Precision@K, nDCG@K, and fitment-review agreement.
6. Add human-reviewed resume tailoring and application tracking workflows.
7. Add rate limits, provider quotas, retry/backoff, audit logs, and retention controls.
