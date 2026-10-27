"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Search, Upload, ExternalLink, Sparkles, Check, Minus, AlertCircle, FileText, Database } from "lucide-react";
import { ALL_COUNTRIES, MIDDLE_EAST } from "@/lib/jobs/regions";

type Job = {
  id: string; title: string; company: string; location: string | null; description: string; applyUrl: string;
  source: string; postedAt: string | null; status: string; remoteType?: string | null; salaryText?: string | null;
  finalScore?: number; scoreExplanation?: string[];
  fitScore?: number | null; fitSummary?: string | null; strengths?: string[]; gaps?: string[];
  keywordsToSurface?: string[]; questionsToValidate?: string[];
};
type Analysis = { summary: string; strengths: string[]; gaps: string[]; targetRoles: string[]; skills: string[]; seniority: string };
type ProviderStatus = { provider: string; ok: boolean; count: number; message?: string };
type Tab = "search" | "saved" | "resume";
type Notice = { kind: "info" | "busy" | "error"; text: string };

const STATUSES = [
  ["SAVED", "Saved"], ["INTERESTED", "Interested"], ["APPLIED", "Applied"], ["SCREEN", "Recruiter screen"],
  ["INTERVIEW", "Interview"], ["REJECTED", "Rejected"], ["OFFER", "Offer"]
] as const;
const SOURCE_NAMES: Record<string, string> = { careerjet: "Careerjet", jooble: "Jooble", jsearch: "JSearch", demo: "Demo data" };
const sourceName = (source: string) => SOURCE_NAMES[source] || source;
const statusName = (status: string) => STATUSES.find(([value]) => value === status)?.[1] || status;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const countryOf = (location: string | null) => (location || "").split(",").pop()?.trim() || "";

