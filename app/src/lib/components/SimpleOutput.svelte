<script lang="ts">
  import { markdownToHtml } from '$lib/utils/markdown';
  import { parsePackage } from '$lib/utils/resume-parser';
  import type { LintError } from '$lib/types';
  import type { RejectedCandidateDebug } from '$lib/services/runner';
  import type { ExportFitDiagnostics, PreflightFailure } from '$lib/utils/pdf-export';
  import type { RepairRouteResult, RepairUnit } from '$lib/utils/repair-router';
  import IconRefreshCw from '~icons/lucide/refresh-cw';
  import IconPause from '~icons/lucide/pause';
  import IconPlay from '~icons/lucide/play';
  import IconCheck from '~icons/lucide/check';

  let {
    markdown,
    status,
    error,
    statusDetail,
    currentDraftMarkdown = '',
    draftErrors = [],
    draftFitDiagnostics = null,
    draftAttempt = 0,
    draftMaxAttempts = 0,
    rejectedCandidateDebug = null,
    totalCost = null,
    repairRoute = null,
    repairFixtureLabel = '',
    repairProof = [],
    isPaused = false,
    isRepairing = false,
    checkpointPhase = null,
    lastMutation = '',
    transientNote = '',
    authority = 'runner',
    renderedSource = 'none',
    exportSource = 'none',
    draftStability = 'none',
    rescueStatus = '',
    rescuePath = '',
    onPause,
    onResume,
    onAcceptDraft,
    onApplyLocalRepair,
    onRerun,
    onRescue,
    onExport,
  }: {
    markdown: string;
    status: string;
    error?: string;
    statusDetail?: string;
    currentDraftMarkdown?: string;
    draftErrors?: LintError[];
    draftFitDiagnostics?: ExportFitDiagnostics | null;
    draftAttempt?: number;
    draftMaxAttempts?: number;
    rejectedCandidateDebug?: RejectedCandidateDebug | null;
    totalCost?: number | null;
    repairRoute?: RepairRouteResult | null;
    repairFixtureLabel?: string;
    repairProof?: string[];
    isPaused?: boolean;
    isRepairing?: boolean;
    checkpointPhase?: 'pre-repair' | 'post-repair' | null;
    lastMutation?: string;
    transientNote?: string;
    authority?: 'runner' | 'user' | 'settled';
    renderedSource?: 'final' | 'draft' | 'none';
    exportSource?: 'final' | 'draft' | 'none';
    draftStability?: 'stable' | 'transient' | 'final' | 'none';
    rescueStatus?: string;
    rescuePath?: string;
    onPause?: () => void;
    onResume?: () => void;
    onAcceptDraft?: () => void;
    onApplyLocalRepair?: (targetKey: string) => void | Promise<void>;
    onRerun?: () => void;
    onRescue?: () => void;
    onExport?: () => void;
  } = $props();

  let activeMarkdown = $derived(markdown || currentDraftMarkdown);
  let pkg = $derived(markdown ? parsePackage(markdown) : null);
  let draftPkg = $derived(currentDraftMarkdown ? parsePackage(currentDraftMarkdown) : null);
  let canRerun = $derived(status === 'done' || status === 'error' || status === 'paused');
  let showDraft = $derived((isRepairing || isPaused) && draftPkg !== null);
  let errorCount = $derived(draftErrors.filter(e => e.severity === 'error').length);
  let warningCount = $derived(draftErrors.filter(e => e.severity === 'warning').length);
  let preflightFailureCount = $derived(draftFitDiagnostics?.preflight.failures.length ?? 0);
  let bulletFailureCount = $derived(draftFitDiagnostics?.bulletFailures.filter((failure) => failure.code === 'typst-bullet-too-wide').length ?? 0);
  let activeRepairUnit = $derived(repairRoute?.units[0] ?? null);
  let showPayloadPreview = $state(false);

  function formatCost(cost: number | null): string {
    if (typeof cost !== 'number' || !Number.isFinite(cost)) return '';
    if (cost === 0) return '0';
    if (Math.abs(cost) >= 1) return cost.toFixed(2);
    if (Math.abs(cost) >= 0.01) return cost.toFixed(3);
    return cost.toFixed(4);
  }

  function candidatePreviewText(debug: RejectedCandidateDebug | null): string {
    if (!debug) return '';
    const preferred = debug.extractedMarkdown.trim() || debug.rawText.trim();
    if (!preferred) return '';
    return preferred.length > 700 ? `${preferred.slice(0, 700)}...` : preferred;
  }

  function getFailureDetail(failure: PreflightFailure, key: string): string | null {
    const value = failure.details?.[key];
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function formatFailureDetails(failure: PreflightFailure): string | null {
    if (!failure.details) {
      return null;
    }

    const stderr = getFailureDetail(failure, 'stderr');
    if (stderr) {
      return stderr;
    }

    const serialized = JSON.stringify(failure.details, null, 2);
    return serialized && serialized !== '{}' ? serialized : null;
  }

  function kindLabel(kind: RepairUnit['kind']): string {
    if (kind === 'coverLetter') return 'cover letter';
    return kind;
  }

  function unitNeedsLlm(unit: RepairUnit): boolean {
    return unit.kind === 'section' || unit.kind === 'coverLetter' || unit.kind === 'line' || unit.kind === 'fallback';
  }

  function payloadPreview(unit: RepairUnit): string {
    const reasons = unit.diagnostics.map((error) => `- ${error.message}`).join('\n');
    return [
      `Repair target: ${unit.label}`,
      `Target kind: ${kindLabel(unit.kind)}`,
      'Failure reason:',
      reasons || '- No diagnostics provided',
      '',
      'Scoped content sent to LLM:',
      unit.currentText || '(empty target text)',
    ].join('\n');
  }

  function preservedLabel(target: string): string {
    return target
      .replace(/^section:/, '')
      .replace(':block', '')
      .split('-')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');
  }
  // Copy functions use markdownToHtml for clipboard (Google Docs paste fidelity)
  async function copyAll() {
    if (!activeMarkdown) return;
    const html = markdownToHtml(activeMarkdown);
    try {
      const blob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([activeMarkdown], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })
      ]);
    } catch {
      await navigator.clipboard.writeText(activeMarkdown);
    }
  }

  async function copyResume() {
    if (!activeMarkdown) return;
    const resumeEnd = activeMarkdown.indexOf('## WAR Cover Letter');
    const resumeMd = resumeEnd > 0 ? activeMarkdown.slice(0, resumeEnd).trim() : activeMarkdown;
    const resumeHtml = markdownToHtml(resumeMd);
    try {
      const blob = new Blob([resumeHtml], { type: 'text/html' });
      const textBlob = new Blob([resumeMd], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })
      ]);
    } catch {
      await navigator.clipboard.writeText(resumeMd);
    }
  }

  async function copyCoverLetter() {
    if (!activeMarkdown) return;
    const clStart = activeMarkdown.indexOf('## WAR Cover Letter');
    if (clStart < 0) return;
    const clMd = activeMarkdown.slice(clStart).trim();
    const clHtml = markdownToHtml(clMd);
    try {
      const blob = new Blob([clHtml], { type: 'text/html' });
      const textBlob = new Blob([clMd], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })
      ]);
    } catch {
      await navigator.clipboard.writeText(clMd);
    }
  }
