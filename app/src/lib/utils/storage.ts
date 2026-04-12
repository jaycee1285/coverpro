import type { Run, RunIndexEntry, RunMetadata, Job, JobSummary } from '$lib/types';

// Storage paths (relative to app data directory)
const RUNS_DIR = 'runs';
const INDEX_FILE = 'runs/index.json';

// Generate unique run ID
export function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Create run label for sidebar
export function createRunLabel(jobs: Job[]): string {
  const firstJob = jobs[0];
  if (!firstJob) return 'Empty Run';
  const remaining = jobs.length - 1;
  return `${firstJob.input.jobTitle} — ${firstJob.input.company}${remaining > 0 ? ` (+${remaining})` : ''}`;
}

// Convert jobs to summaries for sidebar
export function jobsToSummaries(jobs: Job[]): JobSummary[] {
  return jobs.map(job => ({
    id: job.id,
    title: job.input.jobTitle,
    company: job.input.company,
    status: job.status,
  }));
}

// Create run index entry
export function createRunIndexEntry(run: Run): RunIndexEntry {
  return {
    id: run.metadata.id,
    createdAt: run.metadata.createdAt,
    label: createRunLabel(run.jobs),
    jobSummaries: jobsToSummaries(run.jobs),
  };
}

// Storage implementation using Tauri filesystem API
// These functions will be called from the Rust backend via invoke

export interface StorageAPI {
  loadRunIndex(): Promise<RunIndexEntry[]>;
  saveRunIndex(entries: RunIndexEntry[]): Promise<void>;
  loadRun(runId: string): Promise<Run | null>;
  saveRun(run: Run): Promise<void>;
  saveJobMarkdown(runId: string, jobId: number, markdown: string): Promise<void>;
  loadJobMarkdown(runId: string, jobId: number): Promise<string | null>;
  saveJobHtml(runId: string, jobId: number, html: string): Promise<void>;
  loadJobHtml(runId: string, jobId: number): Promise<string | null>;
}

// In-memory storage for development (will be replaced with Tauri filesystem calls)
class MemoryStorage implements StorageAPI {
  private runIndex: RunIndexEntry[] = [];
  private runs: Map<string, Run> = new Map();
  private jobMarkdown: Map<string, string> = new Map();
  private jobHtml: Map<string, string> = new Map();

  async loadRunIndex(): Promise<RunIndexEntry[]> {
    return [...this.runIndex];
  }

  async saveRunIndex(entries: RunIndexEntry[]): Promise<void> {
    this.runIndex = [...entries];
  }

  async loadRun(runId: string): Promise<Run | null> {
    return this.runs.get(runId) || null;
  }

  async saveRun(run: Run): Promise<void> {
    this.runs.set(run.metadata.id, run);
  }

  async saveJobMarkdown(runId: string, jobId: number, markdown: string): Promise<void> {
    this.jobMarkdown.set(`${runId}/job-${jobId}.md`, markdown);
  }

  async loadJobMarkdown(runId: string, jobId: number): Promise<string | null> {
    return this.jobMarkdown.get(`${runId}/job-${jobId}.md`) || null;
  }

  async saveJobHtml(runId: string, jobId: number, html: string): Promise<void> {
    this.jobHtml.set(`${runId}/job-${jobId}.html`, html);
  }

  async loadJobHtml(runId: string, jobId: number): Promise<string | null> {
    return this.jobHtml.get(`${runId}/job-${jobId}.html`) || null;
  }
}

// Export default storage instance (will switch to Tauri implementation later)
export const storage: StorageAPI = new MemoryStorage();
