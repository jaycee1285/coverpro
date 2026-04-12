// Job status state machine
export type JobStatus = 'queued' | 'running' | 'linting' | 'fixing' | 'done' | 'error' | 'cancelled';

// Pipeline step tracking (multi-agent mode)
export type PipelineStep = 'bullets' | 'critique' | 'cover-letter' | 'lint' | 'repair';

// LLM backend type
export type LlmBackend = 'claude' | 'codex' | 'anthropic-api' | 'openai-api' | 'openrouter-api';

// Platform type for desktop/mobile detection
export type Platform = 'desktop' | 'android' | 'ios';

// Resume generation mode
export type ResumeMode = 'pm' | 'content' | 'fme' | 'pmm' | 'devrel' | 'dxe' | 'isd' | 'fe';

// Job input from user
export interface JobInput {
  jobTitle: string;
  company: string;
  jdText: string;
  customInstructions?: string; // Additional instructions for re-runs
  resumeMode?: ResumeMode; // Per-job override; falls back to appStore.resumeMode
}

// Role fit tier from JD classification
export type RoleFitTier = 'tier1' | 'tier2' | 'tier3_avoid';

// Single job within a run
export interface Job {
  id: number; // 1-4
  input: JobInput;
  status: JobStatus;
  pipelineStep?: PipelineStep; // Current step in multi-agent pipeline
  markdown?: string;
  html?: string;
  lintErrors?: LintError[];
  error?: string;
  repairAttempts?: number;
  badFitWarning?: boolean; // True if agent struggled to map experience
  statusDetail?: string; // Human-readable progress info (e.g. "Repair 2/10 — 5 errors")
  roleFitTier?: RoleFitTier; // JD classification tier
  roleFitWarnings?: string[]; // Negative signal warnings from JD
}

// Run metadata
export interface RunMetadata {
  id: string;
  createdAt: string;
  instructionsHash?: string;
  dataHash?: string;
}

// Full run object
export interface Run {
  metadata: RunMetadata;
  jobs: Job[];
}

// Run index entry for sidebar
export interface RunIndexEntry {
  id: string;
  createdAt: string;
  label: string; // "Job1 Title — Company (+3)"
  jobSummaries: JobSummary[];
}

// Job summary for sidebar
export interface JobSummary {
  id: number;
  title: string;
  company: string;
  status: JobStatus;
}

// Lint error structure
export interface LintError {
  code?: string;
  block: string;
  line?: number;
  message: string;
  severity: 'error' | 'warning';
  fieldKeys?: string[];
  fieldKey?: string;
  fieldLabel?: string;
}

export interface LintFieldStatus {
  key: string;
  block: string;
  label: string;
  kind: 'bullet' | 'cover-letter';
  status: 'pass' | 'warn' | 'fail';
  errors: LintError[];
}

// Lint result
export interface LintResult {
  valid: boolean;
  errors: LintError[];
  fields?: LintFieldStatus[];
}

// App state
export interface AppState {
  runs: RunIndexEntry[];
  currentRunId: string | null;
  currentJobId: number | null;
  isRunning: boolean;
}

// Copy target for HTML copy
export type CopyTarget = 'full' | 'resume' | 'cover-letter';