export default function Home() {
  const [keyword, setKeyword] = useState("Senior product manager");
  const [country, setCountry] = useState(ALL_COUNTRIES);
  const [city, setCity] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [saved, setSaved] = useState<Job[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [resumeName, setResumeName] = useState("");
  const [resumeAnalysis, setResumeAnalysis] = useState<Analysis | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [expandedFit, setExpandedFit] = useState<string | null>(null);

  async function loadSaved() {
    try { const r = await fetch("/api/jobs"); const d = await r.json(); if (r.ok) setSaved(d.jobs || []); } catch {}
  }
  useEffect(() => { loadSaved(); }, []);

  const fail = (e: unknown, fallback: string) => setNotice({ kind: "error", text: e instanceof Error ? e.message : fallback });

  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (!keyword.trim()) return;
    setBusy(true); setNotice({ kind: "busy", text: "Searching sources, saving results and ranking them." });
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword, location: city, country }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");
      setJobs(data.jobs || []); setProviders(data.providers || []);
      setNotice({ kind: "info", text: `${data.jobs?.length || 0} roles found and ${data.savedCount || 0} saved or updated in your database.` });
      await loadSaved();
    } catch (e) { fail(e, "Search failed"); }
    finally { setBusy(false); }
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setResumeName(file.name); setNotice({ kind: "busy", text: "Reading your resume and analysing it." });
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/resume", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Resume analysis failed");
      setResumeAnalysis(data.analysis);
      setNotice({ kind: "info", text: "Resume analysed and saved. Searches now rank roles against it." });
    } catch (e) { fail(e, "Resume upload failed"); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function fitJob(job: Job) {
    setBusy(true); setExpandedFit(job.id); setNotice({ kind: "busy", text: `Comparing your resume with ${job.title}.` });
    try {
      const response = await fetch("/api/fit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Fitment analysis failed");
      // The API names the narrative "summary"; rows store it as "fitSummary".
      const { summary, ...rest } = data.fit;
      const merge = (j: Job) => j.id === job.id ? { ...j, ...rest, fitSummary: summary } : j;
      setJobs((old) => old.map(merge)); setSaved((old) => old.map(merge));
      setNotice({ kind: "info", text: "Fit analysis complete." });
    } catch (e) { fail(e, "Fit analysis failed"); }
    finally { setBusy(false); }
  }

  async function updateStatus(jobId: string, nextStatus: string) {
    const response = await fetch("/api/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, status: nextStatus }) });
    if (response.ok) { await loadSaved(); setJobs((old) => old.map((j) => j.id === jobId ? { ...j, status: nextStatus } : j)); }
    else setNotice({ kind: "error", text: "Could not update the status." });
  }

  const best = jobs.length ? Math.round(Math.max(...jobs.map((j) => j.finalScore || 0)) * 100) : 0;
  const countryCount = new Set(jobs.map((j) => countryOf(j.location)).filter(Boolean)).size;
  const liveSources = providers.filter((p) => p.count > 0).map((p) => sourceName(p.provider));

  // A render function rather than a nested component, so rows keep their open/focus state across renders.
  function renderJob(job: Job, rank?: number) {
    const score = rank != null ? Math.round((job.finalScore || 0) * 100) : job.fitScore;
    return <li className="jobRow" key={job.id || job.applyUrl}>
      <div className="jobRank"><span className="iim-badge iim-badge--flat">{rank != null ? `Rank ${rank}` : statusName(job.status)}</span></div>
      <div className="jobMain">
        <div>
          <h3 className="headingSm">{job.title}</h3>
          <p className="jobMeta">{job.company} · {job.location || "Location not listed"}</p>
        </div>
        <p className="jobDesc">{job.description}</p>
        <div className="chipRow">
          <span className="iim-chip">{sourceName(job.source)}</span>
          {job.postedAt && <span className="iim-chip">Posted {formatDate(job.postedAt)}</span>}
          {job.remoteType && <span className="iim-chip">{job.remoteType}</span>}
          {job.salaryText && <span className="iim-chip">{job.salaryText}</span>}
          {job.fitScore != null && <span className="iim-chip iim-chip--selected">Resume fit {job.fitScore}%</span>}
        </div>
        {job.scoreExplanation && <details className="why"><summary>Why this ranking</summary><ul>{job.scoreExplanation.map((line) => <li key={line}>{line}</li>)}</ul></details>}
        {expandedFit === job.id && job.fitSummary && <div className="fitPanel">
          <div className="fitHead"><span className="eyebrow">Resume fit</span><span className="fitScore">{job.fitScore}<small>%</small></span></div>
          <p className="bodySm">{job.fitSummary}</p>
          <div className="fitColumns">
            <div className="strengths"><h4><Check size={18} aria-hidden /> Strengths</h4><ul>{(job.strengths || []).map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><h4><Minus size={18} aria-hidden /> Gaps and missing evidence</h4><ul>{(job.gaps || []).map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          {!!job.keywordsToSurface?.length && <div className="chipRow" aria-label="Keywords to surface">{job.keywordsToSurface.map((k) => <span className="iim-chip" key={k}>{k}</span>)}</div>}
          {!!job.questionsToValidate?.length && <div><h4 className="bodySm"><strong>Questions to validate</strong></h4><ul>{job.questionsToValidate.map((q) => <li className="bodySm" key={q}>{q}</li>)}</ul></div>}
        </div>}
        <div className="rowActions">
          <a className="iim-btn iim-btn--ghost" href={job.applyUrl} target="_blank" rel="noreferrer">View job <ExternalLink size={16} aria-hidden /></a>
          <button className="iim-btn iim-btn--night" onClick={() => fitJob(job)} disabled={busy}><Sparkles size={16} aria-hidden /> Analyse resume fit</button>
          <select className="iim-input" value={job.status || "SAVED"} onChange={(e) => updateStatus(job.id, e.target.value)} aria-label={`Application status for ${job.title}`}>
            {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      {score != null && <div className="score"><span className="score__value">{score}<small>%</small></span><span className="score__label">{rank != null ? "match" : "fit"}</span></div>}
    </li>;
  }

  return <>
    <a className="iim-btn iim-btn--gold skipLink" href="#content">Skip to content</a>
    <header className="siteHeader"><div className="siteHeader__inner">
      <p className="headingMd">Job Scout</p>
      <nav className="nav" aria-label="Sections">
        <button className={`iim-chip ${activeTab === "search" ? "iim-chip--selected" : ""}`} aria-pressed={activeTab === "search"} onClick={() => setActiveTab("search")}>Job search {jobs.length > 0 && <b>{jobs.length}</b>}</button>
        <button className={`iim-chip ${activeTab === "saved" ? "iim-chip--selected" : ""}`} aria-pressed={activeTab === "saved"} onClick={() => setActiveTab("saved")}>Saved jobs {saved.length > 0 && <b>{saved.length}</b>}</button>
        <button className={`iim-chip ${activeTab === "resume" ? "iim-chip--selected" : ""}`} aria-pressed={activeTab === "resume"} onClick={() => setActiveTab("resume")}>Resume insights</button>
      </nav>
    </div></header>

    <main className="page" id="content">
      {notice && <div className={`notice ${notice.kind === "error" ? "notice--error" : ""}`} role={notice.kind === "error" ? "alert" : "status"}>
        {notice.kind === "busy" ? <span className="spinner" aria-hidden /> : notice.kind === "error" ? <AlertCircle size={18} aria-hidden /> : <Check size={18} aria-hidden />}
        <span>{notice.kind === "error" && <strong>Error: </strong>}{notice.text}</span>
      </div>}

      {activeTab === "search" && <>
        <section className="iim-banner" aria-labelledby="hero">
          <h1 className="iim-banner__title" id="hero">Find your<br />next role</h1>
          <p className="iim-banner__body">Search jobs across the Middle East from several sources, then rank them against your resume.</p>
          <div className="iim-banner__actions"><button className="iim-btn iim-btn--gold" onClick={() => setActiveTab("resume")}>Upload your resume</button></div>
          <div className="iim-pillars iim-pillars--on-brick" style={{ ["--pillar-h" as string]: "96px" }} aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
        </section>

        <form className="panel searchPanel" onSubmit={search}>
          <div className="searchForm">
            <div className="iim-field"><label className="iim-field__label" htmlFor="keyword">Role or keywords</label><input id="keyword" className="iim-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Senior product manager" /></div>
            <div className="iim-field"><label className="iim-field__label" htmlFor="country">Country</label><select id="country" className="iim-input" value={country} onChange={(e) => setCountry(e.target.value)}><option value={ALL_COUNTRIES}>All Middle East</option>{MIDDLE_EAST.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
            <div className="iim-field"><label className="iim-field__label" htmlFor="city">City (optional)</label><input id="city" className="iim-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dubai, Riyadh, Doha" /></div>
            <button className="iim-btn" disabled={busy}><Search size={18} aria-hidden /> {busy ? "Searching" : "Search jobs"}</button>
          </div>
          <div className="flow" aria-label="How a search runs"><span className="iim-chip">1 Search agent</span><span className="iim-chip">2 Persistence agent</span><span className="iim-chip">3 Ranking agent</span><span className="iim-chip">4 Fitment agent</span></div>
        </form>

        {jobs.length > 0 && <>
          <section className="statRow" aria-label="Search summary">
            <div className="iim-stat iim-stat--md"><p className="iim-stat__value">{jobs.length}</p><p className="iim-stat__label">roles found</p><p className="iim-stat__source">{liveSources.length ? `From ${liveSources.join(", ")}` : "From the built-in demo listings"}</p></div>
            <div className="iim-stat iim-stat--md iim-stat--ink"><p className="iim-stat__value">{best}<small>%</small></p><p className="iim-stat__label">best match</p><p className="iim-stat__source">Hybrid relevance score from this search</p></div>
            <div className="iim-stat iim-stat--md iim-stat--ink"><p className="iim-stat__value">{countryCount}</p><p className="iim-stat__label">{countryCount === 1 ? "country" : "countries"}</p><p className="iim-stat__source">Counted from the locations returned</p></div>
          </section>
          <div className="sources" aria-label="Sources searched">
            {providers.map((p) => p.ok
              ? <span className="iim-chip" key={p.provider}>{sourceName(p.provider)} · {p.count}</span>
              : <span className="sourceError" key={p.provider}>Error: {sourceName(p.provider)} failed ({p.message})</span>)}
          </div>
        </>}

        <div className="sectionHead"><div><h2 className="headingLg">Ranked opportunities</h2><p className="bodySm muted">{jobs.length ? `${jobs.length} roles sorted by hybrid relevance score.` : "Run a search to see matching roles."}</p></div></div>
        {jobs.length > 0
          ? <ul className="jobList">{jobs.map((job, i) => renderJob(job, i + 1))}</ul>
          : <div className="empty"><Search size={24} aria-hidden /><h3 className="headingSm">Search to see ranked roles</h3><p className="bodySm muted">Enter a role and choose a country. Add a Careerjet, Jooble or JSearch key to retrieve live listings; without a key, the app shows clearly labelled demo listings.</p></div>}
      </>}

      {activeTab === "saved" && <>
        <div className="pageHead"><span className="eyebrow">Library</span><h1 className="displayLg">Saved jobs</h1><p className="bodyLg">Roles stored in your database. Update the status as your application moves forward.</p></div>
        {saved.length > 0
          ? <ul className="jobList">{saved.map((job) => renderJob(job))}</ul>
          : <div className="empty"><Database size={24} aria-hidden /><h3 className="headingSm">No saved jobs yet</h3><p className="bodySm muted">Every search saves its results here.</p></div>}
      </>}

      {activeTab === "resume" && <>
        <div className="pageHead"><span className="eyebrow">Profile</span><h1 className="displayLg">Resume insights</h1><p className="bodyLg">Upload a PDF to see strengths, gaps and target roles, each backed by evidence from your resume.</p></div>
        <div className="panel uploadPanel">
          <div><h2 className="headingSm">Upload your resume</h2><p className="bodySm muted">PDF only, up to 8 MB. Scanned PDFs need text; this version has no OCR.</p>{resumeName && <p className="fileName">{resumeName}</p>}</div>
          <label className="iim-btn uploadBtn"><Upload size={18} aria-hidden /> Choose PDF<input type="file" accept=".pdf,application/pdf" onChange={uploadResume} disabled={busy} /></label>
        </div>
        {resumeAnalysis
          ? <>
            <section className="nightPanel" aria-label="Profile summary">
              <span className="iim-badge">{resumeAnalysis.seniority || "Seniority not determined"}</span>
              <h2 className="headingMd">Profile summary</h2>
              <p className="bodyLg">{resumeAnalysis.summary}</p>
            </section>
            <div className="insightGrid">
              <div className="insightCard good"><h3 className="headingSm">Evidence-backed strengths</h3><ul>{resumeAnalysis.strengths?.map((s) => <li key={s}><Check size={18} aria-hidden /><span>{s}</span></li>)}</ul></div>
              <div className="insightCard"><h3 className="headingSm">Gaps or missing evidence</h3><ul>{resumeAnalysis.gaps?.map((s) => <li key={s}><Minus size={18} aria-hidden /><span>{s}</span></li>)}</ul></div>
              <div className="insightCard"><h3 className="headingSm">Skills identified</h3><div className="chipRow">{resumeAnalysis.skills?.map((s) => <span className="iim-chip" key={s}>{s}</span>)}</div></div>
              <div className="insightCard"><h3 className="headingSm">Potential target roles</h3><div className="chipRow">{resumeAnalysis.targetRoles?.map((s) => <span className="iim-chip" key={s}>{s}</span>)}</div></div>
            </div>
          </>
          : <div className="empty"><FileText size={24} aria-hidden /><h3 className="headingSm">Build your candidate profile</h3><p className="bodySm muted">After you upload a resume, fit analysis compares your evidence with each job description.</p></div>}
      </>}

      <footer className="footer"><span>Job Scout · Middle East job search</span><span>Ranked with LangGraph · LangSmith tracing is optional</span></footer>
    </main>
  </>;
}
