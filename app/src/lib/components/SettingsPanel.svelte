<script lang="ts">
  import { appStore } from '$lib/stores/app.svelte';
  import {
    DEFAULT_MODEL_DISCOVERY_SETTINGS,
    loadApiSettings,
    saveApiKey,
    clearApiKey,
    validateApiKey,
    loadOutputDir,
    saveOutputDir,
    loadModelDiscoverySettings,
    saveModelDiscoverySettings,
    type ModelDiscoverySettings,
  } from '$lib/utils/settings';
  import { detectPlatform, isDesktop, isMobile } from '$lib/utils/platform';
  import { getHardwiredKey, hasHardwiredKeys } from '$lib/config/api-keys';
  import { DEFAULT_RESUME_MODE, RESUME_MODE_DEFINITIONS, RESUME_MODE_MAP } from '$lib/config/resume-modes';
  import type { LlmBackend, Platform } from '$lib/types';
  import { MODEL_OPTIONS, type ModelOption } from '$lib/config/models';
  import FilterableSelect, { type FilterSelectOption } from '$lib/components/FilterableSelect.svelte';
  import { discoverModelsForBackend } from '$lib/services/model-catalog';

  interface Props {
    onClose?: () => void;
  }

  let { onClose }: Props = $props();

  let platform = $state<Platform>('desktop');
  let anthropicKey = $state('');
  let openaiKey = $state('');
  let openrouterKey = $state('');
  let keysLoaded = $state(false);
  let showKeys = $state(false);
  let usingHardwiredKeys = $state(false);

  interface TestResult {
    provider: string;
    status: 'idle' | 'testing' | 'success' | 'error';
    message: string;
  }

  let anthropicTest = $state<TestResult>({ provider: 'anthropic', status: 'idle', message: '' });
  let openaiTest = $state<TestResult>({ provider: 'openai', status: 'idle', message: '' });
  let openrouterTest = $state<TestResult>({ provider: 'openrouter', status: 'idle', message: '' });
  let discoveredModels = $state<Partial<Record<LlmBackend, ModelOption[]>>>({});
  let modelDiscoveryLoading = $state(false);
  let modelDiscoverySettingsLoaded = $state(false);

  let openaiExcludedTokensInput = $state(DEFAULT_MODEL_DISCOVERY_SETTINGS.openaiExcludedTokens.join(', '));
  let openaiRequireGpt5Family = $state(DEFAULT_MODEL_DISCOVERY_SETTINGS.openaiRequireGpt5Family);
  let openrouterManualModelsInput = $state(DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterManualModels.join('\n'));
  let openrouterManualOnly = $state(DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterManualOnly);
  let openrouterDiscoveryMaxResultsInput = $state(String(DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterDiscoveryMaxResults));
  let modelDiscoverySaveStatus = $state<'idle' | 'saving' | 'success' | 'error'>('idle');
  let modelDiscoverySaveMessage = $state('');

  // Storage / output directory (mobile)
  let storagePermissionGranted = $state<boolean | null>(null);
  let outputDir = $state('');
  let outputDirLoaded = $state(false);

  // Load platform, keys, and storage settings on mount
  $effect(() => {
    detectPlatform().then(async (p) => {
      platform = p;
      // On mobile, check storage permission and load output dir
      if (isMobile(p)) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          storagePermissionGranted = await invoke<boolean>('check_storage_permission');
          const savedDir = await loadOutputDir();
          if (savedDir) {
            outputDir = savedDir;
          } else {
            outputDir = await invoke<string>('get_default_output_dir');
          }
        } catch (e) {
          console.error('Failed to check storage:', e);
          storagePermissionGranted = false;
          outputDir = '/storage/emulated/0/Download';
        }
        outputDirLoaded = true;
      }
    }).catch(() => {
      platform = 'desktop'; // Fallback
    });

    // Check if using hardwired keys
    usingHardwiredKeys = hasHardwiredKeys();

    loadApiSettings().then((settings) => {
      // If using hardwired keys, show masked placeholder instead of actual keys
      if (getHardwiredKey('anthropic')) {
        anthropicKey = '••••••••••••••••••••'; // Masked
      } else {
        anthropicKey = settings.anthropicApiKey || '';
      }

      if (getHardwiredKey('openai')) {
        openaiKey = '••••••••••••••••••••'; // Masked
      } else {
        openaiKey = settings.openaiApiKey || '';
      }

      if (getHardwiredKey('openrouter')) {
        openrouterKey = '••••••••••••••••••••'; // Masked
      } else {
        openrouterKey = settings.openrouterApiKey || '';
      }

      keysLoaded = true;
    }).catch((err) => {
      console.error('Failed to load API settings:', err);
      // Still show the UI even if loading fails
      keysLoaded = true;
    });

    loadModelDiscoverySettings().then((settings) => {
      applyDiscoverySettingsToInputs(settings);
      modelDiscoverySettingsLoaded = true;
    }).catch((err) => {
      console.error('Failed to load model discovery settings:', err);
      applyDiscoverySettingsToInputs(DEFAULT_MODEL_DISCOVERY_SETTINGS);
      modelDiscoverySettingsLoaded = true;
    });
  });

  // Available backends based on platform
  const availableBackends = $derived<LlmBackend[]>(
    isDesktop(platform)
      ? ['claude', 'codex', 'anthropic-api', 'openai-api', 'openrouter-api']
      : ['anthropic-api', 'openai-api', 'openrouter-api']
  );

  // Filter available models based on selected backend
  const availableModels = $derived(
    discoveredModels[appStore.selectedBackend] || MODEL_OPTIONS[appStore.selectedBackend] || []
  );

  const backendOptions = $derived<FilterSelectOption[]>(
    availableBackends.map((backend) => ({
      value: backend,
      label: getBackendLabel(backend),
      meta: backend.includes('-api') ? 'API' : 'CLI',
      keywords: [backend],
    }))
  );

  const modelOptions = $derived<FilterSelectOption[]>(
    availableModels.map((model) => ({
      value: model.id,
      label: model.label,
      meta: model.tier === 'cheap' ? '$' : model.tier === 'strong' ? '$$$' : '$$',
      keywords: [model.id, model.tier],
    }))
  );

  async function loadModelsForBackend(backend: LlmBackend, forceRefresh = false): Promise<void> {
    modelDiscoveryLoading = true;
    try {
      const [apiSettings, discoverySettings] = await Promise.all([
        loadApiSettings(),
        loadModelDiscoverySettings(),
      ]);
      const models = await discoverModelsForBackend(backend, apiSettings, forceRefresh, discoverySettings);
      discoveredModels = { ...discoveredModels, [backend]: models };

      if (backend === appStore.selectedBackend && !models.some((model) => model.id === appStore.selectedModel)) {
        appStore.setModel(models[0]?.id ?? MODEL_OPTIONS[backend][0].id);
      }
    } catch (err) {
      console.error(`Failed to discover models for ${backend}:`, err);
    } finally {
      modelDiscoveryLoading = false;
    }
  }

  function handleBackendChange(value: string) {
    const backend = value as LlmBackend;
    appStore.setBackend(backend);

    // Auto-select first available model for new backend
    const models = discoveredModels[backend] || MODEL_OPTIONS[backend];
    if (models && models.length > 0) {
      appStore.setModel(models[0].id);
    }
    void loadModelsForBackend(backend, true);
  }

  function handleModelChange(value: string) {
    appStore.setModel(value);
  }

  $effect(() => {
    void loadModelsForBackend(appStore.selectedBackend);
  });

  async function handleSaveKey(provider: 'anthropic' | 'openai' | 'openrouter') {
    let key: string;
    let testResult: TestResult;

    if (provider === 'anthropic') {
      key = anthropicKey;
      testResult = anthropicTest;
    } else if (provider === 'openai') {
      key = openaiKey;
      testResult = openaiTest;
    } else {
      key = openrouterKey;
      testResult = openrouterTest;
    }

    if (!key.trim()) {
      await clearApiKey(provider);
      testResult.status = 'idle';
      testResult.message = 'Key cleared';
      return;
    }

    testResult.status = 'testing';
    testResult.message = 'Validating API key...';

    try {
      console.log(`Testing ${provider} API key...`);
      const result = await validateApiKey(provider, key);
      console.log(`${provider} validation result:`, result);

      if (result.valid) {
        await saveApiKey(provider, key);
        testResult.status = 'success';
        testResult.message = '✓ API key validated and saved';

        const providerBackend: LlmBackend = provider === 'anthropic'
          ? 'anthropic-api'
          : provider === 'openai'
            ? 'openai-api'
            : 'openrouter-api';
        void loadModelsForBackend(providerBackend, true);
      } else {
        testResult.status = 'error';
        testResult.message = result.error || 'Validation failed';
        console.error(`${provider} validation failed:`, result.error);
      }
    } catch (err) {
      console.error(`${provider} validation error:`, err);
      testResult.status = 'error';
      testResult.message = err instanceof Error ? err.message : String(err);
    }
  }

  function toggleShowKeys() {
    showKeys = !showKeys;
  }

  function parseListInput(value: string): string[] {
    return value
      .split(/[\n,]/g)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  function normalizeMaxResultsInput(value: string | number): number {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterDiscoveryMaxResults;
    }
    return Math.min(Math.max(parsed, 5), 100);
  }

  function applyDiscoverySettingsToInputs(settings: ModelDiscoverySettings): void {
    openaiExcludedTokensInput = settings.openaiExcludedTokens.join(', ');
    openaiRequireGpt5Family = settings.openaiRequireGpt5Family;
    openrouterManualModelsInput = settings.openrouterManualModels.join('\n');
    openrouterManualOnly = settings.openrouterManualOnly;
    openrouterDiscoveryMaxResultsInput = String(settings.openrouterDiscoveryMaxResults);
  }

  function currentDiscoverySettingsFromInputs(): ModelDiscoverySettings {
    return {
      openaiExcludedTokens: parseListInput(openaiExcludedTokensInput),
      openaiRequireGpt5Family,
      openrouterManualModels: parseListInput(openrouterManualModelsInput),
      openrouterManualOnly,
      openrouterDiscoveryMaxResults: normalizeMaxResultsInput(openrouterDiscoveryMaxResultsInput),
    };
  }

  async function handleSaveModelDiscoverySettings(): Promise<void> {
    modelDiscoverySaveStatus = 'saving';
    modelDiscoverySaveMessage = 'Saving filters...';

    try {
      const settings = currentDiscoverySettingsFromInputs();
      await saveModelDiscoverySettings(settings);
      applyDiscoverySettingsToInputs(settings);
      modelDiscoverySaveStatus = 'success';
      modelDiscoverySaveMessage = 'Model settings saved';

      // Refresh API-backed catalogs so model pickers reflect the new filters immediately.
      await loadModelsForBackend('openai-api', true);
      await loadModelsForBackend('openrouter-api', true);
      if (appStore.selectedBackend === 'anthropic-api') {
        await loadModelsForBackend('anthropic-api', true);
      }

      // Notify other surfaces (notably input header picker) to refresh their local
      // discovered-model state and selected model binding.
      window.dispatchEvent(new CustomEvent('modelCatalogUpdated'));
    } catch (err) {
      console.error('Failed to save model discovery settings:', err);
      modelDiscoverySaveStatus = 'error';
      modelDiscoverySaveMessage = err instanceof Error ? err.message : String(err);
    }
  }

  async function handleResetModelDiscoverySettings(): Promise<void> {
    applyDiscoverySettingsToInputs(DEFAULT_MODEL_DISCOVERY_SETTINGS);
    await handleSaveModelDiscoverySettings();
  }

  async function pasteFromClipboard(provider: 'anthropic' | 'openai' | 'openrouter') {
    try {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      const text = await readText();
      if (text) {
        if (provider === 'anthropic') {
          anthropicKey = text.trim();
        } else if (provider === 'openai') {
          openaiKey = text.trim();
        } else {
          openrouterKey = text.trim();
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  }

  async function recheckStoragePermission() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      storagePermissionGranted = await invoke<boolean>('check_storage_permission');
    } catch (e) {
      console.error('Permission check failed:', e);
    }
  }

  async function pickOutputDirectory() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, title: 'Choose PDF output folder' });
      if (selected) {
        outputDir = selected as string;
        await saveOutputDir(outputDir);
      }
    } catch (e) {
      console.error('Directory picker failed:', e);
    }
  }

  async function handleSaveOutputDir() {
    await saveOutputDir(outputDir);
  }

  function focusSelectTrigger(selectId: string): boolean {
    const trigger = document.getElementById(`${selectId}-trigger`) as HTMLButtonElement | null;
    if (!trigger) return false;
    trigger.focus();
    return true;
  }

  function handleShortcutKeydown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const modKey = event.ctrlKey || event.metaKey;
    if (!modKey || !event.shiftKey) return;

    if (key === 'm') {
      event.preventDefault();
      focusSelectTrigger('model-picker');
      return;
    }

    if (key === 'b') {
      event.preventDefault();
      focusSelectTrigger('backend-picker');
    }
  }

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
</script>

