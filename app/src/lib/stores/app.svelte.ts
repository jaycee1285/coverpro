import type { RunIndexEntry, Run, JobInput, LlmBackend, ResumeMode } from '$lib/types';
import { getDefaultModel, getModelForTier, getModelTier } from '$lib/config/models';
import { DEFAULT_RESUME_MODE, RESUME_MODE_IDS } from '$lib/config/resume-modes';
import { loadApiSettings } from '$lib/utils/settings';

// Re-export for backwards compatibility
export type { LlmBackend } from '$lib/types';

// App state using Svelte 5 runes
class AppStore {
  // Run list for sidebar
  runs = $state<RunIndexEntry[]>([]);

  // Currently selected run
  currentRunId = $state<string | null>(null);

  // Currently selected job within run
  currentJobId = $state<number | null>(null);

  // Current run data (loaded when selected)
  currentRun = $state<Run | null>(null);

  // Whether a run is in progress
  isRunning = $state(false);

  // Selected LLM backend (will be set by init based on platform)
  selectedBackend = $state<LlmBackend>('claude');

  // Selected model within the current backend
  selectedModel = $state<string>(getDefaultModel('claude'));

  // Initialization flag
  #initialized = false;

  // Pipeline mode: single-shot (default) or multi-agent pipeline
  pipelineMode = $state(false);

  // LLM temperature (0 = deterministic, 1 = creative)
  temperature = $state(0.7);

  // Model selection for pipeline steps
  bulletModel = $state<string>('sonnet');
  critiqueModel = $state<string>('opus');

  // Resume mode: PM or Content Strategist
  resumeMode = $state<ResumeMode>(DEFAULT_RESUME_MODE);

  // Input form state for new run
  jobInputs = $state<JobInput[]>([
    { jobTitle: '', company: '', jdText: '' },
    { jobTitle: '', company: '', jdText: '' },
    { jobTitle: '', company: '', jdText: '' },
    { jobTitle: '', company: '', jdText: '' },
  ]);

  // Derived: current job data
  get currentJob() {
    if (!this.currentRun || this.currentJobId === null) return null;
    return this.currentRun.jobs.find(j => j.id === this.currentJobId) || null;
  }

  // Actions
  selectRun(runId: string) {
    this.currentRunId = runId;
    this.currentJobId = 1; // Default to first job
  }

  selectJob(jobId: number) {
    this.currentJobId = jobId;
  }

  resetInputs() {
    this.jobInputs = [
      { jobTitle: '', company: '', jdText: '' },
      { jobTitle: '', company: '', jdText: '' },
      { jobTitle: '', company: '', jdText: '' },
      { jobTitle: '', company: '', jdText: '' },
    ];
  }

  updateJobInput(index: number, field: keyof JobInput, value: string) {
    this.jobInputs[index] = { ...this.jobInputs[index], [field]: value };
  }

  setRuns(runs: RunIndexEntry[]) {
    this.runs = runs;
  }

  setCurrentRun(run: Run | null) {
    this.currentRun = run;
  }

  setRunning(running: boolean) {
    this.isRunning = running;
  }

  setBackend(backend: LlmBackend) {
    const prevBackend = this.selectedBackend;
    const selectedTier = getModelTier(prevBackend, this.selectedModel) ?? 'default';
    const bulletTier = getModelTier(prevBackend, this.bulletModel) ?? 'cheap';
    const critiqueTier = getModelTier(prevBackend, this.critiqueModel) ?? 'strong';

    // Clamp temperature to provider max
    if (backend === 'anthropic-api' && this.temperature > 1) {
      this.temperature = 1;
    }

    this.selectedBackend = backend;
    this.selectedModel = getModelForTier(backend, selectedTier);
    this.bulletModel = getModelForTier(backend, bulletTier);
    this.critiqueModel = getModelForTier(backend, critiqueTier);
  }

  setModel(model: string) {
    this.selectedModel = model;
  }

  setResumeMode(mode: ResumeMode) {
    this.resumeMode = mode;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('resume-mode', mode);
    }
  }

  /**
   * Initialize app store with platform-aware defaults.
   * Should be called once on app mount.
   */
  async init() {
    if (this.#initialized) return;
    this.#initialized = true;

    try {
      const { detectPlatform, isDesktop } = await import('$lib/utils/platform');

      const platform = await detectPlatform();

      // Load resume mode from localStorage
      if (typeof localStorage !== 'undefined') {
        const savedMode = localStorage.getItem('resume-mode');
        if (RESUME_MODE_IDS.includes(savedMode as ResumeMode)) {
          this.resumeMode = savedMode as ResumeMode;
        }
      }

      // Platform-aware default backend
      if (isDesktop(platform)) {
        // Desktop: default to CLI (claude)
        this.setBackend('claude');
      } else {
        // Mobile: default to API (anthropic-api)
        // Check if API key is configured, if not we'll show a warning
        const settings = await loadApiSettings();
        this.setBackend('anthropic-api');

        // Log warning if no key configured (UI will show prompt)
        if (!settings.anthropicApiKey && !settings.openaiApiKey) {
          console.warn('No API keys configured. Please configure in Settings.');
        }
      }
    } catch (err) {
      console.error('Failed to initialize app store:', err);
      // Fallback to default (claude)
      this.setBackend('claude');
    }
  }
}

export const appStore = new AppStore();
