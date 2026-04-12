<script lang="ts">
  import { appStore } from '$lib/stores/app.svelte';
  import type { JobInput } from '$lib/types';

  let { onClose, onLoad }: { onClose: () => void; onLoad: (filename: string, batchLabel: string) => void } = $props();

  type ParsedJob = {
    jobTitle: string;
    company: string;
    jdText: string;
    url?: string;
    location?: string;
    tier?: string;
  };

  let fileName = $state('');
  let allJobs = $state<ParsedJob[]>([]);
  let currentPage = $state(0);
  let parseError = $state('');
  let fileInput = $state<HTMLInputElement | null>(null);

  let totalPages = $derived(Math.ceil(allJobs.length / 4));
  let pageJobs = $derived(allJobs.slice(currentPage * 4, currentPage * 4 + 4));
  let batchLabel = $derived(String.fromCharCode(65 + currentPage)); // A, B, C...

  function handleFileSelect() {
    fileInput?.click();
  }

  async function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    fileName = file.name;
    parseError = '';
    currentPage = 0;

    const text = await file.text();

    try {
      if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        allJobs = parseHtml(text);
      } else if (file.name.endsWith('.md')) {
        allJobs = parseMarkdown(text);
      } else {
        // Try HTML first, then markdown
        allJobs = parseHtml(text);
        if (allJobs.length === 0) allJobs = parseMarkdown(text);
      }

      if (allJobs.length === 0) {
        parseError = 'No jobs found in file. Expected coverpro-batch, job-data JSON, or markdown with ## headings.';
      }
    } catch (err) {
      parseError = `Failed to parse: ${err instanceof Error ? err.message : 'Unknown error'}`;
      allJobs = [];
    }

    // Reset input so the same file can be re-selected
    input.value = '';
  }

  function parseHtml(html: string): ParsedJob[] {
    // Try coverpro-batch format first (from jobtriage)
    const batchMatch = html.match(/<!--\s*<coverpro-batch>([\s\S]*?)<\/coverpro-batch>\s*-->/);
    if (batchMatch) {
      const jobs = JSON.parse(batchMatch[1]);
      return jobs.map((j: any) => ({
        jobTitle: j.jobTitle || j.title || '',
        company: j.company || '',
        jdText: j.jdText || j.description || '',
        url: j.url || '',
        location: j.location || '',
        tier: j.tier || '',
      }));
    }

    // Try job-data format (from browser extension)
    const dataMatch = html.match(/<!--\s*<job-data>([\s\S]*?)<\/job-data>\s*-->/);
    if (dataMatch) {
      const jobs = JSON.parse(dataMatch[1]);
      return jobs.map((j: any) => ({
        jobTitle: j.title || j.jobTitle || '',
        company: j.company || '',
        jdText: j.description || j.jdText || '',
        url: j.url || '',
        location: j.location || '',
      }));
    }

    return [];
  }

  function parseMarkdown(md: string): ParsedJob[] {
    const jobs: ParsedJob[] = [];
    const sections = md.split(/^## \d+\.\s*/m).slice(1);

    for (const section of sections) {
      const lines = section.split('\n');
      const title = lines[0]?.trim() || '';
      const company = section.match(/\*\*Company:\*\*\s*(.+)/)?.[1]?.trim() || '';
      const location = section.match(/\*\*Location:\*\*\s*(.+)/)?.[1]?.trim() || '';
      const url = section.match(/\*\*URL:\*\*\s*(.+)/)?.[1]?.trim() || '';
      const tier = section.match(/\*\*Tier:\*\*\s*(.+)/)?.[1]?.trim() || '';

      // JD text: everything after "### Job Description" or after the metadata block
      let jdText = '';
      const jdMatch = section.match(/### Job Description\n\n([\s\S]*?)(?=\n---|\n## |$)/);
      if (jdMatch) {
        jdText = jdMatch[1].trim();
      } else {
        // Fallback: grab everything after the last metadata line (lines starting with -)
        const metaEnd = lines.findIndex((l, i) => i > 0 && l.trim() === '');
        if (metaEnd > 0) {
          const afterMeta = lines.slice(metaEnd + 1).join('\n').replace(/^---\s*$/m, '').trim();
          if (afterMeta.length > 50) jdText = afterMeta;
        }
      }

      if (title || jdText) {
        jobs.push({ jobTitle: title, company, jdText, url, location, tier });
      }
    }

    return jobs;
  }

  function loadBatch() {
    const batch = pageJobs;
    for (let i = 0; i < 4; i++) {
      if (i < batch.length) {
        appStore.jobInputs[i] = {
          jobTitle: batch[i].jobTitle,
          company: batch[i].company,
          jdText: batch[i].jdText,
        };
      } else {
        appStore.jobInputs[i] = { jobTitle: '', company: '', jdText: '' };
      }
    }
    onLoad(fileName, batchLabel);
    onClose();
  }

  function loadSingleJob(jobIndex: number, slotIndex: number) {
    const job = allJobs[currentPage * 4 + jobIndex];
    if (!job) return;
    appStore.jobInputs[slotIndex] = {
      jobTitle: job.jobTitle,
      company: job.company,
      jdText: job.jdText,
    };
  }
</script>

<button
  type="button"
  class="backdrop"
  aria-label="Close queue import"
  onclick={onClose}
></button>

<div class="drawer" role="dialog" aria-modal="true" aria-labelledby="queue-title">
  <div class="drawer-header">
    <h3 id="queue-title">Import Jobs</h3>
    <button class="close-btn" onclick={onClose} aria-label="Close">&times;</button>
  </div>

  <div class="drawer-body">
    <!-- File picker -->
    <div class="file-section">
      <button class="file-btn" onclick={handleFileSelect}>
        {fileName || 'Choose file (.html or .md)'}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".html,.htm,.md,.markdown"
        style="display:none"
        onchange={handleFileChange}
      />
      {#if fileName}
        <span class="file-tag">{fileName}</span>
      {/if}
    </div>

    {#if parseError}
      <div class="error-msg">{parseError}</div>
    {/if}

    {#if allJobs.length > 0}
      <!-- Batch navigator -->
      <div class="batch-nav">
        <button
          class="batch-arrow"
          onclick={() => { currentPage = Math.max(0, currentPage - 1); }}
          disabled={currentPage === 0}
        >&#8249;</button>
        <span class="batch-label">
          Batch {batchLabel} ({currentPage * 4 + 1}&ndash;{Math.min((currentPage + 1) * 4, allJobs.length)} of {allJobs.length})
        </span>
        <button
          class="batch-arrow"
          onclick={() => { currentPage = Math.min(totalPages - 1, currentPage + 1); }}
          disabled={currentPage >= totalPages - 1}
        >&#8250;</button>
      </div>

      <!-- Job list for current batch -->
      <div class="job-list">
        {#each pageJobs as job, i}
          <div class="job-row">
            <span class="job-slot">Slot {i + 1}</span>
            <div class="job-info">
              <span class="job-title">{job.jobTitle || 'Untitled'}</span>
              <span class="job-company">{job.company || 'Unknown'}</span>
              {#if job.tier}
                <span class="job-tier tier-{job.tier}">{job.tier}</span>
              {/if}
            </div>
            <span class="jd-preview">{job.jdText ? `${job.jdText.length} chars` : 'No JD'}</span>
          </div>
        {/each}
      </div>

      <!-- Actions -->
      <div class="actions">
        <button class="btn-primary" onclick={loadBatch}>
          Load Batch {batchLabel} into Slots
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 300;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }

  .drawer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 70vh;
    background: var(--bg-primary);
    border-top: 1px solid var(--border-color);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    z-index: 301;
    display: flex;
    flex-direction: column;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.15);
    animation: slideUp 0.2s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .drawer-header {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .drawer-header h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--text-primary);
  }

  .drawer-body {
    padding: var(--space-md) var(--space-lg);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding-bottom: calc(var(--space-lg) + max(env(safe-area-inset-bottom, 0px), var(--android-nav-fallback)));
  }

  /* File picker */
  .file-section {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .file-btn {
    padding: var(--space-sm) var(--space-md);
    border: 2px dashed var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.85rem;
    font-family: inherit;
    font-weight: 500;
  }

  .file-btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  .file-tag {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: var(--accent-color);
    color: white;
    border-radius: var(--radius-sm);
    font-weight: 500;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-msg {
    font-size: 0.85rem;
    color: rgb(var(--color-error-500));
    padding: var(--space-sm) var(--space-md);
    background: rgb(var(--color-error-500) / 0.08);
    border-radius: var(--radius-md);
  }

  /* Batch navigator */
  .batch-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
  }

  .batch-arrow {
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
  }

  .batch-arrow:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .batch-arrow:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .batch-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  /* Job list */
  .job-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .job-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
  }

  .job-slot {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 3rem;
  }

  .job-info {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
  }

  .job-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .job-company {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .job-tier {
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    text-transform: uppercase;
  }

  .tier-tier1 { background: #22c55e20; color: #16a34a; }
  .tier-tier2 { background: #f59e0b20; color: #d97706; }
  .tier-tier3_avoid { background: #ef444420; color: #dc2626; }

  .jd-preview {
    font-size: 0.7rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  /* Actions */
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
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

  .btn-primary:hover {
    background: var(--accent-hover);
  }
</style>
