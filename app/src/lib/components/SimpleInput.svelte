<script lang="ts">
  import { appStore, type LlmBackend } from '$lib/stores/app.svelte';
  import { MODEL_OPTIONS, type ModelOption } from '$lib/config/models';
  import { DEFAULT_RESUME_MODE, RESUME_MODE_DEFINITIONS } from '$lib/config/resume-modes';
  import { classifyJD, type JdClassification } from '$lib/services/runner';
  import type { ResumeMode } from '$lib/types';
  import FilterableSelect, { type FilterSelectOption } from '$lib/components/FilterableSelect.svelte';
  import { discoverModelsForBackend } from '$lib/services/model-catalog';
  import { loadApiSettings, loadModelDiscoverySettings } from '$lib/utils/settings';
  import QueueImport from '$lib/components/QueueImport.svelte';
  import { REPAIR_FIXTURES } from '$lib/config/repair-fixtures';

  type Job = { jdText: string; jobTitle: string; company: string; slotIndex: number; resumeMode?: ResumeMode };
  let { onRun, onImportRepair, onLoadRepairFixture, onOpenSettings }: {
    onRun: (jobs: Job[]) => void | Promise<void>;
    onImportRepair?: (file: File, resumeMode: ResumeMode) => void | Promise<void>;
    onLoadRepairFixture?: (fixtureId: string) => void | Promise<void>;
    onOpenSettings?: () => void;
  } = $props();

  // Backend switch confirmation
  let pendingBackend = $state<LlmBackend | null>(null);
  let pendingModel = $state<string | null>(null);
  let discoveredModels = $state<Partial<Record<LlmBackend, ModelOption[]>>>({});

  // Pre-run tier3 gate
  type ClassifiedJob = Job & { classification: JdClassification; selected: boolean };
  let pendingJobs = $state<ClassifiedJob[]>([]);
  let showTier3Gate = $state(false);
  let activeIndex = $state(0);
  let showSettings = $state(false);
  let showQueueImport = $state(false);
  let importSource = $state('');
  let showRepairImport = $state(false);
  let repairImportMode = $state<ResumeMode>(DEFAULT_RESUME_MODE);
  let repairImportError = $state('');
  let repairImportFileName = $state('');
  let repairFileInput = $state<HTMLInputElement | null>(null);
  let selectedRepairFixture = $state(REPAIR_FIXTURES[0]?.id ?? '');

  const totalSlots = appStore.jobInputs.length;

  function getBackendLabel(backend: LlmBackend): string {
    switch (backend) {
      case 'claude':
        return 'Claude';
      case 'codex':
        return 'Codex';
      case 'anthropic-api':
        return 'Anthropic API';
      case 'openai-api':
        return 'OpenAI API';
      case 'openrouter-api':
        return 'OpenRouter API';
    }
  }

  const allBackends: LlmBackend[] = ['claude', 'codex', 'anthropic-api', 'openai-api', 'openrouter-api'];

  const backendOptions = $derived<FilterSelectOption[]>(
    allBackends.map((backend) => ({
      value: backend,
      label: getBackendLabel(backend),
      meta: backend.includes('-api') ? 'API' : 'CLI',
      keywords: [backend],
    }))
  );

  const activeBackend = $derived<LlmBackend>(pendingBackend ?? appStore.selectedBackend);
  const activeBackendModels = $derived(discoveredModels[activeBackend] || MODEL_OPTIONS[activeBackend] || []);

  const modelOptions = $derived<FilterSelectOption[]>(
    activeBackendModels.map((opt) => ({
      value: opt.id,
      label: opt.label,
      meta: opt.tier === 'cheap' ? '$' : opt.tier === 'strong' ? '$$$' : '$$',
      keywords: [opt.id, opt.tier],
    }))
  );

  const activeModel = $derived.by(() => {
    if (pendingModel && activeBackendModels.some((opt) => opt.id === pendingModel)) {
      return pendingModel;
    }
    if (activeBackendModels.some((opt) => opt.id === appStore.selectedModel)) {
      return appStore.selectedModel;
    }
    return activeBackendModels[0]?.id ?? '';
  });

  function handleBackendChange(value: string) {
    const backend = value as LlmBackend;
    if (backend === appStore.selectedBackend) {
      pendingBackend = null;
      pendingModel = null;
      return;
    }

    pendingBackend = backend;
    const targetModels = discoveredModels[backend] || MODEL_OPTIONS[backend];
    pendingModel = targetModels?.[0]?.id ?? null;
    void loadModelsForBackend(backend, true);
  }

  function handleModelChange(value: string) {
    if (pendingBackend) {
      pendingModel = value;
      return;
    }
    appStore.setModel(value);
  }

  function confirmBackendSwitch() {
    if (pendingBackend) {
      appStore.setBackend(pendingBackend);
      if (pendingModel) {
        appStore.setModel(pendingModel);
      }
    }
    pendingBackend = null;
    pendingModel = null;
  }

  function cancelBackendSwitch() {
    pendingBackend = null;
    pendingModel = null;
  }

  async function loadModelsForBackend(backend: LlmBackend, forceRefresh = false): Promise<void> {
    try {
      const [apiSettings, discoverySettings] = await Promise.all([
        loadApiSettings(),
        loadModelDiscoverySettings(),
      ]);
      const models = await discoverModelsForBackend(backend, apiSettings, forceRefresh, discoverySettings);
      discoveredModels = { ...discoveredModels, [backend]: models };

      if (pendingBackend === backend && pendingModel && !models.some((model) => model.id === pendingModel)) {
        pendingModel = models[0]?.id ?? null;
      }

      if (!pendingBackend && backend === appStore.selectedBackend && !models.some((model) => model.id === appStore.selectedModel)) {
        appStore.setModel(models[0]?.id ?? MODEL_OPTIONS[backend][0].id);
      }
    } catch (err) {
      console.error(`Failed to discover models for ${backend}:`, err);
    }
  }

  $effect(() => {
    void loadModelsForBackend(activeBackend);
  });

  $effect(() => {
    const handleModelCatalogUpdated = () => {
      void loadModelsForBackend(activeBackend, true);
    };
    window.addEventListener('modelCatalogUpdated', handleModelCatalogUpdated);
    return () => window.removeEventListener('modelCatalogUpdated', handleModelCatalogUpdated);
  });

  let hasAnyInput = $derived(appStore.jobInputs.some(j => j.jdText.trim()));
  let activeInput = $derived(appStore.jobInputs[activeIndex]);

  function isFilled(index: number): boolean {
    const input = appStore.jobInputs[index];
    return !!(input.jobTitle.trim() || input.company.trim() || input.jdText.trim());
  }

  // Navigator arrow state: 'boundary' | 'filled' | 'empty'
  let leftArrowState = $derived<'boundary' | 'filled' | 'empty'>(
    activeIndex === 0 ? 'boundary' :
    isFilled(activeIndex - 1) ? 'filled' : 'empty'
  );

  let rightArrowState = $derived<'boundary' | 'filled' | 'empty'>(
    activeIndex === totalSlots - 1 ? 'boundary' :
    isFilled(activeIndex + 1) ? 'filled' : 'empty'
  );

  function goPrev() {
    if (activeIndex > 0) activeIndex--;
  }

  function goNext() {
    if (activeIndex < totalSlots - 1) activeIndex++;
  }

  function focusSelectTrigger(selectId: string): boolean {
    const trigger = document.getElementById(`${selectId}-trigger`) as HTMLButtonElement | null;
    if (!trigger) return false;
    trigger.focus();
    return true;
  }

  function handleKeydown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    const modKey = e.ctrlKey || e.metaKey;

    if (modKey && key === 'arrowleft') { e.preventDefault(); goPrev(); }
    if (modKey && key === 'arrowright') { e.preventDefault(); goNext(); }
    if (modKey && e.shiftKey && key === 'm') {
      e.preventDefault();
      focusSelectTrigger('header-model-picker');
    }
    if (modKey && e.shiftKey && key === 'b') {
      e.preventDefault();
      focusSelectTrigger('header-backend-picker');
    }
    if (e.ctrlKey && e.key === 'm') {
      e.preventDefault();
      const modeSelect = document.querySelector('.job-card .mode-select') as HTMLSelectElement | null;
      if (modeSelect) { modeSelect.focus(); modeSelect.showPicker?.(); }
    }
  }

  let showApiKeyWarning = $state(false);
  let missingKeyProvider = $state<'anthropic' | 'openai' | 'openrouter' | null>(null);

  async function checkApiKeys(): Promise<boolean> {
    // Only check for API backends
    if (appStore.selectedBackend !== 'anthropic-api' && appStore.selectedBackend !== 'openai-api' && appStore.selectedBackend !== 'openrouter-api') {
      return true;
    }

    try {
      const settings = await loadApiSettings();

      if (appStore.selectedBackend === 'anthropic-api' && !settings.anthropicApiKey) {
        missingKeyProvider = 'anthropic';
        showApiKeyWarning = true;
        return false;
      }

      if (appStore.selectedBackend === 'openai-api' && !settings.openaiApiKey) {
        missingKeyProvider = 'openai';
        showApiKeyWarning = true;
        return false;
      }

      if (appStore.selectedBackend === 'openrouter-api' && !settings.openrouterApiKey) {
        missingKeyProvider = 'openrouter';
        showApiKeyWarning = true;
        return false;
      }

      return true;
    } catch (err) {
      console.error('Failed to check API keys:', err);
      return true; // Allow run to proceed, will fail later with better error
    }
  }

  export async function handleRun() {
    const jobs: Job[] = [];
    for (let i = 0; i < appStore.jobInputs.length; i++) {
      const input = appStore.jobInputs[i];
      if (input.jdText.trim()) {
        jobs.push({ jdText: input.jdText, jobTitle: input.jobTitle, company: input.company, slotIndex: i, resumeMode: input.resumeMode });
      }
    }
    if (jobs.length === 0) return;

    // Check API keys first
    const hasKeys = await checkApiKeys();
    if (!hasKeys) return;

    // Classify all jobs
    const classified = jobs.map(job => ({
      ...job,
      classification: classifyJD(job.jdText),
      selected: true,
    }));

    // Check if any are tier3_avoid
    const hasTier3 = classified.some(j => j.classification.tier === 'tier3_avoid');

    if (hasTier3) {
      pendingJobs = classified;
      showTier3Gate = true;
    } else {
      onRun(jobs);
    }
  }

  function confirmTier3Gate() {
    const selectedJobs = pendingJobs.filter(j => j.selected);
    if (selectedJobs.length === 0) {
      showTier3Gate = false;
      pendingJobs = [];
      return;
    }
    onRun(selectedJobs.map(({ jdText, jobTitle, company, slotIndex }) => ({ jdText, jobTitle, company, slotIndex })));
    showTier3Gate = false;
    pendingJobs = [];
  }

  function cancelTier3Gate() {
    showTier3Gate = false;
    pendingJobs = [];
  }

  function toggleJobSelection(index: number) {
    pendingJobs[index].selected = !pendingJobs[index].selected;
    pendingJobs = [...pendingJobs];
  }

  export function openRepairImport() {
    repairImportError = '';
    repairImportFileName = '';
    showRepairImport = true;
  }

  function closeRepairImport() {
    showRepairImport = false;
    repairImportError = '';
    repairImportFileName = '';
    if (repairFileInput) {
      repairFileInput.value = '';
    }
  }

  async function handleRepairFilePicked(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !onImportRepair) return;

    repairImportError = '';
    repairImportFileName = file.name;

    try {
      await onImportRepair(file, repairImportMode);
      closeRepairImport();
    } catch (err) {
      repairImportError = err instanceof Error ? err.message : 'Failed to import repair file.';
    }
  }

  async function loadSelectedRepairFixture() {
    if (!selectedRepairFixture || !onLoadRepairFixture) return;
    await onLoadRepairFixture(selectedRepairFixture);
    closeRepairImport();
  }