</script>

<div class="output-card">
  <div class="output-toolbar">
    <div class="toolbar-left">
      {#if onRerun}
        <button
          type="button"
          class="btn-redo"
          onclick={onRerun}
          disabled={!canRerun}
          title="Re-generate this package"
        >
          <IconRefreshCw class="w-3 h-3" />
          Redo
        </button>
      {/if}
      {#if isRepairing && !isPaused && onPause}
        <button type="button" class="btn-pause" onclick={onPause} title="Pause after current repair">
          <IconPause class="w-3 h-3" />
          Pause
        </button>
      {/if}
      {#if isPaused}
        {#if onResume}
          <button type="button" class="btn-resume" onclick={onResume} title="Run the next repair step">
            <IconPlay class="w-3 h-3" />
            Repair
          </button>
        {/if}
        {#if onAcceptDraft}
          <button type="button" class="btn-accept" onclick={onAcceptDraft} title="Accept current draft as-is">
            <IconCheck class="w-3 h-3" />
            Accept
          </button>
        {/if}
      {/if}
    </div>

    <div class="copy-group">
      <button class="btn-copy" onclick={copyAll} disabled={!activeMarkdown}>All</button>
      <button class="btn-copy" onclick={copyResume} disabled={!activeMarkdown}>Resume</button>
      <button class="btn-copy" onclick={copyCoverLetter} disabled={!activeMarkdown}>Cover</button>
      {#if onRescue}
        <button class="btn-rescue" onclick={onRescue} disabled={!activeMarkdown}>Rescue</button>
      {/if}
      {#if onExport}
        <button class="btn-export" onclick={onExport} disabled={!activeMarkdown}>PDF</button>
      {/if}
    </div>
  </div>

  {#if transientNote || statusDetail}
    <div class="debug-note">
      <div>{statusDetail || 'No active status detail.'}</div>
      {#if transientNote}
        <div class="debug-subnote">{transientNote}</div>
      {/if}
      {#if rescueStatus}
        <div class="debug-subnote">{rescueStatus}</div>
      {/if}
      {#if totalCost !== null}
        <div class="debug-subnote">Cost: {formatCost(totalCost)}</div>
      {/if}
      {#if rejectedCandidateDebug}
        <details class="candidate-debug">
          <summary>
            Rejected {rejectedCandidateDebug.phase} candidate on attempt {rejectedCandidateDebug.attempt}: {rejectedCandidateDebug.reason}
          </summary>
          {#if candidatePreviewText(rejectedCandidateDebug)}
            <pre class="candidate-preview">{candidatePreviewText(rejectedCandidateDebug)}</pre>
          {/if}
        </details>
      {/if}
    </div>
  {/if}

  {#if activeRepairUnit}
    <section class="repair-scope" aria-label="Repair Scope">
      <div class="repair-scope-header">
        <div>
          <h2>Repair Scope</h2>
          {#if repairFixtureLabel}
            <p>{repairFixtureLabel} fixture</p>
          {/if}
        </div>
        <span class="repair-kind">{kindLabel(activeRepairUnit.kind)}</span>
      </div>

      <div class="repair-grid">
        <div>
          <span class="repair-label">Target</span>
          <strong>{activeRepairUnit.label}</strong>
        </div>
        <div>
          <span class="repair-label">LLM needed</span>
          <strong>{unitNeedsLlm(activeRepairUnit) ? 'Maybe' : 'No'}</strong>
        </div>
      </div>

      <div class="repair-reason">
        <span class="repair-label">Failure reason</span>
        <ul>
          {#each activeRepairUnit.diagnostics as diagnostic}
            <li>{diagnostic.message}</li>
          {/each}
        </ul>
      </div>

      <div class="repair-reason">
        <span class="repair-label">Locked / preserved units</span>
        <p>{activeRepairUnit.preservedTargets.map(preservedLabel).join(', ') || 'None'}</p>
      </div>

      <div class="repair-actions" aria-label="Repair actions">
        {#if activeRepairUnit.kind === 'local' || activeRepairUnit.kind === 'line' || activeRepairUnit.kind === 'coverLetter'}
          <button type="button" class="repair-action primary" onclick={() => onApplyLocalRepair?.(activeRepairUnit.targetKey)}>
            Local fix
          </button>
        {/if}
        <button type="button" class="repair-action">Edit unit</button>
        <button type="button" class="repair-action" onclick={() => (showPayloadPreview = !showPayloadPreview)}>
          Preview LLM payload
        </button>
        <button type="button" class="repair-action">Send scoped repair</button>
        <button type="button" class="repair-action">Accept as-is</button>
        <button type="button" class="repair-action" onclick={copyAll}>Save combined</button>
        <button type="button" class="repair-action" onclick={copyResume}>Save resume-only</button>
        <button type="button" class="repair-action" onclick={copyCoverLetter}>Save cover-letter-only</button>
      </div>

      {#if showPayloadPreview}
        <pre class="repair-payload">{payloadPreview(activeRepairUnit)}</pre>
      {/if}
    </section>
  {/if}

  {#if repairProof.length > 0}
    <section class="preservation-proof" aria-label="Preservation proof">
      <h2>Preservation Proof</h2>
      <ul>
        {#each repairProof as proof}
          <li>{proof}</li>
        {/each}
      </ul>
    </section>
  {/if}

  <div class="output-body">
    {#if status === 'pending'}
      <p class="status-msg muted">Waiting...</p>
    {:else if showDraft}
      <!-- Live draft during repair / paused state -->
      <div class="draft-banner" class:paused={isPaused}>
        {#if isPaused}
          Paused — {errorCount} error{errorCount !== 1 ? 's' : ''}{warningCount ? `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}` : ''} — iteration {draftAttempt}/{draftMaxAttempts}{totalCost !== null ? ` — cost ${formatCost(totalCost)}` : ''}
        {:else}
          Repairing — {errorCount} error{errorCount !== 1 ? 's' : ''} — iteration {draftAttempt}/{draftMaxAttempts}{totalCost !== null ? ` — cost ${formatCost(totalCost)}` : ''}
        {/if}
      </div>
      {#if isPaused && draftErrors.length > 0}
        <details class="draft-errors">
          <summary>{draftErrors.length} lint issue{draftErrors.length !== 1 ? 's' : ''}</summary>
          <ul class="error-list">
            {#each draftErrors as err}
              <li class="error-item" class:warning={err.severity === 'warning'}>
                <span class="error-block">{err.block}</span>: {err.message}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
      {#if isPaused && draftFitDiagnostics}
        <details class="draft-errors" open={preflightFailureCount > 0 || bulletFailureCount > 0}>
          <summary>
            Typst checks: {preflightFailureCount} doc issue{preflightFailureCount !== 1 ? 's' : ''}, {bulletFailureCount} bullet issue{bulletFailureCount !== 1 ? 's' : ''}
          </summary>
          <div class="fit-summary">
            Pages: {draftFitDiagnostics.preflight.pageCount}/{draftFitDiagnostics.preflight.targetPageCount}
            {#if draftFitDiagnostics.preflight.totalContentHeightPt !== null && draftFitDiagnostics.preflight.availableHeightPt !== null}
              · Height: {draftFitDiagnostics.preflight.totalContentHeightPt.toFixed(2)}pt / {draftFitDiagnostics.preflight.availableHeightPt.toFixed(2)}pt
            {/if}
          </div>
          {#if draftFitDiagnostics.preflight.failures.length > 0}
            <ul class="error-list">
              {#each draftFitDiagnostics.preflight.failures as failure}
                <li class="error-item">
                  {failure.message}
                  {#if formatFailureDetails(failure)}
                    <pre class="candidate-preview">{formatFailureDetails(failure)}</pre>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          {#if draftFitDiagnostics.bulletFailures.length > 0}
            <ul class="error-list">
              {#each draftFitDiagnostics.bulletFailures as failure}
                <li class="error-item" class:warning={failure.code === 'typst-bullet-measurement-unavailable'}>
                  {failure.message}
                  {#if formatFailureDetails(failure)}
                    <pre class="candidate-preview">{formatFailureDetails(failure)}</pre>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          {#if draftFitDiagnostics.preflight.failures.length === 0 && draftFitDiagnostics.bulletFailures.length === 0}
            <div class="fit-summary">Doc-wide Typst fit and bullet-width checks are both passing for this checkpoint.</div>
          {/if}
        </details>
      {/if}
      {#if draftPkg}
        <article class="pkg draft">
          {#if draftPkg.title}
            <h1 class="pkg-title">{draftPkg.title}</h1>
          {/if}
          {#each draftPkg.sections as section}
            <section
              class="pkg-section pkg-section--{section.kind}"
              class:pkg-emp--labdemand={section.employerTag === 'labdemand'}
              class:pkg-emp--focus-digital={section.employerTag === 'focus-digital'}
              class:pkg-emp--first-page-sage={section.employerTag === 'first-page-sage'}
              class:pkg-emp--lear-marketing={section.employerTag === 'lear-marketing'}
              class:pkg-emp--gestallt={section.employerTag === 'gestallt'}
              class:pkg-emp--ebay={section.employerTag === 'ebay'}
            >
              {#if section.heading}
                <h2 class="pkg-heading">{section.heading}</h2>
              {/if}
              {#if section.kind === 'cover-letter'}
                {#each section.paragraphs as para}
                  <p class="pkg-para">{para}</p>
                {/each}
              {:else}
                <ul class="pkg-bullets">
                  {#each section.bullets as bullet}
                    <li class="pkg-bullet">
                      <span class="pkg-bullet-text">{bullet.text}</span>
                      <span
                        class="pkg-charcount"
                      >{bullet.charCount}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>
          {/each}
        </article>
      {/if}
    {:else if status === 'running' || status === 'linting' || status === 'fixing'}
      <p class="status-msg active">
        {statusDetail || (status === 'running' ? 'Generating...' : status === 'linting' ? 'Checking...' : 'Fixing...')}
      </p>
    {:else if status === 'paused'}
      <p class="status-msg active">
        {statusDetail || 'Paused and frozen.'}
      </p>
    {:else if status === 'error'}
      <p class="status-msg error">{error || 'Something went wrong'}</p>
    {:else if pkg}
      <article class="pkg">
        {#if pkg.title}
          <h1 class="pkg-title">{pkg.title}</h1>
        {/if}

        {#each pkg.sections as section}
          <section
            class="pkg-section pkg-section--{section.kind}"
            class:pkg-emp--labdemand={section.employerTag === 'labdemand'}
            class:pkg-emp--focus-digital={section.employerTag === 'focus-digital'}
            class:pkg-emp--first-page-sage={section.employerTag === 'first-page-sage'}
            class:pkg-emp--lear-marketing={section.employerTag === 'lear-marketing'}
            class:pkg-emp--gestallt={section.employerTag === 'gestallt'}
            class:pkg-emp--ebay={section.employerTag === 'ebay'}
          >
            {#if section.heading}
              <h2 class="pkg-heading">{section.heading}</h2>
            {/if}

            {#if section.kind === 'cover-letter'}
              {#each section.paragraphs as para}
                <p class="pkg-para">{para}</p>
              {/each}
            {:else}
              <ul class="pkg-bullets">
                {#each section.bullets as bullet}
                  <li class="pkg-bullet">
                    <span class="pkg-bullet-text">{bullet.text}</span>
                    <span
                      class="pkg-charcount"
                    >{bullet.charCount}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/each}
      </article>
    {:else}
      <p class="status-msg muted">Output will appear here</p>
    {/if}
  </div>
</div>

<style>
  .output-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    height: 100%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    overflow: hidden;
  }

  .output-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .debug-note {
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-primary) 90%, var(--bg-secondary));
    font-size: 0.72rem;
    color: var(--text-primary);
  }

  .debug-subnote {
    margin-top: 0.2rem;
    color: var(--text-muted);
  }

  .candidate-debug {
    margin-top: 0.45rem;
  }

  .candidate-preview {
    margin: 0.45rem 0 0;
    padding: 0.6rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--bg-secondary) 82%, black);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.68rem;
    line-height: 1.45;
    max-height: 14rem;
    overflow: auto;
  }

  .copy-group {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .repair-scope {
    padding: var(--space-md);
    border-bottom: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--accent-color) 6%, var(--bg-primary));
    display: grid;
    gap: var(--space-sm);
    font-size: 0.78rem;
  }

  .repair-scope-header {
    display: flex;
    justify-content: space-between;
    gap: var(--space-md);
    align-items: flex-start;
  }

  .repair-scope h2 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-primary);
  }

  .repair-scope p {
    margin: 0.12rem 0 0;
    color: var(--text-muted);
  }

  .repair-kind {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 0.15rem 0.45rem;
    color: var(--accent-color);
    background: var(--bg-card);
    white-space: nowrap;
  }

  .repair-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--space-sm);
  }

  .repair-label {
    display: block;
    font-size: 0.64rem;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    margin-bottom: 0.15rem;
  }

  .repair-reason ul {
    margin: 0;
    padding-left: 1rem;
    color: var(--text-primary);
  }

  .repair-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .repair-action {
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.74rem;
    font-family: inherit;
  }

  .repair-action:hover {
    background: var(--bg-hover);
  }

  .repair-action.primary {
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  .repair-payload {
    margin: 0;
    padding: var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--bg-secondary) 88%, black);
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 14rem;
    overflow: auto;
  }

  .preservation-proof {
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-color);
    background: color-mix(in srgb, rgb(var(--color-success-500, 34 197 94)) 7%, var(--bg-primary));
    font-size: 0.76rem;
  }

  .preservation-proof h2 {
    margin: 0 0 var(--space-xs);
    font-size: 0.82rem;
    color: var(--text-primary);
  }

  .preservation-proof ul {
    margin: 0;
    padding-left: 1rem;
    color: var(--text-primary);
  }

  /* --- Buttons --- */
  .btn-redo {
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-family: inherit;
  }

  .btn-redo:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .btn-redo:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .btn-copy {
    padding: var(--space-xs) var(--space-sm);
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
    font-weight: 500;
  }

  .btn-copy:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .btn-copy:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-export, .btn-rescue {
    padding: var(--space-xs) var(--space-sm);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
    font-weight: 500;
  }

  .btn-export {
    background: rgb(var(--color-secondary-500));
  }

  .btn-rescue {
    background: rgb(var(--color-warning-500, 234 179 8));
    color: rgb(var(--color-primary-950, 24 24 27));
  }

  .btn-export:hover:not(:disabled), .btn-rescue:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-export:disabled, .btn-rescue:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* --- Output body --- */
  .output-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-md);
    font-size: 0.8rem;
  }

  /* --- Status messages --- */
  .status-msg {
    text-align: center;
    padding: var(--space-xl);
    margin: 0;
  }

  .status-msg.muted {
    color: var(--text-muted);
  }

  .status-msg.active {
    color: var(--accent-color);
    font-weight: 500;
  }

  .status-msg.error {
    color: rgb(var(--color-error-500));
  }

  /* --- Structured package rendering --- */
  .pkg {
    max-width: min(720px, 100%);
  }

  .pkg-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-lg);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--border-color);
    line-height: 1.4;
  }

  .pkg-section {
    margin-bottom: var(--space-lg);
    padding-left: var(--space-md);
    border-left: 3px solid var(--border-color);
  }

  /* Employer-specific left borders (Flexoki palette) */
  .pkg-emp--labdemand       { border-left-color: rgb(var(--color-primary-500)); }
  .pkg-emp--focus-digital   { border-left-color: rgb(var(--color-tertiary-500)); }
  .pkg-emp--first-page-sage { border-left-color: rgb(var(--color-accent-500)); }
  .pkg-emp--lear-marketing  { border-left-color: rgb(var(--color-secondary-500)); }
  .pkg-emp--gestallt        { border-left-color: rgb(var(--color-warning-500)); }
  .pkg-emp--ebay            { border-left-color: rgb(var(--color-accent-500)); }

  /* Summary section — slightly different treatment */
  .pkg-section--summary {
    border-left-color: var(--accent-color);
  }

  /* Cover letter section */
  .pkg-section--cover-letter {
    border-left-color: var(--accent-color);
    border-left-style: dashed;
  }

  .pkg-heading {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    margin: 0 0 var(--space-sm);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .pkg-bullets {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .pkg-bullet {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    padding: 2px 0;
    line-height: 1.5;
    color: var(--text-primary);
  }

  .pkg-bullet-text {
    flex: 1;
  }

  .pkg-charcount {
    font-size: 0.6rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 1.5rem;
    text-align: right;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .pkg-charcount.out-of-range {
    color: rgb(var(--color-error-500));
    font-weight: 600;
    opacity: 1;
  }

  .pkg-para {
    line-height: 1.7;
    margin: 0 0 var(--space-md);
    color: var(--text-primary);
  }

  .pkg-para:last-child {
    margin-bottom: 0;
  }

  /* --- Toolbar left group --- */
  .toolbar-left {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
  }

  /* --- Pause / Resume / Accept buttons --- */
  .btn-pause, .btn-resume, .btn-accept {
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-family: inherit;
  }

  .btn-pause:hover { background: var(--bg-hover); }
  .btn-resume { border-color: var(--accent-color); color: var(--accent-color); }
  .btn-resume:hover { background: var(--accent-color); color: white; }
  .btn-accept { border-color: rgb(var(--color-success-500, 34 197 94)); color: rgb(var(--color-success-500, 34 197 94)); }
  .btn-accept:hover { background: rgb(var(--color-success-500, 34 197 94)); color: white; }

  /* --- Draft banner --- */
  .draft-banner {
    padding: var(--space-xs) var(--space-md);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--accent-color);
    background: color-mix(in srgb, var(--accent-color) 8%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--accent-color) 20%, transparent);
  }

  .draft-banner.paused {
    color: rgb(var(--color-warning-500, 234 179 8));
    background: color-mix(in srgb, rgb(var(--color-warning-500, 234 179 8)) 8%, transparent);
    border-bottom-color: color-mix(in srgb, rgb(var(--color-warning-500, 234 179 8)) 20%, transparent);
  }

  /* --- Draft error details --- */
  .draft-errors {
    padding: var(--space-xs) var(--space-md);
    font-size: 0.7rem;
    border-bottom: 1px solid var(--border-color);
  }

  .draft-errors summary {
    cursor: pointer;
    color: var(--text-muted);
    font-weight: 500;
  }

  .error-list {
    list-style: none;
    padding: var(--space-xs) 0 0 0;
    margin: 0;
  }

  .error-item {
    padding: 1px 0;
    color: rgb(var(--color-error-500));
  }

  .error-item.warning {
    color: rgb(var(--color-warning-500, 234 179 8));
  }

  .error-block {
    font-weight: 600;
  }

  /* --- Draft package styling --- */
  .pkg.draft {
    opacity: 0.85;
  }
</style>
