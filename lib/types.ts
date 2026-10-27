export type JobCandidate = {
  source: string;
  sourceJobId?: string | null;
  title: string;
  company: string;
  location?: string | null;
  remoteType?: string | null;
  description: string;
  applyUrl: string;
  employmentType?: string | null;
  salaryText?: string | null;
  postedAt?: string | null;
};

export type ProviderStatus = {
  provider: string;
  ok: boolean;
  count: number;
  message?: string;
};

/** The end user's network details; Careerjet requires them on every request. */
export type SearchClient = {
  ip: string;
  userAgent: string;
};

export type RankedJob = JobCandidate & {
  id?: string;
  semanticScore: number;
  lexicalScore: number;
  recencyScore: number;
  profileScore: number;
  finalScore: number;
  scoreExplanation: string[];
};

export type CandidateAnalysis = {
  summary: string;
  strengths: string[];
  gaps: string[];
  targetRoles: string[];
  skills: string[];
  seniority: string;
};