<svelte:window onkeydown={handleShortcutKeydown} />

<div class="settings-panel">
  <div class="settings-header">
    <h2>Settings</h2>
    {#if onClose}
      <button class="close-btn" onclick={onClose}>✕</button>
    {/if}
  </div>

  <div class="settings-content">
    <!-- Backend Selection -->
    <section class="settings-section">
      <h3>LLM Backend</h3>
      <p class="help-text shortcut-note">
        Keyboard: Tab cycles these pickers. Ctrl/Cmd+Shift+M focuses model, Ctrl/Cmd+Shift+B focuses backend.
      </p>
      <div class="picker-row">
        <FilterableSelect
          id="backend-picker"
          label="Backend"
          options={backendOptions}
          selectedValue={appStore.selectedBackend}
          searchPlaceholder="Filter backends..."
          onChange={handleBackendChange}
        />
      </div>

      <div class="picker-row">
        <FilterableSelect
          id="model-picker"
          label="Model"
          options={modelOptions}
          selectedValue={appStore.selectedModel}
          searchPlaceholder="Filter models..."
          onChange={handleModelChange}
        />
      </div>

      <div class="discovery-row">
        <span class="discovery-note">
          {modelDiscoveryLoading ? 'Refreshing live model list...' : 'Model list comes from provider endpoints when available.'}
        </span>
        <button
          class="btn-secondary"
          type="button"
          onclick={() => loadModelsForBackend(appStore.selectedBackend, true)}
          disabled={modelDiscoveryLoading}
        >
          {modelDiscoveryLoading ? 'Refreshing...' : 'Refresh Models'}
        </button>
      </div>

      {#if !isDesktop(platform)}
        <p class="mobile-note">
          CLI backends (claude, codex) are not available on mobile. Use API backends.
        </p>
      {/if}
    </section>

    <!-- Model Discovery Filters -->
    {#if modelDiscoverySettingsLoaded}
      <section class="settings-section">
        <h3>Model Discovery Filters</h3>
        <p class="help-text discovery-help">
          OpenRouter supports direct manual model IDs. OpenAI keeps lightweight filters.
        </p>

        <div class="form-row form-row-stack">
          <label for="openai-excluded-tokens">OpenAI excluded tokens</label>
          <input
            id="openai-excluded-tokens"
            type="text"
            bind:value={openaiExcludedTokensInput}
            placeholder="latest, pro, codex"
          />
        </div>

        <label class="checkbox-row">
          <input type="checkbox" bind:checked={openaiRequireGpt5Family} />
          <span>Only include GPT-5 family for OpenAI</span>
        </label>

        <div class="form-row form-row-stack">
          <label for="openrouter-manual-models">OpenRouter model IDs (one per line)</label>
          <textarea
            id="openrouter-manual-models"
            bind:value={openrouterManualModelsInput}
            rows={4}
            placeholder="openai/gpt-oss-120b:free&#10;moonshotai/kimi-k2-thinking:nitro&#10;qwen/qwen3.6-plus:free"
          ></textarea>
        </div>

        <label class="checkbox-row">
          <input type="checkbox" bind:checked={openrouterManualOnly} />
          <span>Use only manual OpenRouter model IDs</span>
        </label>

        <div class="form-row">
          <label for="openrouter-max-results">OpenRouter discovery max results</label>
          <input
            id="openrouter-max-results"
            type="number"
            min="5"
            max="100"
            bind:value={openrouterDiscoveryMaxResultsInput}
          />
        </div>

        <div class="discovery-actions">
          <button class="btn-primary" type="button" onclick={handleSaveModelDiscoverySettings} disabled={modelDiscoverySaveStatus === 'saving'}>
            {modelDiscoverySaveStatus === 'saving' ? 'Saving...' : 'Save Filters'}
          </button>
          <button class="btn-secondary" type="button" onclick={handleResetModelDiscoverySettings} disabled={modelDiscoverySaveStatus === 'saving'}>
            Reset Defaults
          </button>
        </div>

        {#if modelDiscoverySaveStatus !== 'idle'}
          <span class="status status-{modelDiscoverySaveStatus}">{modelDiscoverySaveMessage}</span>
        {/if}
      </section>
    {/if}

    <!-- Resume Mode -->
    <section class="settings-section">
      <h3>Resume Mode</h3>
      <div class="form-row">
        <label for="mode-select">Mode:</label>
        <select id="mode-select" value={appStore.resumeMode} onchange={(e) => appStore.setResumeMode((e.target as HTMLSelectElement).value as import('$lib/types').ResumeMode)}>
          {#each RESUME_MODE_DEFINITIONS as mode}
            <option value={mode.id}>{mode.label}</option>
          {/each}
        </select>
      </div>
      <p class="mode-note">
        {RESUME_MODE_MAP[appStore.resumeMode || DEFAULT_RESUME_MODE].description}
      </p>
    </section>

    <!-- Storage (mobile only) -->
    {#if isMobile(platform) && outputDirLoaded}
      <section class="settings-section">
        <h3>Storage</h3>

        <div class="storage-status">
          {#if storagePermissionGranted === null}
            <span class="status status-testing">Checking permissions...</span>
          {:else if storagePermissionGranted}
            <span class="status status-success">File access granted</span>
          {:else}
            <span class="status status-error">File access not granted</span>
            <p class="mobile-note">
              CoverPro needs "All files access" to save PDFs. If the permission dialog didn't appear on launch, go to Android Settings &gt; Apps &gt; CoverPro &gt; Permissions.
            </p>
            <button class="btn-primary" onclick={recheckStoragePermission}>Re-check permission</button>
          {/if}
        </div>

        <div class="form-row" style="margin-top: 1rem;">
          <label for="output-dir">Save PDFs to:</label>
          <input
            id="output-dir"
            type="text"
            bind:value={outputDir}
            onblur={handleSaveOutputDir}
            style="flex: 1; padding: 0.5rem; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 0.875rem;"
          />
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
          <button class="btn-secondary" onclick={pickOutputDirectory}>Browse...</button>
          <button class="btn-primary" onclick={handleSaveOutputDir}>Save</button>
        </div>
      </section>
    {/if}

    <!-- API Keys -->
    {#if keysLoaded}
      <section class="settings-section">
        <div class="section-header">
          <h3>API Keys</h3>
          <button class="toggle-visibility" onclick={toggleShowKeys}>
            {showKeys ? '🙈 Hide' : '👁️ Show'}
          </button>
        </div>

        <!-- Anthropic API Key -->
        <div class="key-input">
          <label for="anthropic-key">Anthropic API Key:</label>
          <div class="key-input-row">
            <input
              id="anthropic-key"
              type={showKeys ? 'text' : 'password'}
              bind:value={anthropicKey}
              placeholder="sk-ant-..."
            />
            <button class="btn-secondary" onclick={() => pasteFromClipboard('anthropic')}>
              Paste
            </button>
          </div>
          <button class="btn-primary" onclick={() => handleSaveKey('anthropic')}>
            {anthropicTest.status === 'testing' ? 'Testing...' : 'Save & Test'}
          </button>
          {#if anthropicTest.status !== 'idle'}
            <span class="status status-{anthropicTest.status}">{anthropicTest.message}</span>
          {/if}
        </div>

        <!-- OpenAI API Key -->
        <div class="key-input">
          <label for="openai-key">OpenAI API Key:</label>
          <div class="key-input-row">
            <input
              id="openai-key"
              type={showKeys ? 'text' : 'password'}
              bind:value={openaiKey}
              placeholder="sk-..."
            />
            <button class="btn-secondary" onclick={() => pasteFromClipboard('openai')}>
              Paste
            </button>
          </div>
          <button class="btn-primary" onclick={() => handleSaveKey('openai')}>
            {openaiTest.status === 'testing' ? 'Testing...' : 'Save & Test'}
          </button>
          {#if openaiTest.status !== 'idle'}
            <span class="status status-{openaiTest.status}">{openaiTest.message}</span>
          {/if}
        </div>

        <!-- OpenRouter API Key -->
        <div class="key-input">
          <label for="openrouter-key">OpenRouter API Key:</label>
          <div class="key-input-row">
            <input
              id="openrouter-key"
              type={showKeys ? 'text' : 'password'}
              bind:value={openrouterKey}
              placeholder="sk-or-..."
            />
            <button class="btn-secondary" onclick={() => pasteFromClipboard('openrouter')}>
              Paste
            </button>
          </div>
          <button class="btn-primary" onclick={() => handleSaveKey('openrouter')}>
            {openrouterTest.status === 'testing' ? 'Testing...' : 'Save & Test'}
          </button>
          {#if openrouterTest.status !== 'idle'}
            <span class="status status-{openrouterTest.status}">{openrouterTest.message}</span>
          {/if}
        </div>

        <p class="help-text">
          Keys are stored encrypted on disk. Get your API keys from:
          <a href="https://console.anthropic.com" target="_blank" rel="noopener">Anthropic Console</a>,
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI Platform</a>, or
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">OpenRouter</a>.
        </p>
      </section>
    {/if}
  </div>
</div>

<style>
  .settings-panel {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-color);
    position: sticky;
    top: 0;
    background: var(--bg-primary);
    z-index: 1;
  }

  .settings-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 0.25rem 0.5rem;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--text-primary);
  }

  .settings-content {
    padding: 1.5rem;
  }

  .settings-section {
    margin-bottom: 2rem;
  }

  .settings-section:last-child {
    margin-bottom: 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .settings-section h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: var(--text-primary);
    font-weight: 600;
  }

  .section-header h3 {
    margin: 0;
  }

  .picker-row {
    margin-bottom: 0.85rem;
  }

  .discovery-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0.5rem 0 0.75rem;
  }

  .discovery-note {
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .form-row label {
    min-width: 80px;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .form-row-stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.4rem;
  }

  .form-row-stack label {
    min-width: 0;
  }

  .form-row-stack input,
  .form-row-stack textarea {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: 'JetBrains Mono', monospace;
  }

  .form-row-stack textarea {
    resize: vertical;
    min-height: 4.5rem;
  }

  .form-row input[type='number'] {
    max-width: 140px;
    padding: 0.5rem;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.9rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .checkbox-row input[type='checkbox'] {
    accent-color: var(--accent-color);
  }

  .discovery-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.35rem;
    flex-wrap: wrap;
  }

  .discovery-help {
    margin-top: 0;
    margin-bottom: 0.75rem;
  }

  .shortcut-note {
    margin-top: -0.4rem;
    margin-bottom: 0.8rem;
  }

  .form-row select {
    flex: 1;
    padding: 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .key-input {
    margin-bottom: 1.5rem;
  }

  .key-input label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .key-input-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .key-input-row input {
    flex: 1;
    padding: 0.5rem;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: 'JetBrains Mono', monospace;
  }

  .key-input input {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 0.5rem;
  }

  .btn-primary {
    background: var(--accent-color);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .btn-primary:hover {
    background: var(--accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .btn-secondary:hover {
    background: var(--bg-hover);
  }

  .toggle-visibility {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .toggle-visibility:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .status {
    display: block;
    margin-top: 0.5rem;
    font-size: 0.875rem;
  }

  .status-idle {
    color: var(--text-secondary);
  }
  .status-testing {
    color: var(--text-secondary);
  }
  .status-success {
    color: rgb(var(--color-success-500));
  }
  .status-error {
    color: rgb(var(--color-error-500));
  }

  .mobile-note {
    margin-top: 1rem;
    padding: 0.75rem;
    background: rgb(var(--color-warning-500) / 0.1);
    border-left: 3px solid rgb(var(--color-warning-500));
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .mode-note {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  .help-text {
    margin-top: 1rem;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .help-text a {
    color: var(--accent-color);
    text-decoration: none;
  }

  .help-text a:hover {
    text-decoration: underline;
  }
</style>
