<script lang="ts">
  import { appStore } from '$lib/stores/app.svelte';
  import { rerunJobs } from '$lib/services/runner';
  import { splitPackage, markdownToHtml } from '$lib/utils/markdown';
  import type { CopyTarget } from '$lib/types';

  // Re-run state
  let selectedForRerun = $state<Set<number>>(new Set());
  let customInstructions = $state('');
  let isRerunning = $state(false);
  let showRerunModal = $state(false);
  let customInstructionsRef = $state<HTMLTextAreaElement | null>(null);

  function toggleRerunSelection(jobId: number) {
    if (selectedForRerun.has(jobId)) {
      selectedForRerun.delete(jobId);
    } else {
      selectedForRerun.add(jobId);
    }
    selectedForRerun = new Set(selectedForRerun);
  }

  function selectAllForRerun() {
    if (!appStore.currentRun) return;
    selectedForRerun = new Set(appStore.currentRun.jobs.map(j => j.id));
  }

  function clearRerunSelection() {
    selectedForRerun = new Set();
    customInstructions = '';
  }

  function openRerunModal() {
    if (!appStore.currentRun || selectedForRerun.size === 0 || isRerunning || appStore.isRunning) return;
    showRerunModal = true;
  }

  function closeRerunModal() {
    showRerunModal = false;
  }

  $effect(() => {
    if (showRerunModal && !isRerunning) {
      queueMicrotask(() => customInstructionsRef?.focus());
    }
  });

  function handleModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRerunModal();
    }
  }

  async function handleRerun() {
    if (!appStore.currentRun || selectedForRerun.size === 0) return;

    isRerunning = true;
    try {
      await rerunJobs(appStore.currentRun, Array.from(selectedForRerun), customInstructions);
      clearRerunSelection();
    } catch (error) {
      console.error('Re-run failed:', error);
    } finally {
      isRerunning = false;
      showRerunModal = false;
    }
  }

  async function copyHtml(target: CopyTarget) {
    const job = appStore.currentJob;
    if (!job?.markdown) return;

    let markdown = job.markdown;

    if (target === 'resume') {
      markdown = splitPackage(job.markdown).resume;
    } else if (target === 'cover-letter') {
      markdown = splitPackage(job.markdown).coverLetter;
    }

    const html = markdownToHtml(markdown);
    const plainText = markdown;

    try {
      // Try to use clipboard API with HTML
      const blob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      const data = new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob,
      });
      await navigator.clipboard.write([data]);
    } catch {
      // Fallback to plain text
      await navigator.clipboard.writeText(plainText);
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'queued': return 'Queued';
      case 'running': return 'Running...';
      case 'linting': return 'Linting...';
      case 'fixing': return 'Fixing...';
      case 'done': return 'Complete';
      case 'error': return 'Error';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  }
</script>

