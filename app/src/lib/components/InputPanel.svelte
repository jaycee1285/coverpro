<script lang="ts">
  import { appStore, type LlmBackend } from '$lib/stores/app.svelte';

  let { onRunNow }: { onRunNow: () => void } = $props();

  function canRun(): boolean {
    // At least one job must have JD text (title/company are optional - parsed from JD)
    return appStore.jobInputs.some(job => job.jdText.trim());
  }

  function handleBackendChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    appStore.setBackend(select.value as LlmBackend);
  }
</script>

<div class="input-panel">
  <div class="panel-header">
    <h2>New Run</h2>
    <div class="header-actions">
      <select
        class="backend-select"
        value={appStore.selectedBackend}
        onchange={handleBackendChange}
        disabled={appStore.isRunning}
      >
        <option value="claude">Claude</option>
        <option value="codex">Codex</option>
      </select>
      <button class="clear-btn" onclick={() => appStore.resetInputs()}>Clear All</button>
      <button
        class="run-btn"
        disabled={!canRun() || appStore.isRunning}
        onclick={onRunNow}
      >
        {appStore.isRunning ? 'Running...' : 'Run Now'}
      </button>
    </div>
  </div>

  <div class="jobs-grid">
    {#each appStore.jobInputs as job, index}
      <div class="job-card">
        <div class="job-card-header">
          <span class="job-number">Job {index + 1}</span>
        </div>

        <div class="job-fields">
          <div class="field">
            <label for="title-{index}">Job Title (optional)</label>
            <input
              id="title-{index}"
              type="text"
              placeholder="Parsed from JD"
              value={job.jobTitle}
              oninput={(e) => appStore.updateJobInput(index, 'jobTitle', e.currentTarget.value)}
            />
          </div>

          <div class="field">
            <label for="company-{index}">Company (optional)</label>
            <input
              id="company-{index}"
              type="text"
              placeholder="Parsed from JD"
              value={job.company}
              oninput={(e) => appStore.updateJobInput(index, 'company', e.currentTarget.value)}
            />
          </div>

          <div class="field field-full">
            <label for="jd-{index}">Job Description</label>
            <textarea
              id="jd-{index}"
              placeholder="Paste job description..."
              value={job.jdText}
              oninput={(e) => appStore.updateJobInput(index, 'jdText', e.currentTarget.value)}
            ></textarea>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .input-panel {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .panel-header {
    padding: var(--space-lg) var(--space-xl);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .backend-select {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .backend-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .clear-btn {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  .clear-btn:hover {
    background: var(--bg-hover);
  }

  .run-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 500;
    font-size: 0.9rem;
  }

  .run-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .jobs-grid {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: var(--space-xl);
    overflow-y: auto;
  }

  .job-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .job-card-header {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .job-number {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .job-fields {
    padding: var(--space-lg);
    display: grid;
    grid-template-columns: 1fr 1fr 2fr;
    gap: var(--space-md);
    flex: 1;
    align-items: start;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .field-full {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  input {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  textarea {
    flex: 1;
    min-height: 80px;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.9rem;
    resize: none;
    font-family: inherit;
    line-height: 1.5;
  }

  textarea:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
</style>
