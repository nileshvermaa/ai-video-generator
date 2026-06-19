// In-memory job store for async work (video generation). Phase 4 swaps this for
// SQLite so jobs survive a server restart. The tool surface stays identical.

export type JobStatus = "planned" | "dry-run" | "queued" | "in_progress" | "completed" | "failed";

export interface Job {
  id: string;
  type: "video";
  projectId: string;
  status: JobStatus;
  providerId?: string;
  providerJobId?: string;
  request: unknown;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, Job>();

export function newJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addJob(j: Omit<Job, "createdAt" | "updatedAt">): Job {
  const now = Date.now();
  const job: Job = { ...j, createdAt: now, updatedAt: now };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<Job>): Job {
  const job = jobs.get(id);
  if (!job) throw new Error(`Job "${id}" not found`);
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}