</script>

<svelte:window onkeydown={handleKeydown} />

<div class="input-panel">
  <div class="panel-header">
    <div class="header-left">
      <h1>CoverPro</h1>
      <label class="temp-control" title="LLM temperature (0 = deterministic, 1 = creative)">
        <span class="temp-icon">🌡</span>
        <input
          class="temp-input"
          type="number"
          min="0"
          max={appStore.selectedBackend === 'anthropic-api' ? 1 : 2}
          step="0.05"
          value={appStore.temperature}
          oninput={(e) => { appStore.temperature = parseFloat((e.target as HTMLInputElement).value) || 0; }}
          disabled={appStore.isRunning}
        />
      </label>
    </div>
    <div class="header-right">
      <div class="settings-controls" class:settings-open={showSettings}>
        <label class="pipeline-toggle" title="Multi-agent pipeline: Sonnet generates bullets, Opus critiques and writes cover letter. Higher quality, 3x API calls.">
          <input
            type="checkbox"
            checked={appStore.pipelineMode}
            onchange={() => { appStore.pipelineMode = !appStore.pipelineMode; }}
            disabled={appStore.isRunning}
          />
          <span class="toggle-label">Pipeline</span>
        </label>
        <div class="header-picker" title="Model picker (Ctrl/Cmd+Shift+M)">
          <FilterableSelect
            id="header-model-picker"
            options={modelOptions}
            selectedValue={activeModel}
            disabled={appStore.isRunning || modelOptions.length === 0}
            placeholder="Choose model"
            searchPlaceholder="Filter models..."
            compact={true}
            onChange={handleModelChange}
          />
        </div>
        <div class="header-picker" title="Backend picker (Ctrl/Cmd+Shift+B)">
          <FilterableSelect
            id="header-backend-picker"
            options={backendOptions}
            selectedValue={pendingBackend ?? appStore.selectedBackend}
            disabled={appStore.isRunning}
            placeholder="Choose backend"
            searchPlaceholder="Filter backends..."
            compact={true}
            onChange={handleBackendChange}
          />
        </div>
      </div>
      <button
        class="btn-import"
        onclick={() => (showQueueImport = true)}
        disabled={appStore.isRunning}
        title="Import jobs from file"
      >
        Import
      </button>
      <button
        class="btn-import"
        onclick={openRepairImport}
        disabled={appStore.isRunning}
        title="Import markdown package for repair/export"
      >
        Repair
      </button>
      <button
        class="btn-primary"
        onclick={handleRun}
        disabled={!hasAnyInput || appStore.isRunning}
      >
        {appStore.isRunning ? 'Generating...' : 'Generate'}
      </button>
    </div>
  </div>

  <div class="job-nav">
    <button
      type="button"
      class="nav-arrow"
      class:nav-boundary={leftArrowState === 'boundary'}
      class:nav-filled={leftArrowState === 'filled'}
      class:nav-empty={leftArrowState === 'empty'}
      onclick={goPrev}
      disabled={activeIndex === 0}
      aria-label="Previous job"
    >
      ‹
    </button>
    <span class="nav-counter">{activeIndex + 1} / {totalSlots}</span>
    <button
      type="button"
      class="nav-arrow"
      class:nav-boundary={rightArrowState === 'boundary'}
      class:nav-filled={rightArrowState === 'filled'}
      class:nav-empty={rightArrowState === 'empty'}
      onclick={goNext}
      disabled={activeIndex === totalSlots - 1}
      aria-label="Next job"
    >
      ›
    </button>
    {#if importSource}
      <span class="import-tag" title={importSource}>
        {importSource}
        <button class="import-tag-x" onclick={() => (importSource = '')} aria-label="Clear import source">&times;</button>
      </span>
    {/if}
  </div>

  {#if pendingBackend}
    <div class="confirm-banner">
      <span>Switch backend to <strong>{getBackendLabel(pendingBackend)}</strong>?</span>
      <div class="confirm-actions">
        <button class="btn-ghost" onclick={cancelBackendSwitch}>Cancel</button>
        <button class="btn-confirm" onclick={confirmBackendSwitch}>Confirm</button>
      </div>
    </div>
  {/if}

  {#if showRepairImport}
    <button
      type="button"
      class="repair-import-backdrop"
      aria-label="Close repair import"
      onclick={closeRepairImport}
    ></button>
    <div class="repair-import-modal" role="dialog" aria-modal="true" aria-labelledby="repair-import-title">
      <div class="repair-import-header">
        <h2 id="repair-import-title">Import Repair Package</h2>
        <button type="button" class="repair-import-close" aria-label="Close" onclick={closeRepairImport}>×</button>
      </div>
      <div class="repair-import-body">
        <label class="repair-import-label" for="repair-import-mode">Resume style</label>
        <select id="repair-import-mode" class="repair-import-select" bind:value={repairImportMode}>
          {#each RESUME_MODE_DEFINITIONS as mode}
            <option value={mode.id}>{mode.label}</option>
          {/each}
        </select>

        <input
          bind:this={repairFileInput}
          class="repair-import-file"
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          onchange={handleRepairFilePicked}
        />

        <p class="repair-import-note">
          Pick a saved markdown package. It will load as the current package and jump directly to export.
        </p>

        <div class="fixture-loader">
          <label class="repair-import-label" for="repair-fixture-select">Dev fixture</label>
          <div class="fixture-row">
            <select id="repair-fixture-select" class="repair-import-select" bind:value={selectedRepairFixture}>
              {#each REPAIR_FIXTURES as fixture}
                <option value={fixture.id}>{fixture.label}</option>
              {/each}
            </select>
            <button type="button" class="btn-confirm" onclick={loadSelectedRepairFixture}>
              Load
            </button>
          </div>
        </div>

        {#if repairImportFileName}
          <p class="repair-import-status">Selected: {repairImportFileName}</p>
        {/if}

        {#if repairImportError}
          <p class="repair-import-error">{repairImportError}</p>
        {/if}
      </div>
    </div>
  {/if}

  <div class="single-job">
    <div class="job-card">
      <div class="job-card-header">
        <span>Job {activeIndex + 1}</span>
        <select
          class="mode-select"
          value={activeInput.resumeMode || appStore.resumeMode}
          onchange={(e) => appStore.updateJobInput(activeIndex, 'resumeMode', (e.target as HTMLSelectElement).value)}
          disabled={appStore.isRunning}
          title="Resume mode (Ctrl+M to toggle)"
        >
          {#each RESUME_MODE_DEFINITIONS as mode}
            <option value={mode.id}>{mode.shortLabel}</option>
          {/each}
        </select>
      </div>
      <div class="job-card-body">
        <div class="field-row">
          <input type="text" placeholder="Job Title" bind:value={activeInput.jobTitle} />
          <input type="text" placeholder="Company" bind:value={activeInput.company} />
        </div>
        <textarea placeholder="Paste job description..." bind:value={activeInput.jdText}></textarea>
      </div>
    </div>
  </div>
</div>

{#if showTier3Gate}
  <button
    type="button"
    class="tier3-backdrop"
    aria-label="Close role fit warning"
    onclick={cancelTier3Gate}
  ></button>
  <div class="tier3-modal" role="dialog" aria-modal="true" aria-labelledby="tier3-title">
    <div class="tier3-header">
      <h3 id="tier3-title">Role Fit Warning</h3>
      <button class="modal-close" onclick={cancelTier3Gate} aria-label="Close">&times;</button>
    </div>
    <div class="tier3-body">
      <p>Some jobs flagged as poor fit. Deselect to skip, or proceed anyway.</p>
      <div class="tier3-job-list">
        {#each pendingJobs as job, i}
          <label class="tier3-job-item" class:tier3-avoid={job.classification.tier === 'tier3_avoid'}>
            <input
              type="checkbox"
              checked={job.selected}
              onchange={() => toggleJobSelection(i)}
            />
            <div class="tier3-job-info">
              <span class="tier3-job-title">{job.jobTitle || `Job ${job.slotIndex + 1}`}</span>
              {#if job.company}
                <span class="tier3-job-company">{job.company}</span>
              {/if}
              <span class="tier3-tier tier-{job.classification.tier}">
                {job.classification.tier === 'tier1' ? 'Tier 1' :
                 job.classification.tier === 'tier2' ? 'Tier 2' : 'Tier 3'}
              </span>
            </div>
            {#if job.classification.warnings.length > 0}
              <div class="tier3-warnings">
                {#each job.classification.warnings as warning}
                  <span class="tier3-warning-tag">{warning}</span>
                {/each}
              </div>
            {/if}
          </label>
        {/each}
      </div>
    </div>
    <div class="tier3-actions">
      <button class="btn-ghost" onclick={cancelTier3Gate}>Cancel</button>
      <button
        class="btn-primary"
        onclick={confirmTier3Gate}
        disabled={!pendingJobs.some(j => j.selected)}
      >
        Run {pendingJobs.filter(j => j.selected).length} Job{pendingJobs.filter(j => j.selected).length !== 1 ? 's' : ''}
      </button>
    </div>
  </div>
{/if}

<!-- API Key Missing Warning Modal -->
{#if showApiKeyWarning}
  <button
    type="button"
    class="tier3-backdrop"
    aria-label="Close API key warning"
    onclick={() => (showApiKeyWarning = false)}
  ></button>
  <div class="tier3-modal" role="dialog" aria-modal="true" aria-labelledby="apikey-title">
    <div class="tier3-header">
      <h3 id="apikey-title">API Key Required</h3>
      <button class="modal-close" onclick={() => (showApiKeyWarning = false)} aria-label="Close">&times;</button>
    </div>
    <div class="tier3-body">
      <p>
        {#if missingKeyProvider === 'anthropic'}
          No Anthropic API key configured. Please add your API key in Settings to use the Anthropic API backend.
        {:else if missingKeyProvider === 'openai'}
          No OpenAI API key configured. Please add your API key in Settings to use the OpenAI API backend.
        {:else if missingKeyProvider === 'openrouter'}
          No OpenRouter API key configured. Please add your API key in Settings to use the OpenRouter API backend.
        {/if}
      </p>
      <p class="help-text">
        Get your API key from:
        {#if missingKeyProvider === 'anthropic'}
          <a href="https://console.anthropic.com" target="_blank" rel="noopener">Anthropic Console</a>
        {:else if missingKeyProvider === 'openai'}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI Platform</a>
        {:else if missingKeyProvider === 'openrouter'}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">OpenRouter</a>
        {/if}
      </p>
    </div>
    <div class="tier3-actions">
      <button class="btn-ghost" onclick={() => (showApiKeyWarning = false)}>Cancel</button>
      <button
        class="btn-primary"
        onclick={() => {
          showApiKeyWarning = false;
          onOpenSettings?.();
        }}
      >
        Open Settings
      </button>
    </div>
  </div>
{/if}

{#if showQueueImport}
  <QueueImport
    onClose={() => (showQueueImport = false)}
    onLoad={(filename, batch) => {
      importSource = `${filename} \u00b7 Batch ${batch}`;
    }}
  />
{/if}

<style>
  .input-panel {
    height: 100vh;
    height: 100dvh; /* Dynamic viewport height for mobile */
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  /* --- Header --- */
  .panel-header {
    padding: var(--space-md) var(--space-lg);
    padding-top: calc(var(--space-md) + max(env(safe-area-inset-top, 0px), var(--android-status-fallback)));
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
  }

  .panel-header h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .temp-control {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0.125rem 0 0;
    cursor: default;
  }

  .temp-icon {
    font-size: 0.95rem;
    line-height: 1;
  }

  .temp-input {
    width: 58px;
    padding: 1px 4px;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    text-align: right;
  }

  .temp-input:disabled {
    opacity: 0.5;
  }

  .subtitle {
    margin: 0.125rem 0 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .header-right {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  /* --- Settings controls (collapsible on mobile) --- */
  .settings-controls {
    display: none;
    gap: var(--space-sm);
    align-items: center;
  }

  .settings-controls.settings-open {
    display: flex;
  }

  @media (min-width: 768px) {
    .settings-controls {
      display: flex !important;
    }

    .panel-header {
      padding: var(--space-lg) var(--space-xl);
    }
  }

  /* --- Job Navigator --- */
  .job-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .nav-arrow {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 999px;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    font-family: inherit;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .nav-arrow.nav-boundary {
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--text-muted);
    opacity: 0.5;
    cursor: default;
  }

  .nav-arrow.nav-empty {
    border: 2px solid rgb(var(--color-tertiary-500));
    background: rgb(var(--color-tertiary-500) / 0.1);
    color: rgb(var(--color-tertiary-500));
  }

  .nav-arrow.nav-empty:hover:not(:disabled) {
    background: rgb(var(--color-tertiary-500) / 0.2);
  }

  .nav-arrow.nav-filled {
    border: 2px solid rgb(var(--color-primary-500));
    background: rgb(var(--color-primary-500) / 0.1);
    color: rgb(var(--color-primary-500));
  }

  .nav-arrow.nav-filled:hover:not(:disabled) {
    background: rgb(var(--color-primary-500) / 0.2);
  }

  .nav-counter {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
    min-width: 2.5rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* --- Import source tag --- */
  .import-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    padding: 2px 8px;
    background: var(--accent-color);
    color: white;
    border-radius: var(--radius-sm);
    font-weight: 500;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-left: var(--space-sm);
  }

  .import-tag-x {
    background: none;
    border: none;
    color: white;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    opacity: 0.7;
  }

  .import-tag-x:hover {
    opacity: 1;
  }

  /* --- Single job card (always visible) --- */
  .single-job {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .single-job .job-card {
    margin: var(--space-md) var(--space-lg);
    margin-bottom: calc(var(--space-md) + max(env(safe-area-inset-bottom, 0px), var(--android-nav-fallback)));
    flex: 1;
  }

  @media (min-width: 768px) {
    .single-job .job-card {
      margin: var(--space-lg) var(--space-xl);
    }
  }

  /* --- Pipeline toggle --- */
  .pipeline-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-secondary);
    user-select: none;
  }

  .pipeline-toggle input[type="checkbox"] {
    -webkit-appearance: checkbox;
    appearance: checkbox;
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent-color);
    cursor: pointer;
  }

  .pipeline-toggle input:disabled {
    cursor: not-allowed;
  }

  .toggle-label {
    font-weight: 500;
  }

  /* --- Header pickers --- */
  .header-picker {
    min-width: 8.5rem;
    max-width: 11rem;
  }

  @media (max-width: 1024px) {
    .header-picker {
      min-width: 8rem;
      max-width: 10rem;
    }
  }

  /* --- Buttons --- */
  .btn-import {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
    font-family: inherit;
  }

  .btn-import:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn-import:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .repair-import-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 100;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }

  .repair-import-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(28rem, calc(100vw - 2rem));
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.24);
    z-index: 101;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .repair-import-header {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .repair-import-header h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .repair-import-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    color: var(--text-muted);
    cursor: pointer;
  }

  .repair-import-close:hover {
    color: var(--text-primary);
  }

  .repair-import-body {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .repair-import-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .repair-import-select,
  .repair-import-file {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.9rem;
    font-family: inherit;
  }

  .repair-import-note,
  .repair-import-status,
  .repair-import-error {
    margin: 0;
    font-size: 0.82rem;
  }

  .repair-import-note,
  .repair-import-status {
    color: var(--text-muted);
  }

  .repair-import-error {
    color: rgb(var(--color-error-500));
  }

  .fixture-loader {
    display: grid;
    gap: var(--space-xs);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border-color);
  }

  .fixture-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .fixture-row .repair-import-select {
    flex: 1;
  }

  .btn-primary {
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
    font-family: inherit;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* --- Confirmation banner --- */
  .confirm-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 var(--space-lg);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: rgb(208 162 21 / 0.1);
    border: 1px solid rgb(208 162 21 / 0.3);
    font-size: 0.85rem;
    color: var(--text-primary);
  }

  @media (min-width: 768px) {
    .confirm-banner {
      margin: 0 var(--space-xl);
    }
  }

  .confirm-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .btn-ghost {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: transparent;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-primary);
    font-family: inherit;
  }

  .btn-ghost:hover {
    background: var(--bg-hover);
  }

  .btn-confirm {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    background: var(--accent-color);
    color: white;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
  }

  .btn-confirm:hover {
    background: var(--accent-hover);
  }

  /* --- Job card --- */
  .job-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    min-height: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    overflow: hidden;
  }

  .job-card-header {
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--text-muted);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .mode-select {
    padding: 2px 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.75rem;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .mode-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .job-card-body {
    padding: var(--space-sm);
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: var(--space-xs);
  }

  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-xs);
  }

  /* --- Inputs & textareas --- */
  .job-card input {
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.85rem;
    font-family: inherit;
  }

  .job-card input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px rgb(32 94 166 / 0.15);
  }

  .job-card input::placeholder {
    color: var(--text-muted);
  }

  .job-card textarea {
    flex: 1;
    min-height: 0;
    padding: var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.85rem;
    resize: none;
    font-family: inherit;
    line-height: 1.5;
  }

  .job-card textarea:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px rgb(32 94 166 / 0.15);
  }

  .job-card textarea::placeholder {
    color: var(--text-muted);
  }

  /* --- Tier 3 Gate Modal --- */
  .tier3-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }

  .tier3-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    width: min(500px, 90vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    z-index: 101;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .tier3-header {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .tier3-header h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .modal-close:hover {
    color: var(--text-primary);
  }

  .tier3-body {
    padding: var(--space-lg);
    overflow-y: auto;
  }

  .tier3-body > p {
    margin: 0 0 var(--space-md);
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .tier3-job-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .tier3-job-item {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    background: var(--bg-secondary);
  }

  .tier3-job-item:hover {
    background: var(--bg-hover);
  }

  .tier3-job-item.tier3-avoid {
    border-color: #ef444440;
    background: #ef444408;
  }

  .tier3-job-item input[type="checkbox"] {
    margin-top: 2px;
  }

  .tier3-job-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    flex: 1;
  }

  .tier3-job-title {
    font-weight: 600;
  }

  .tier3-job-company {
    color: var(--text-muted);
  }

  .tier3-tier {
    font-size: 0.75rem;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
  }

  .tier-tier1 { background: #22c55e20; color: #16a34a; }
  .tier-tier2 { background: #f59e0b20; color: #d97706; }
  .tier-tier3_avoid { background: #ef444420; color: #dc2626; }

  .tier3-warnings {
    width: 100%;
    margin-left: calc(var(--space-sm) + 18px);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .tier3-warning-tag {
    font-size: 0.75rem;
    padding: 2px 6px;
    background: #ef444415;
    color: #dc2626;
    border-radius: var(--radius-sm);
  }

  .tier3-actions {
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }
</style>
