<script lang="ts">
  import { tick } from 'svelte';
  import { checkPdfFitDiagnostics, describeExportFailure, extractExportFields, exportPdfs } from '$lib/utils/pdf-export';
  import type { ExportFields, ExportFitDiagnostics, ExportResult, PreflightFailure, ResumePreflight } from '$lib/utils/pdf-export';
  import { loadOutputDir } from '$lib/utils/settings';

  let {
    markdown,
    jobTitle,
    company,
    onResults,
    onInput,
  }: {
    markdown: string;
    jobTitle: string;
    company: string;
    onResults: () => void;
    onInput: () => void;
  } = $props();

  let exporting = $state(false);
  let checkingFit = $state(false);
  let result = $state<ExportResult | null>(null);
  let lastFitCheck = $state<ExportFitDiagnostics | null>(null);
  let error = $state('');
  let showPreflightModal = $state(false);
  let preflightDirty = $state(false);
  let exportDetailsRef = $state<HTMLDivElement | null>(null);
  // Pre-fill editable fields from parsed markdown and refresh when a new export target is opened.
  let fields = $state<ExportFields>(extractExportFields('', ''));
  let canExport = $derived(fields.summary.trim().length > 0 && fields.coverLetter.trim().length > 0);
  $effect(() => {
    fields = extractExportFields(markdown, jobTitle);
    result = null;
    lastFitCheck = null;
    error = '';
    showPreflightModal = false;
    preflightDirty = false;
  });

  function closePreflightModal() {
    showPreflightModal = false;
  }

  function handlePreflightModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePreflightModal();
    }
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

  function formatPreflightDebug(preflight: ExportResult['preflight']): string {
    return JSON.stringify(preflight, null, 2);
  }

  function getFitStatusSummary(preflight: ResumePreflight): string {
    if (preflight.failures.length > 0) {
      return 'Layout preflight is currently failing. Fix the measured Typst issues below before export.';
    }

    return 'Layout preflight passed. This only confirms the resume layout fits. Typst compilation or file output can still fail later.';
  }

  function getBulletFailureCount(diagnostics: ExportFitDiagnostics): number {
    return diagnostics.bulletFailures.filter((failure) => failure.code === 'typst-bullet-too-wide').length;
  }

  function getExportFailureStage(exportResult: ExportResult): string {
    const code = exportResult.preflight.failures[0]?.code;
    if (!code) {
      return 'unknown export stage';
    }

    if (code === 'resume_preflight_failed' || code === 'resume_exceeds_page_budget' || code === 'resume_content_exceeds_available_height') {
      return 'resume layout preflight';
    }
    if (code === 'typst_unavailable_on_android') {
      return 'Typst runtime';
    }
    if (code === 'resume_compile_failed') {
      return 'resume PDF compilation';
    }
    if (code === 'cover_letter_compile_failed') {
      return 'cover letter PDF compilation';
    }

    return code;
  }

  function handleFieldEdit() {
    preflightDirty = true;
  }

  async function handleCheckFit() {
    if (!canExport) {
      error = 'Typst fit check requires a summary and a non-empty WAR cover letter.';
      return;
    }

    checkingFit = true;
    error = '';
    try {
      lastFitCheck = await checkPdfFitDiagnostics(fields);
      preflightDirty = false;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      checkingFit = false;
    }
  }

  export async function handleExport() {
    if (!canExport) {
      error = 'Export blocked: package must include a summary and a non-empty WAR cover letter.';
      return;
    }
    exporting = true;
    error = '';
    result = null;
    try {
      const savedDir = await loadOutputDir();
      const exportResult = await exportPdfs(fields, company, savedDir || undefined);
      result = exportResult;
      preflightDirty = false;
      if (!exportResult.success) {
        error = describeExportFailure(exportResult);
        showPreflightModal = exportResult.preflight.failures.length > 0;
        await tick();
        exportDetailsRef?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      exporting = false;
    }
  }
</script>

<div class="export-view">
  <div class="export-header">
    <div class="nav-btns">
      <button type="button" class="back-btn" onclick={onInput} title="Ctrl+I">← Input</button>
      <button type="button" class="back-btn" onclick={onResults} title="Ctrl+R">← Results</button>
    </div>
    <h2 class="export-title">Export: {jobTitle}{company ? ` @ ${company}` : ''}</h2>
    <div class="header-right">
      <button
        type="button"
        class="back-btn"
        onclick={handleCheckFit}
        disabled={checkingFit || exporting || !canExport}
      >
        {checkingFit ? 'Checking fit...' : 'Check Typst Fit'}
      </button>
      <button
        type="button"
        class="export-btn"
        onclick={handleExport}
        disabled={exporting || !canExport}
      >
        {exporting ? 'Exporting...' : 'Generate PDFs'}
      </button>
    </div>
  </div>

  {#if result}
    <div class="result-banner" class:success={result.success} class:error={!result.success}>
      {#if result.success && result.resumePath}
        Exported to {result.resumePath.substring(0, result.resumePath.lastIndexOf('/'))}
      {:else}
        PDF export stopped during {getExportFailureStage(result)}. Review the Typst details below.
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="result-banner error">{error}</div>
  {/if}

  {#if !canExport}
    <div class="result-banner error">Export blocked until the package contains a summary and a real WAR cover letter.</div>
  {/if}

  {#if result && !result.success}
    <div class="preflight-inline" bind:this={exportDetailsRef}>
      <div class="preflight-inline-header">
        <h3>Last Export Attempt</h3>
        {#if result.preflight.failures.length > 0}
          <button type="button" class="back-btn" onclick={() => (showPreflightModal = true)}>Open dialog</button>
        {/if}
      </div>

      <div class="result-banner error">
        Export failed during {getExportFailureStage(result)}. {describeExportFailure(result)}
      </div>

      <p class="preflight-summary">
        Pages: {result.preflight.pageCount}/{result.preflight.targetPageCount}
        {#if result.preflight.totalContentHeightPt !== null && result.preflight.availableHeightPt !== null}
          · Height: {result.preflight.totalContentHeightPt.toFixed(2)}pt / {result.preflight.availableHeightPt.toFixed(2)}pt
        {/if}
      </p>

      {#if result.preflight.failures.length > 0}
        <div class="preflight-failures">
          {#each result.preflight.failures as failure}
            <div class="preflight-failure">
              <div class="preflight-failure-message">{failure.message}</div>
              {#if failure.code}
                <div class="preflight-failure-code">{failure.code}</div>
              {/if}
              {#if formatFailureDetails(failure)}
                <pre class="preflight-failure-detail">{formatFailureDetails(failure)}</pre>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <pre class="preflight-failure-detail">{formatPreflightDebug(result.preflight)}</pre>
      {/if}

      {#if result.preflight.sections.length > 0}
        <div class="preflight-sections">
          <div class="preflight-sections-title">Measured sections</div>
          {#each result.preflight.sections as section}
            <div class="preflight-section-row">
              <span>{section.name}</span>
              <span>
                {#if section.heightPt !== null}
                  {section.heightPt.toFixed(2)}pt
                {:else}
                  n/a
                {/if}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if lastFitCheck}
    <div class="preflight-inline">
      <div class="preflight-inline-header">
        <h3>Last Typst Fit Check</h3>
        <div class="preflight-state-badge" class:error={lastFitCheck.preflight.failures.length > 0 || getBulletFailureCount(lastFitCheck) > 0}>
          {#if preflightDirty}
            Stale after edits
          {:else if lastFitCheck.preflight.failures.length > 0 || getBulletFailureCount(lastFitCheck) > 0}
            Failing
          {:else}
            Passing
          {/if}
        </div>
      </div>

      <p class="preflight-summary">
        Pages: {lastFitCheck.preflight.pageCount}/{lastFitCheck.preflight.targetPageCount}
        {#if lastFitCheck.preflight.totalContentHeightPt !== null && lastFitCheck.preflight.availableHeightPt !== null}
          · Height: {lastFitCheck.preflight.totalContentHeightPt.toFixed(2)}pt / {lastFitCheck.preflight.availableHeightPt.toFixed(2)}pt
        {/if}
      </p>

      <div class="debug-subnote">{getFitStatusSummary(lastFitCheck.preflight)}</div>
      <div class="debug-subnote">Bullet-width failures: {getBulletFailureCount(lastFitCheck)}</div>

      {#if preflightDirty}
        <div class="result-banner error">Fields changed after the last Typst fit check. Run `Check Typst Fit` again before export.</div>
      {/if}

      {#if lastFitCheck.preflight.failures.length > 0}
        <div class="preflight-failures">
          {#each lastFitCheck.preflight.failures as failure}
            <div class="preflight-failure">
              <div class="preflight-failure-message">{failure.message}</div>
              {#if failure.code}
                <div class="preflight-failure-code">{failure.code}</div>
              {/if}
              {#if formatFailureDetails(failure)}
                <pre class="preflight-failure-detail">{formatFailureDetails(failure)}</pre>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if lastFitCheck.bulletFailures.length > 0}
        <div class="preflight-failures">
          {#each lastFitCheck.bulletFailures as failure}
            <div class="preflight-failure">
              <div class="preflight-failure-message">{failure.message}</div>
              {#if failure.code}
                <div class="preflight-failure-code">{failure.code}</div>
              {/if}
              {#if formatFailureDetails(failure)}
                <pre class="preflight-failure-detail">{formatFailureDetails(failure)}</pre>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if lastFitCheck.preflight.failures.length === 0 && lastFitCheck.bulletFailures.length === 0}
        <div class="result-banner success">Latest Typst fit check passed. Doc-wide layout and bullet-width checks are both currently passing before PDF export.</div>
      {/if}
    </div>
  {/if}

  <div class="export-form">
    <!-- Job Title -->
    <fieldset class="field-group">
      <legend>Job Title</legend>
      <input type="text" class="field-input" bind:value={fields.jobTitle} oninput={handleFieldEdit} />
    </fieldset>

    <!-- Summary -->
    <fieldset class="field-group">
      <legend>Summary <span class="charcount" class:out-of-range={fields.summary.length < 80 || fields.summary.length > 110}>{fields.summary.length}</span></legend>
      <input type="text" class="field-input" bind:value={fields.summary} oninput={handleFieldEdit} />
    </fieldset>

    <!-- Independent Consulting (labDemand) -->
    <fieldset class="field-group">
      <legend class="emp-labdemand">Independent Consulting ({fields.labDemand.length} bullets)</legend>
      {#each fields.labDemand as _, i}
        <div class="bullet-row">
          <input type="text" class="field-input" bind:value={fields.labDemand[i]} oninput={handleFieldEdit} />
          <span class="charcount" class:out-of-range={fields.labDemand[i].length < 80 || fields.labDemand[i].length > 110}>{fields.labDemand[i].length}</span>
        </div>
      {/each}
    </fieldset>

    <!-- Focus Digital -->
    <fieldset class="field-group">
      <legend class="emp-focus-digital">Focus Digital ({fields.focusDigital.length} bullets)</legend>
      {#each fields.focusDigital as _, i}
        <div class="bullet-row">
          <input type="text" class="field-input" bind:value={fields.focusDigital[i]} oninput={handleFieldEdit} />
          <span class="charcount" class:out-of-range={fields.focusDigital[i].length < 80 || fields.focusDigital[i].length > 110}>{fields.focusDigital[i].length}</span>
        </div>
      {/each}
    </fieldset>

    <!-- First Page Sage -->
    <fieldset class="field-group">
      <legend class="emp-first-page-sage">First Page Sage ({fields.firstPageSage.length} bullets)</legend>
      {#each fields.firstPageSage as _, i}
        <div class="bullet-row">
          <input type="text" class="field-input" bind:value={fields.firstPageSage[i]} oninput={handleFieldEdit} />
          <span class="charcount" class:out-of-range={fields.firstPageSage[i].length < 80 || fields.firstPageSage[i].length > 110}>{fields.firstPageSage[i].length}</span>
        </div>
      {/each}
    </fieldset>

    <!-- Lear Marketing -->
    <fieldset class="field-group">
      <legend class="emp-lear-marketing">Lear Marketing ({fields.learMarketing.length} bullets)</legend>
      {#each fields.learMarketing as _, i}
        <div class="bullet-row">
          <input type="text" class="field-input" bind:value={fields.learMarketing[i]} oninput={handleFieldEdit} />
          <span class="charcount" class:out-of-range={fields.learMarketing[i].length < 80 || fields.learMarketing[i].length > 110}>{fields.learMarketing[i].length}</span>
        </div>
      {/each}
    </fieldset>

    <!-- Gestallt -->
    {#if fields.gestallt.length > 0}
    <fieldset class="field-group">
      <legend class="emp-gestallt">Gestallt ({fields.gestallt.length} bullets)</legend>
      {#each fields.gestallt as _, i}
        <div class="bullet-row">
          <input type="text" class="field-input" bind:value={fields.gestallt[i]} oninput={handleFieldEdit} />
          <span class="charcount" class:out-of-range={fields.gestallt[i].length < 80 || fields.gestallt[i].length > 110}>{fields.gestallt[i].length}</span>
        </div>
      {/each}
    </fieldset>
    {/if}

    <!-- CoverPro -->
    {#if fields.coverpro.length > 0}
    <fieldset class="field-group">
      <legend class="emp-coverpro">CoverPro ({fields.coverpro.length} bullets)</legend>
      {#each fields.coverpro as _, i}
        <div class="bullet-row">
          <input type="text" class="field-input" bind:value={fields.coverpro[i]} oninput={handleFieldEdit} />
          <span class="charcount" class:out-of-range={fields.coverpro[i].length < 80 || fields.coverpro[i].length > 110}>{fields.coverpro[i].length}</span>
        </div>
      {/each}
    </fieldset>
    {/if}

    <!-- DayLight -->
    {#if fields.daylight.length > 0}
    <fieldset class="field-group">
      <legend class="emp-daylight">DayLight ({fields.daylight.length} bullets)</legend>
      {#each fields.daylight as _, i}
        <div class="bullet-row">
          <input type="text" class="field-input" bind:value={fields.daylight[i]} oninput={handleFieldEdit} />
          <span class="charcount" class:out-of-range={fields.daylight[i].length < 80 || fields.daylight[i].length > 110}>{fields.daylight[i].length}</span>
        </div>
      {/each}
    </fieldset>
    {/if}

    <!-- Traverse -->
    {#if fields.traverse.length > 0}
    <fieldset class="field-group">
      <legend class="emp-traverse">Traverse ({fields.traverse.length} bullets)</legend>
      {#each fields.traverse as _, i}
        <div class="bullet-row">
          <input type="text" class="field-input" bind:value={fields.traverse[i]} oninput={handleFieldEdit} />
          <span class="charcount" class:out-of-range={fields.traverse[i].length < 80 || fields.traverse[i].length > 110}>{fields.traverse[i].length}</span>
        </div>
      {/each}
    </fieldset>
    {/if}

    <!-- eBay -->
    {#if fields.ebay.length > 0}
    <fieldset class="field-group">
      <legend class="emp-ebay">eBay ({fields.ebay.length} bullets)</legend>
      {#each fields.ebay as _, i}
        <div class="bullet-row">
          <input type="text" class="field-input" bind:value={fields.ebay[i]} oninput={handleFieldEdit} />
          <span class="charcount" class:out-of-range={fields.ebay[i].length < 80 || fields.ebay[i].length > 110}>{fields.ebay[i].length}</span>
        </div>
      {/each}
    </fieldset>
    {/if}

    <!-- Earlier Experience -->
    <fieldset class="field-group">
      <legend class="emp-earlier">Earlier Experience</legend>
      <input type="text" class="field-input" bind:value={fields.earlierExperience} oninput={handleFieldEdit} />
    </fieldset>

    <!-- Cover Letter -->
    <fieldset class="field-group">
      <legend class="emp-cover-letter">Cover Letter</legend>
      <textarea
        class="field-textarea field-textarea-cover-letter"
        rows="10"
        bind:value={fields.coverLetter}
        oninput={handleFieldEdit}
      ></textarea>
      <p class="field-note">Blank lines are preserved. Add or remove paragraph breaks here before PDF export.</p>
    </fieldset>
  </div>
</div>

{#if showPreflightModal && result && result.preflight.failures.length > 0}
  <button
    type="button"
    class="modal-backdrop"
    aria-label="Close Typst preflight dialog"
    onclick={closePreflightModal}
  ></button>
  <div
    class="preflight-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="preflight-title"
    tabindex="0"
    onkeydown={handlePreflightModalKeydown}
  >
    <div class="preflight-modal-header">
      <h3 id="preflight-title">Typst preflight blocked export</h3>
      <button type="button" class="modal-close" onclick={closePreflightModal} aria-label="Close">×</button>
    </div>

    <div class="preflight-modal-body">
      <p class="preflight-summary">
        Pages: {result.preflight.pageCount}/{result.preflight.targetPageCount}
        {#if result.preflight.totalContentHeightPt !== null && result.preflight.availableHeightPt !== null}
          · Height: {result.preflight.totalContentHeightPt.toFixed(2)}pt / {result.preflight.availableHeightPt.toFixed(2)}pt
        {/if}
      </p>

      <div class="preflight-failures">
        {#each result.preflight.failures as failure}
          <div class="preflight-failure">
            <div class="preflight-failure-message">{failure.message}</div>
            {#if failure.code}
              <div class="preflight-failure-code">{failure.code}</div>
            {/if}
            {#if formatFailureDetails(failure)}
              <pre class="preflight-failure-detail">{formatFailureDetails(failure)}</pre>
            {/if}
          </div>
        {/each}
      </div>

      {#if result.preflight.sections.length > 0}
        <div class="preflight-sections">
          <div class="preflight-sections-title">Measured sections</div>
          {#each result.preflight.sections as section}
            <div class="preflight-section-row">
              <span>{section.name}</span>
              <span>
                {#if section.heightPt !== null}
                  {section.heightPt.toFixed(2)}pt
                {:else}
                  n/a
                {/if}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="preflight-modal-actions">
      <button type="button" class="back-btn" onclick={closePreflightModal}>Close</button>
    </div>
  </div>
{/if}

<style>
  .export-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-md) var(--space-lg);
    gap: var(--space-sm);
  }

  @media (min-width: 768px) {
    .export-view {
      padding: var(--space-lg) var(--space-xl);
    }
  }

  .export-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .export-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .header-right {
    display: flex;
    gap: var(--space-sm);
  }

  .nav-btns {
    display: flex;
    gap: var(--space-xs);
  }

  .back-btn {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-primary);
    font-family: inherit;
    font-weight: 500;
  }

  .back-btn:hover {
    background: var(--bg-hover);
  }

  .export-btn {
    padding: var(--space-xs) var(--space-lg);
    border-radius: var(--radius-md);
    border: none;
    background: var(--accent-color);
    color: white;
    cursor: pointer;
    font-size: 0.85rem;
    font-family: inherit;
    font-weight: 600;
  }

  .export-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* --- Result banners --- */
  .result-banner {
    text-align: center;
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    font-weight: 500;
  }

  .result-banner.success {
    background: rgb(var(--color-success-500) / 0.1);
    color: rgb(var(--color-tertiary-700));
  }

  .result-banner.error {
    background: rgb(var(--color-error-500) / 0.1);
    color: rgb(var(--color-error-500));
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    border: 0;
    padding: 0;
    margin: 0;
    background: rgb(15 23 42 / 0.56);
    z-index: 50;
    cursor: default;
  }

  .preflight-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(42rem, calc(100vw - 2rem));
    max-height: min(80vh, 48rem);
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 64px rgb(15 23 42 / 0.24);
    z-index: 51;
    overflow: hidden;
  }

  .preflight-inline {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
  }

  .preflight-inline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .preflight-inline-header h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .preflight-state-badge {
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: rgb(var(--color-success-500) / 0.12);
    color: rgb(var(--color-tertiary-700));
    font-size: 0.74rem;
    font-weight: 700;
  }

  .preflight-state-badge.error {
    background: rgb(var(--color-error-500) / 0.12);
    color: rgb(var(--color-error-500));
  }

  .preflight-modal-header,
  .preflight-modal-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border-color);
  }

  .preflight-modal-actions {
    border-top: 1px solid var(--border-color);
    border-bottom: 0;
    justify-content: flex-end;
  }

  .preflight-modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .modal-close {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-size: 1.4rem;
    line-height: 1;
    cursor: pointer;
  }

  .modal-close:hover {
    color: var(--text-primary);
  }

  .preflight-modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    overflow-y: auto;
  }

  .preflight-failures,
  .preflight-sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .preflight-failure,
  .preflight-sections {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .preflight-failure {
    gap: 0.3rem;
  }

  .preflight-summary {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .preflight-failure-message,
  .preflight-sections-title,
  .preflight-section-row {
    font-size: 0.85rem;
    color: var(--text-primary);
  }

  .preflight-failure-code {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-family: monospace;
  }

  .preflight-failure-detail {
    margin: 0;
    padding: var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.8rem;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .preflight-sections-title {
    font-weight: 700;
  }

  .preflight-section-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  /* --- Form --- */
  .export-form {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .field-note {
    margin: 0.45rem 0 0;
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .field-textarea-cover-letter {
    min-height: 13rem;
  }

  .field-group {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    margin: 0;
  }

  .field-group legend {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 var(--space-xs);
  }

  .emp-labdemand { color: rgb(var(--color-primary-500)); }
  .emp-focus-digital { color: rgb(var(--color-tertiary-500)); }
  .emp-first-page-sage { color: rgb(var(--color-accent-500)); }
  .emp-lear-marketing { color: rgb(var(--color-secondary-500)); }
  .emp-gestallt { color: rgb(var(--color-tertiary-700)); }
  .emp-coverpro { color: rgb(var(--color-tertiary-700)); }
  .emp-daylight { color: rgb(var(--color-tertiary-700)); }
  .emp-traverse { color: rgb(var(--color-tertiary-700)); }
  .emp-ebay { color: rgb(var(--color-accent-500)); }
  .emp-earlier { color: var(--text-muted); }
  .emp-cover-letter { color: var(--accent-color); }

  .bullet-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-bottom: 4px;
  }

  .field-input {
    width: 100%;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .field-textarea {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 0.8rem;
    line-height: 1.6;
    resize: vertical;
  }

  .field-textarea:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .charcount {
    font-size: 0.6rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 1.8rem;
    text-align: right;
    flex-shrink: 0;
  }

  .charcount.out-of-range {
    color: rgb(var(--color-error-500));
    font-weight: 600;
  }
</style>