<div class="output-panel">
  {#if !appStore.currentRun}
    <div class="empty-state">
      <p>Select a run from the sidebar or start a new run</p>
    </div>
  {:else if !appStore.currentJob}
    <div class="empty-state">
      <p>Select a job to view its output</p>
    </div>
  {:else}
    <div class="panel-header">
      <div class="job-info">
        <h2>{appStore.currentJob.input.jobTitle}</h2>
        <span class="company">{appStore.currentJob.input.company}</span>
        <div class="status-row">
          {#if appStore.currentJob.roleFitTier}
            <span class="tier-badge tier-{appStore.currentJob.roleFitTier}">
              {appStore.currentJob.roleFitTier === 'tier1' ? '✓ Tier 1' :
               appStore.currentJob.roleFitTier === 'tier2' ? '○ Tier 2' : '⚠ Tier 3'}
            </span>
          {/if}
          <span class="status status-{appStore.currentJob.status}">
            {appStore.currentJob.statusDetail || getStatusLabel(appStore.currentJob.status)}
          </span>
        </div>
        {#if appStore.currentJob.roleFitWarnings && appStore.currentJob.roleFitWarnings.length > 0}
          <div class="role-fit-warnings">
            {#each appStore.currentJob.roleFitWarnings as warning}
              <span class="warning-tag">{warning}</span>
            {/each}
          </div>
        {/if}
      </div>

      <div class="copy-actions">
        <button onclick={() => copyHtml('full')} disabled={!appStore.currentJob.html}>
          Copy All (HTML)
        </button>
        <button onclick={() => copyHtml('resume')} disabled={!appStore.currentJob.html}>
          Copy Resume
        </button>
        <button onclick={() => copyHtml('cover-letter')} disabled={!appStore.currentJob.html}>
          Copy Cover Letter
        </button>
      </div>
    </div>

    <div class="job-tabs-row">
      <div class="job-tabs">
        {#each appStore.currentRun.jobs as job}
          <div class="job-tab-wrapper">
            <input
              type="checkbox"
              class="rerun-checkbox"
              checked={selectedForRerun.has(job.id)}
              onchange={() => toggleRerunSelection(job.id)}
              disabled={isRerunning || appStore.isRunning}
              title="Select for re-run"
            />
            <button
              class="job-tab"
              class:active={appStore.currentJobId === job.id}
              class:selected-rerun={selectedForRerun.has(job.id)}
              class:has-warning={job.badFitWarning || job.roleFitTier === 'tier3_avoid'}
              class:has-error={job.status === 'error'}
              onclick={() => appStore.selectJob(job.id)}
            >
              {#if ['running', 'linting', 'fixing'].includes(job.status)}
                <span class="tab-spinner"></span>
              {:else if job.status === 'done'}
                <span class="tab-dot dot-done">✓</span>
              {:else if job.status === 'error'}
                <span class="tab-dot dot-error">✕</span>
              {:else if job.status === 'cancelled'}
                <span class="tab-dot dot-cancelled">—</span>
              {/if}
              {job.input.jobTitle || `Job ${job.id}`}
            </button>
          </div>
        {/each}
      </div>
      {#if selectedForRerun.size > 0}
        <div class="rerun-actions-mini">
          <span class="selected-count">{selectedForRerun.size} selected</span>
          <button class="clear-selection-btn" onclick={clearRerunSelection}>Clear</button>
        </div>
      {/if}
    </div>

    {#if selectedForRerun.size > 0}
      <div class="rerun-panel">
        <div class="rerun-buttons">
          <button class="select-all-btn" onclick={selectAllForRerun} disabled={isRerunning}>
            Select All
          </button>
          <button
            class="rerun-btn"
            onclick={openRerunModal}
            disabled={isRerunning || appStore.isRunning}
          >
            {isRerunning ? 'Re-running...' : `Re-run ${selectedForRerun.size} Job${selectedForRerun.size > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    {/if}

    <div class="output-content">
      {#if appStore.currentJob.status === 'error'}
        <div class="error-state">
          <h3>Error</h3>
          <p>{appStore.currentJob.error || 'An unknown error occurred'}</p>
        </div>
      {:else if appStore.currentJob.status === 'done' && appStore.currentJob.html}
        {#if appStore.currentJob.badFitWarning}
          <div class="bad-fit-warning">
            <strong>Bad Fit Possible</strong>
            <span>Agent needed {appStore.currentJob.repairAttempts} repair attempts. Experience may not map well to this JD.</span>
          </div>
        {/if}
        <div class="markdown-output">
          {@html appStore.currentJob.html}
        </div>
      {:else if ['running', 'linting', 'fixing'].includes(appStore.currentJob.status)}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>{appStore.currentJob.statusDetail || getStatusLabel(appStore.currentJob.status)}</p>
        </div>
      {:else}
        <div class="empty-state">
          <p>Output will appear here when the job completes</p>
        </div>
      {/if}

      {#if appStore.currentJob.lintErrors && appStore.currentJob.lintErrors.length > 0}
        <div class="lint-panel">
          <h4>Lint Issues</h4>
          <ul>
            {#each appStore.currentJob.lintErrors as error}
              <li class="lint-{error.severity}">
                <strong>{error.block}</strong>: {error.message}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if showRerunModal}
  <button type="button" class="modal-backdrop" onclick={closeRerunModal} aria-label="Close re-run modal"></button>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="rerun-modal-title"
    tabindex="0"
    onkeydown={handleModalKeydown}
    onclick={(event) => event.stopPropagation()}
  >
    <div class="modal-header">
      <h3 id="rerun-modal-title">Re-run with follow-up</h3>
      <button class="modal-close" onclick={closeRerunModal} aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <label for="custom-instructions">Additional instructions (optional)</label>
      <textarea
        bind:this={customInstructionsRef}
        id="custom-instructions"
        placeholder="e.g., 'Make the summary punchier' or 'Emphasize leadership experience more'"
        bind:value={customInstructions}
        disabled={isRerunning}
      ></textarea>
    </div>
    <div class="modal-actions">
      <button class="ghost-btn" onclick={closeRerunModal} disabled={isRerunning}>Cancel</button>
      <button class="rerun-btn" onclick={handleRerun} disabled={isRerunning || appStore.isRunning}>
        {isRerunning ? 'Re-running...' : `Re-run ${selectedForRerun.size} Job${selectedForRerun.size > 1 ? 's' : ''}`}
      </button>
    </div>
  </div>
{/if}

<style>
  .output-panel {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 1rem;
  }

  .panel-header {
    padding: var(--space-lg) var(--space-xl);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-lg);
  }

  .job-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .job-info h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .company {
    color: var(--text-muted);
    font-size: 0.95rem;
  }

  .status {
    font-size: 0.85rem;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    width: fit-content;
    font-weight: 500;
  }

  .status-done { background: #22c55e15; color: #16a34a; }
  .status-error { background: #ef444415; color: #dc2626; }
  .status-running, .status-linting, .status-fixing { background: #3b82f615; color: #2563eb; }
  .status-queued { background: #6b728015; color: #4b5563; }

  .status-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .tier-badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-weight: 600;
  }

  .tier-tier1 { background: #22c55e20; color: #16a34a; }
  .tier-tier2 { background: #f59e0b20; color: #d97706; }
  .tier-tier3_avoid { background: #ef444420; color: #dc2626; }

  .role-fit-warnings {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
  }

  .warning-tag {
    font-size: 0.75rem;
    padding: 2px 6px;
    background: #ef444415;
    color: #dc2626;
    border-radius: var(--radius-sm);
  }

  .copy-actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .copy-actions button {
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-primary);
    font-weight: 500;
  }

  .copy-actions button:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .copy-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .job-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color);
    padding: 0 var(--space-xl);
    gap: var(--space-xs);
  }

  .job-tab {
    padding: var(--space-md) var(--space-lg);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.95rem;
    font-weight: 500;
  }

  .job-tab:hover {
    color: var(--text-primary);
  }

  .job-tab.active {
    color: var(--accent-color);
    border-bottom-color: var(--accent-color);
  }

  .output-content {
    flex: 1;
    min-height: 0;
    min-width: 0;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--space-xl);
  }

  .markdown-output {
    width: 100%;
    max-width: 800px;
    line-height: 1.7;
    overflow-wrap: break-word;
    word-wrap: break-word;
  }

  .markdown-output :global(h1) { font-size: 1.5rem; margin: var(--space-xl) 0 var(--space-md); font-weight: 600; }
  .markdown-output :global(h2) { font-size: 1.25rem; margin: var(--space-xl) 0 var(--space-md); font-weight: 600; color: var(--text-primary); }
  .markdown-output :global(h3) { font-size: 1.1rem; margin: var(--space-lg) 0 var(--space-sm); font-weight: 600; }
  .markdown-output :global(ul) { padding-left: var(--space-xl); margin: var(--space-md) 0; }
  .markdown-output :global(li) { margin: var(--space-sm) 0; }
  .markdown-output :global(p) { margin: var(--space-md) 0; }

  .loading-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-lg);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-color);
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-state {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    color: #b91c1c;
  }

  .bad-fit-warning {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: var(--radius-lg);
    padding: var(--space-md) var(--space-lg);
    margin-bottom: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .bad-fit-warning strong {
    color: #b45309;
    font-size: 1rem;
  }

  .bad-fit-warning span {
    color: #92400e;
    font-size: 0.9rem;
  }

  .error-state h3 {
    margin: 0 0 var(--space-sm);
  }

  .lint-panel {
    margin-top: var(--space-xl);
    padding: var(--space-lg);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }

  .lint-panel h4 {
    margin: 0 0 var(--space-md);
    font-size: 1rem;
    font-weight: 600;
  }

  .lint-panel ul {
    margin: 0;
    padding-left: var(--space-xl);
    font-size: 0.9rem;
  }

  .lint-panel li {
    margin: var(--space-xs) 0;
  }

  .lint-error { color: #b91c1c; }
  .lint-warning { color: #b45309; }

  /* Re-run selection styles */
  .job-tabs-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-color);
    padding: 0 var(--space-xl);
  }

  .job-tabs {
    display: flex;
    gap: var(--space-xs);
    border-bottom: none;
    padding: 0;
  }

  .job-tab-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .rerun-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--accent-color);
  }

  .rerun-checkbox:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .job-tab.selected-rerun {
    background: var(--bg-active);
  }

  .job-tab.has-warning {
    border-left: 3px solid #f59e0b;
  }

  .job-tab.has-error {
    border-left: 3px solid #ef4444;
  }

  .tab-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    opacity: 0.7;
    vertical-align: middle;
    margin-right: 5px;
  }

  .tab-dot {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 700;
    vertical-align: middle;
    margin-right: 4px;
  }

  .dot-done { color: #16a34a; }
  .dot-error { color: #dc2626; }
  .dot-cancelled { color: #9ca3af; }

  .rerun-actions-mini {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .selected-count {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .clear-selection-btn {
    padding: var(--space-xs) var(--space-sm);
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .clear-selection-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .rerun-panel {
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: flex-end;
    min-width: 0;
  }

  .rerun-buttons {
    display: flex;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .select-all-btn {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-primary);
  }

  .select-all-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .select-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .rerun-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .rerun-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .rerun-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 50;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, 92vw);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .modal-close {
    background: transparent;
    border: none;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--text-muted);
    cursor: pointer;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .modal-body label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .modal-body textarea {
    width: 100%;
    box-sizing: border-box;
    min-height: 120px;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;
    line-height: 1.5;
  }

  .modal-body textarea:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .modal-body textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  .ghost-btn {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-primary);
  }

  .ghost-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .ghost-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
