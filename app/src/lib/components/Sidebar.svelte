<script lang="ts">
  import { appStore } from '$lib/stores/app.svelte';
  import type { RunIndexEntry } from '$lib/types';

  let expandedRuns = $state<Set<string>>(new Set());

  function toggleRun(runId: string) {
    if (expandedRuns.has(runId)) {
      expandedRuns.delete(runId);
    } else {
      expandedRuns.add(runId);
    }
    expandedRuns = new Set(expandedRuns);
  }

  function selectJob(runId: string, jobId: number) {
    appStore.selectRun(runId);
    appStore.selectJob(jobId);
  }

  function getStatusClass(status: string): string {
    switch (status) {
      case 'done': return 'status-done';
      case 'error': return 'status-error';
      case 'running': return 'status-running';
      case 'linting':
      case 'fixing': return 'status-processing';
      default: return 'status-queued';
    }
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2>Runs</h2>
    <button class="new-run-btn" onclick={() => appStore.currentRunId = null}>
      + New Run
    </button>
  </div>

  <div class="runs-list">
    {#if appStore.runs.length === 0}
      <p class="empty-state">No runs yet</p>
    {:else}
      {#each appStore.runs as run}
        <div class="run-item" class:active={appStore.currentRunId === run.id}>
          <button
            class="run-header"
            onclick={() => toggleRun(run.id)}
          >
            <span class="expand-icon">{expandedRuns.has(run.id) ? '▼' : '▶'}</span>
            <span class="run-label">{run.label}</span>
          </button>

          {#if expandedRuns.has(run.id)}
            <div class="job-list">
              {#each run.jobSummaries as job}
                <button
                  class="job-item"
                  class:active={appStore.currentRunId === run.id && appStore.currentJobId === job.id}
                  onclick={() => selectJob(run.id, job.id)}
                >
                  <span class="job-title">{job.title}</span>
                  <span class="job-company">{job.company}</span>
                  <span class={`job-status ${getStatusClass(job.status)}`}></span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: 300px;
    min-width: 300px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .sidebar-header {
    padding: var(--space-lg);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .new-run-btn {
    padding: var(--space-sm) var(--space-md);
    font-size: 0.9rem;
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 500;
  }

  .new-run-btn:hover {
    background: var(--accent-hover);
  }

  .runs-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
  }

  .empty-state {
    color: var(--text-muted);
    text-align: center;
    padding: 2rem;
    font-size: 0.9rem;
  }

  .run-item {
    margin-bottom: var(--space-xs);
  }

  .run-item.active > .run-header {
    background: var(--bg-active);
  }

  .run-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
  }

  .run-header:hover {
    background: var(--bg-hover);
  }

  .expand-icon {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .run-label {
    flex: 1;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .job-list {
    padding-left: var(--space-xl);
    padding-top: var(--space-xs);
    padding-bottom: var(--space-xs);
  }

  .job-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  .job-item:hover {
    background: var(--bg-hover);
  }

  .job-item.active {
    background: var(--bg-active);
  }

  .job-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .job-company {
    color: var(--text-muted);
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 80px;
  }

  .job-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-done { background: #22c55e; }
  .status-error { background: #ef4444; }
  .status-running { background: #3b82f6; animation: pulse 1s infinite; }
  .status-processing { background: #f59e0b; animation: pulse 1s infinite; }
  .status-queued { background: #6b7280; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
