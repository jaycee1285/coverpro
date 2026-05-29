<script lang="ts">
  import SimpleInput from '$lib/components/SimpleInput.svelte';
  import SimpleOutput from '$lib/components/SimpleOutput.svelte';
  import ExportView from '$lib/components/ExportView.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import { appStore } from '$lib/stores/app.svelte';
  import { analyzeDraftMarkdown, runSingleJob, type RepairIterationCallback, type RejectedCandidateDebug } from '$lib/services/runner';
  import type { LintError, ResumeMode } from '$lib/types';
  import type { ExportFitDiagnostics } from '$lib/utils/pdf-export';
  import { checkMarkdownFitDiagnostics } from '$lib/utils/pdf-export';
  import { parsePackage, validatePackageMarkdown } from '$lib/utils/resume-parser';
  import { buildRepairRoute, type RepairRouteResult } from '$lib/utils/repair-router';
  import { lintMarkdown } from '$lib/utils/linter';
  import { REPAIR_FIXTURES } from '$lib/config/repair-fixtures';
  import IconBadge from '~icons/lucide/badge';
  import IconRefreshCw from '~icons/lucide/refresh-cw';
  import IconCheck from '~icons/lucide/check';
  import IconClipboardX from '~icons/lucide/clipboard-x';
  import IconPause from '~icons/lucide/pause';
  import IconX from '~icons/lucide/x';
  import IconSettings from '~icons/lucide/settings';

  type Job = { jdText: string; jobTitle: string; company: string; slotIndex: number; resumeMode?: ResumeMode };
  type JobStatus = 'pending' | 'running' | 'linting' | 'fixing' | 'paused' | 'done' | 'error' | 'cancelled';

  // Run counter for /tmp dump filenames
  let runCounter = $state(1);

  type JobResult = {
    markdown: string;
    status: JobStatus;
    error: string;
    statusDetail: string;
    jobTitle: string;
    company: string;
    job: Job;
    startedAt: number | null; // timestamp ms
    elapsed: number; // seconds, updated by timer
    abortController: AbortController | null;
    keep: boolean; // checkbox: carry this job's description back on Back
    // Pause/draft state
    currentDraftMarkdown: string;
    draftErrors: LintError[];
    draftFitDiagnostics: ExportFitDiagnostics | null;
    draftAttempt: number;
    draftMaxAttempts: number;
    pauseRequested: boolean;
    resumeResolver: ((decision: 'continue' | 'accept') => void) | null;
    acceptedDraft: boolean; // When true, auto-open ExportView on completion
    checkpointPhase: 'pre-repair' | 'post-repair' | null;
    lastMutation: string;
    transientNote: string;
    rescuePath: string;
    rescueStatus: string;
    mutationLocked: boolean;
    rejectedCandidateDebug: RejectedCandidateDebug | null;
    totalCost: number | null;
    repairRoute: RepairRouteResult | null;
    repairFixtureLabel: string;
    repairProof: string[];
  };

  type DraftDecision = 'continue' | 'accept';

  let view = $state<'input' | 'output' | 'export'>('input');
  let results = $state<JobResult[]>([]);
  let exportJobIndex = $state<number | null>(null);
  let timerHandle = $state<ReturnType<typeof setInterval> | null>(null);
  let showSettings = $state(false);
  let showShortcuts = $state(false);

  // Refs for keyboard shortcuts
  let inputRef = $state<SimpleInput | null>(null);
  let exportRef = $state<ExportView | null>(null);

  // Initialize app store on mount
  $effect(() => {
    appStore.init();
  });

  // Derived state
  let allDone = $derived(results.length > 0 && results.every(r => r.status === 'done' || r.status === 'error' || r.status === 'cancelled'));
  let anyFailed = $derived(results.some(r => r.status === 'error'));
  let anyCancelled = $derived(results.some(r => r.status === 'cancelled'));
  let anyRunning = $derived(results.some(r => r.status === 'running' || r.status === 'pending' || r.status === 'linting' || r.status === 'fixing'));

  // Keyboard shortcuts: Ctrl+G generate, Ctrl+Shift+R repair import,
  // Ctrl+K kill current, Ctrl+J kill all, Ctrl+P export PDFs, Ctrl+, settings, Ctrl+H shortcuts help.
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showShortcuts) {
        e.preventDefault();
        showShortcuts = false;
        return;
      }
      return;
    }

    if (!e.ctrlKey) return;
    if (e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      if (view === 'input' && inputRef) {
        inputRef.openRepairImport();
      }
    } else if (e.key === 'g') {
      e.preventDefault();
      if (view === 'input' && inputRef) {
        inputRef.handleRun();
      }
    } else if (e.key === 'k') {
      e.preventDefault();
      // Kill the first running job
      const idx = results.findIndex(r => r.status === 'running');
      if (idx !== -1) cancelJob(idx);
    } else if (e.key === 'j') {
      e.preventDefault();
      cancelAll();
    } else if (e.key === 'p') {
      e.preventDefault();
      if (view === 'export' && exportRef) {
        exportRef.handleExport();
      }
    } else if (e.key === 'r') {
      e.preventDefault();
      if (view === 'export') closeExport();
    } else if (e.key === 'i') {
      e.preventDefault();
      if (view === 'export') handleBack();
    } else if (e.key === ',') {
      e.preventDefault();
      showSettings = !showSettings;
    } else if (e.key === 'h') {
      e.preventDefault();
      showShortcuts = !showShortcuts;
    }
  }

  // Timer effect: tick elapsed seconds for running jobs
  $effect(() => {
    if (anyRunning) {
      if (!timerHandle) {
        timerHandle = setInterval(() => {
          const now = Date.now();
          for (let i = 0; i < results.length; i++) {
            if ((results[i].status === 'running' || results[i].status === 'linting' || results[i].status === 'fixing') && results[i].startedAt) {
              results[i] = { ...results[i], elapsed: Math.floor((now - results[i].startedAt!) / 1000) };
            }
          }
        }, 1000);
      }
    } else {
      if (timerHandle) {
        clearInterval(timerHandle);
        timerHandle = null;
      }
    }
  });

  function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }

  function slugify(value: string, fallback: string): string {
    const slug = value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return slug || fallback;
  }

  function buildRunArtifactPath(
    kind: 'run' | 'rescue',
    runNum: number,
    jobIndex: number,
    jobTitle: string,
    company: string,
    iteration: number,
    errorCount: number,
  ): string {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const titleSlug = slugify(jobTitle, `job${jobIndex + 1}`);
    const companySlug = slugify(company, 'unknown-company');
    const safeIteration = Math.max(0, iteration);
    const safeErrors = Math.max(0, errorCount);
    const base = `${titleSlug}-${companySlug}-${yyyy}${mm}${dd}-run${runNum}-iteration${safeIteration}-errors${safeErrors}`;
    return kind === 'rescue'
      ? `/tmp/coverpro/rescue/${base}.md`
      : `/tmp/coverpro/${base}.md`;
  }

  function splitPackageMarkdown(markdown: string): { resume: string; coverLetter: string } | null {
    const coverLetterStart = markdown.indexOf('## WAR Cover Letter');
    if (coverLetterStart < 0) return null;

    const resume = markdown.slice(0, coverLetterStart).trim();
    const coverLetter = markdown.slice(coverLetterStart).trim();
    if (!resume || !coverLetter) return null;

    return { resume, coverLetter };
  }

  async function writePackageArtifacts(path: string, markdown: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_file', { path, contents: markdown });

    const split = splitPackageMarkdown(markdown);
    if (!split) return;

    const stem = path.replace(/\.md$/i, '');
    await invoke('write_file', { path: `${stem}.resume.md`, contents: split.resume });
    await invoke('write_file', { path: `${stem}.cover-letter.md`, contents: split.coverLetter });
  }

  async function dumpToTmp(
    markdown: string,
    runNum: number,
    jobIndex: number,
    jobTitle: string,
    company: string,
    iteration: number,
    errorCount: number,
  ) {
    try {
      const path = buildRunArtifactPath('run', runNum, jobIndex, jobTitle, company, iteration, errorCount);
      await writePackageArtifacts(path, markdown);
      console.log(`Dumped output to ${path}`);
    } catch (e) {
      console.warn('Failed to dump output to /tmp:', e);
    }
  }

  async function rescueToTmp(
    markdown: string,
    runNum: number,
    jobIndex: number,
    jobTitle: string,
    company: string,
    iteration: number,
    errorCount: number,
  ): Promise<string> {
    const path = buildRunArtifactPath('rescue', runNum, jobIndex, jobTitle, company, iteration, errorCount);
    await writePackageArtifacts(path, markdown);
    return path;
  }

  function cancelJob(index: number) {
    const r = results[index];
    if (r.abortController && (r.status === 'running' || r.status === 'pending')) {
      r.abortController.abort();
      results[index] = { ...r, status: 'cancelled', error: 'Cancelled by user' };
    }
  }

  function cancelAll() {
    for (let i = 0; i < results.length; i++) {
      cancelJob(i);
    }
  }

  function pauseJob(index: number) {
    const current = results[index];
    current.abortController?.abort();
    results[index] = {
      ...current,
      status: 'paused',
      pauseRequested: false,
      resumeResolver: null,
      mutationLocked: true,
      lastMutation: 'Pause freeze applied',
      transientNote: current.currentDraftMarkdown
        ? 'Visible current draft is frozen. Runner mutations for this job are discarded until rerun.'
        : 'State frozen before any draft checkpoint. Runner mutations for this job are discarded until rerun.',
      statusDetail: current.currentDraftMarkdown
        ? 'Paused and frozen on current visible state.'
        : 'Paused and frozen before draft generation completed.',
    };
  }

  function resumeJob(index: number) {
    const r = results[index];
    if (r.resumeResolver) {
      const resumePhase = r.checkpointPhase === 'pre-repair' ? 'Queued next repair call...' : 'Queued next repair iteration...';
      r.resumeResolver('continue');
      results[index] = {
        ...results[index],
        status: r.checkpointPhase === 'pre-repair' ? 'fixing' : 'linting',
        pauseRequested: false,
        resumeResolver: null,
        lastMutation: 'User resumed from paused checkpoint',
        transientNote: 'Current checkpoint is preserved until the next repair result returns.',
        statusDetail: resumePhase,
      };
      return;
    }

    if (r.status === 'paused') {
      results[index] = {
        ...r,
        statusDetail: 'Paused jobs are frozen. Use Redo to continue from a fresh run.',
        transientNote: 'This pause mode discards later runner mutations. Resume is not available for frozen jobs.',
      };
    }
  }

  function acceptJobDraft(index: number) {
    const r = results[index];
    if (r.resumeResolver) {
      r.resumeResolver('accept');
      results[index] = {
        ...results[index],
        pauseRequested: false,
        resumeResolver: null,
        acceptedDraft: true,
        lastMutation: 'User accepted paused draft',
        transientNote: 'Accepted draft is now treated as the final package for this job.',
        statusDetail: 'Accepting paused draft...',
      };
      return;
    }

    if (r.status === 'paused' && r.currentDraftMarkdown) {
      results[index] = {
        ...r,
        markdown: r.currentDraftMarkdown,
        status: 'done',
        acceptedDraft: true,
        lastMutation: 'Frozen draft accepted',
        transientNote: 'Frozen draft promoted to final package.',
        statusDetail: 'Accepted frozen draft as final package.',
      };
    }
  }

  function getExportMarkdown(index: number): string {
    return results[index].markdown || results[index].currentDraftMarkdown;
  }

  function validateImportedPackage(markdown: string): ReturnType<typeof parsePackage> {
    const validation = validatePackageMarkdown(markdown);
    if (!validation.valid || !validation.parsed) {
      throw new Error(`Import failed: ${validation.reason || 'file does not look like a CoverPro package.'}`);
    }
    return validation.parsed;
  }

  function deriveImportedMeta(parsed: ReturnType<typeof parsePackage>): { jobTitle: string; company: string } {
    const titleLine = parsed.title.trim();
    if (!titleLine) {
      return { jobTitle: 'Imported Package', company: '' };
    }

    const splitOnLast = (marker: string) => {
      const idx = titleLine.lastIndexOf(marker);
      if (idx === -1) return null;
      return {
        jobTitle: titleLine.slice(0, idx).trim(),
        company: titleLine.slice(idx + marker.length).trim(),
      };
    };

    const dashed = splitOnLast(' - ');
    if (dashed) return dashed;
    const atSplit = splitOnLast(' @ ');
    if (atSplit) return atSplit;
    return { jobTitle: titleLine, company: '' };
  }

  async function handleImportRepair(file: File, resumeMode: ResumeMode): Promise<void> {
    const markdown = (await file.text()).trim();
    if (!markdown) {
      throw new Error('Imported file is empty.');
    }

    const parsed = validateImportedPackage(markdown);
    const { jobTitle, company } = deriveImportedMeta(parsed);
    const lintResult = lintMarkdown(markdown, resumeMode);
    const importIsAdmissible = lintResult.valid;
    const repairRoute = buildRepairRoute(markdown, resumeMode);

    results = [{
      markdown,
      status: importIsAdmissible ? 'done' : 'paused',
      error: '',
      statusDetail: importIsAdmissible
        ? `Imported ${file.name} for repair/export.`
        : `Imported ${file.name}. Manual review checkpoint ready before any export.`,
      jobTitle,
      company,
      job: {
        jdText: '',
        jobTitle,
        company,
        slotIndex: 0,
        resumeMode,
      },
      startedAt: null,
      elapsed: 0,
      abortController: null,
      keep: false,
      currentDraftMarkdown: markdown,
      draftErrors: lintResult.errors,
      draftFitDiagnostics: null,
      draftAttempt: 0,
      draftMaxAttempts: 0,
      pauseRequested: !importIsAdmissible,
      resumeResolver: null,
      acceptedDraft: false,
      checkpointPhase: !importIsAdmissible ? 'pre-repair' : null,
      lastMutation: 'Imported repair artifact',
      transientNote: importIsAdmissible
        ? `Imported from ${file.name}. Export view is using this file as current state.`
        : `Imported from ${file.name}. This draft is intentionally held for manual salvage before any export.`,
      rescuePath: '',
      rescueStatus: '',
      mutationLocked: false,
      rejectedCandidateDebug: null,
      totalCost: null,
      repairRoute,
      repairFixtureLabel: '',
      repairProof: [],
    }];

    exportJobIndex = importIsAdmissible ? 0 : null;
    view = importIsAdmissible ? 'export' : 'output';
  }

  async function handleLoadRepairFixture(fixtureId: string): Promise<void> {
    const fixture = REPAIR_FIXTURES.find((candidate) => candidate.id === fixtureId);
    if (!fixture) {
      throw new Error(`Unknown repair fixture: ${fixtureId}`);
    }

    const markdown = fixture.markdown.trim();
    const parsed = validateImportedPackage(markdown);
    const { jobTitle, company } = deriveImportedMeta(parsed);
    const lintResult = lintMarkdown(markdown, fixture.mode);
    const repairRoute = buildRepairRoute(markdown, fixture.mode);

    results = [{
      markdown,
      status: 'paused',
      error: '',
      statusDetail: `Loaded ${fixture.label} fixture. Repair checkpoint ready without an LLM call.`,
      jobTitle,
      company,
      job: {
        jdText: '',
        jobTitle,
        company,
        slotIndex: 0,
        resumeMode: fixture.mode,
      },
      startedAt: null,
      elapsed: 0,
      abortController: null,
      keep: false,
      currentDraftMarkdown: markdown,
      draftErrors: lintResult.errors,
      draftFitDiagnostics: null,
      draftAttempt: 0,
      draftMaxAttempts: 0,
      pauseRequested: true,
      resumeResolver: null,
      acceptedDraft: false,
      checkpointPhase: 'pre-repair',
      lastMutation: 'Loaded deterministic repair fixture',
      transientNote: `${fixture.label} is loaded from test fixtures; no live model was called.`,
      rescuePath: '',
      rescueStatus: '',
      mutationLocked: false,
      rejectedCandidateDebug: null,
      totalCost: null,
      repairRoute,
      repairFixtureLabel: fixture.label,
      repairProof: [],
    }];

    exportJobIndex = null;
    view = 'output';
  }

  function getVisibleMarkdown(index: number): string {
    return results[index].currentDraftMarkdown || results[index].markdown;
  }

  async function rescueJob(index: number): Promise<void> {
    const markdown = getVisibleMarkdown(index);
    if (!markdown) return;

    try {
      const path = await rescueToTmp(
        markdown,
        runCounter,
        index,
        results[index].jobTitle,
        results[index].company,
        results[index].draftAttempt,
        results[index].draftErrors.filter((e) => e.severity === 'error').length,
      );
      results[index] = {
        ...results[index],
        rescuePath: path,
        rescueStatus: `Rescued snapshot to ${path}`,
        lastMutation: 'Draft rescued to temp buffer',
      };
    } catch (err) {
      results[index] = {
        ...results[index],
        rescueStatus: `Rescue failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        lastMutation: 'Draft rescue failed',
      };
    }
  }

  function isMutationLocked(index: number): boolean {
    return !!results[index]?.mutationLocked;
  }

  function getAuthority(result: JobResult): 'runner' | 'user' | 'settled' {
    if (result.status === 'paused' || (result.pauseRequested && result.resumeResolver !== null)) return 'user';
    if (result.status === 'done' || result.status === 'error' || result.status === 'cancelled') return 'settled';
    return 'runner';
  }

  function applyLocalRepairToMarkdown(markdown: string, targetKey: string): string {
    if (targetKey === 'summary:bullet:1') {
      return markdown.replace(
        /^-\s*(?:Selected angle:\s*[^.]+\.|selectedAngle\s*[:=]\s*[^.]+\.)\s*/mi,
        '- ',
      );
    }

    if (targetKey === 'war-cover-letter:block') {
      return markdown.replace(/—/g, '-');
    }

    return markdown;
  }

  function getRepairTargetText(markdown: string, targetKey: string): string {
    const parsed = parsePackage(markdown);

    if (targetKey === 'title:block') {
      return parsed.title;
    }

    if (targetKey === 'war-cover-letter:block') {
      return parsed.sections.find((section) => section.kind === 'cover-letter')?.raw.trim() || '';
    }

    if (targetKey.includes(':bullet:')) {
      const [sectionKey, , indexText] = targetKey.split(':');
      const bulletIndex = Number(indexText) - 1;
      const section = parsed.sections.find((candidate) => candidate.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') === sectionKey);
      return section?.bullets[bulletIndex]?.text || '';
    }

    if (targetKey.startsWith('section:')) {
      const sectionKey = targetKey.replace(/^section:/, '');
      const section = parsed.sections.find((candidate) => candidate.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') === sectionKey);
      return section?.raw.trim() || '';
    }

    return '';
  }

  function repairTargetLabel(targetKey: string): string {
    if (targetKey === 'title:block') return 'Title';
    if (targetKey === 'war-cover-letter:block') return 'WAR Cover Letter';
    if (targetKey === 'summary:bullet:1') return 'Summary bullet 1';
    return targetKey
      .replace(/^section:/, '')
      .replace(':block', '')
      .replace(/:bullet:/, ' bullet ')
      .split('-')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');
  }

  function buildLocalRepairProof(before: string, after: string, targetKey: string, preservedTargets: string[]): string[] {
    const beforeTarget = getRepairTargetText(before, targetKey);
    const afterTarget = getRepairTargetText(after, targetKey);
    const proof = [
      beforeTarget !== afterTarget
        ? `${repairTargetLabel(targetKey)} changed.`
        : `${repairTargetLabel(targetKey)} did not change.`,
    ];

    for (const preserved of preservedTargets) {
      if (getRepairTargetText(before, preserved) === getRepairTargetText(after, preserved)) {
        proof.push(`${repairTargetLabel(preserved)} unchanged.`);
      } else {
        proof.push(`${repairTargetLabel(preserved)} changed.`);
      }
    }

    return proof;
  }

  async function applyLocalRepair(index: number, targetKey: string): Promise<void> {
    const current = getVisibleMarkdown(index);
    if (!current) return;

    const activeUnit = results[index].repairRoute?.units.find((unit) => unit.targetKey === targetKey);
    const nextMarkdown = applyLocalRepairToMarkdown(current, targetKey);
    if (nextMarkdown === current) {
      results[index] = {
        ...results[index],
        transientNote: `No local change available for ${targetKey}.`,
        lastMutation: 'Local repair skipped',
      };
      return;
    }

    const resumeMode = results[index].job.resumeMode || appStore.resumeMode;
    const lintResult = lintMarkdown(nextMarkdown, resumeMode);
    const proofTargets = activeUnit?.preservedTargets.filter((target) => target === 'section:focus-digital' || target === 'war-cover-letter:block') || [];
    results[index] = {
      ...results[index],
      markdown: nextMarkdown,
      currentDraftMarkdown: nextMarkdown,
      status: lintResult.valid ? 'done' : 'paused',
      draftErrors: lintResult.errors,
      draftFitDiagnostics: null,
      repairRoute: buildRepairRoute(nextMarkdown, resumeMode),
      repairProof: buildLocalRepairProof(current, nextMarkdown, targetKey, proofTargets),
      lastMutation: `Applied local repair to ${targetKey}`,
      transientNote: 'Local repair changed only the scoped unit. Preserved units were not resent to an LLM.',
      statusDetail: lintResult.valid ? 'Local repair applied; package is lint-clean.' : 'Local repair applied; remaining scoped issues still need review.',
    };
  }

  function createRepairHandler(jobIndex: number): RepairIterationCallback {
    return async (draft) => {
      if (isMutationLocked(jobIndex)) {
        return 'accept';
      }

      const statusDetail = `Paused at ${draft.phase === 'pre-repair' ? 'lint checkpoint' : 'repair checkpoint'}.`;

      results[jobIndex] = {
        ...results[jobIndex],
        status: 'paused',
        currentDraftMarkdown: draft.currentDraftMarkdown,
        draftErrors: draft.errors,
        draftFitDiagnostics: await checkMarkdownFitDiagnostics(draft.currentDraftMarkdown, results[jobIndex].jobTitle),
        draftAttempt: draft.attempt,
        draftMaxAttempts: draft.maxAttempts,
        pauseRequested: true,
        checkpointPhase: draft.phase,
        rejectedCandidateDebug: draft.rejectedCandidate || null,
      totalCost: draft.totalCost ?? results[jobIndex].totalCost,
      repairRoute: buildRepairRoute(draft.currentDraftMarkdown, results[jobIndex].job.resumeMode || appStore.resumeMode),
      repairProof: [],
        lastMutation: draft.phase === 'pre-repair' ? 'Lint checkpoint captured' : `Repair ${draft.attempt} completed`,
        transientNote: draft.phase === 'pre-repair'
          ? 'Runner is blocked. No repair call will start until you explicitly continue or accept this draft.'
          : 'Runner is blocked on this repaired checkpoint. No further mutation will happen until you explicitly continue or accept it.',
        statusDetail,
      };

      return new Promise<DraftDecision>((resolve) => {
        results[jobIndex] = {
          ...results[jobIndex],
          status: 'paused',
          resumeResolver: resolve,
          statusDetail,
        };
      });
    };
  }

  async function runJobAtIndex(job: Job, index: number, runNum: number): Promise<void> {
    if (results[index].status === 'cancelled') return;

    const now = Date.now();
    results[index] = {
      ...results[index],
      status: 'running',
      startedAt: now,
      lastMutation: 'Generation started',
      transientNote: 'No draft is stable yet. The first checkpoint will appear after generation and linting.',
      statusDetail: 'Starting...',
    };

    try {
      const result = await runSingleJob(
        job,
        results[index].abortController!.signal,
        (detail) => {
          if (isMutationLocked(index)) return;
          const nextStatus: JobStatus =
            detail.startsWith('First lint pass') ? 'linting' :
            detail.startsWith('Repair ') ? 'fixing' :
            'running';
          results[index] = {
            ...results[index],
            status: nextStatus,
            statusDetail: detail,
            lastMutation: detail,
            transientNote: nextStatus === 'fixing'
              ? 'Draft may change while repairs continue.'
              : nextStatus === 'linting'
                ? 'Runner is validating the current draft before any repair call.'
                : 'Generation is still in progress; no stable draft checkpoint yet.',
          };
        },
        createRepairHandler(index),
      );

      if (results[index].status === 'cancelled' || isMutationLocked(index)) return;

      const finalMarkdown = result.markdown || results[index].currentDraftMarkdown;
      results[index] = {
        ...results[index],
        markdown: finalMarkdown,
        status: result.status === 'done' ? 'done' : 'error',
        error: result.error || '',
        currentDraftMarkdown: finalMarkdown || results[index].currentDraftMarkdown,
        draftErrors: result.lintErrors || results[index].draftErrors,
        rejectedCandidateDebug: results[index].rejectedCandidateDebug,
        totalCost: result.totalCost ?? results[index].totalCost,
        repairRoute: finalMarkdown ? buildRepairRoute(finalMarkdown, job.resumeMode || appStore.resumeMode) : results[index].repairRoute,
        repairProof: [],
        lastMutation: result.status === 'done' ? 'Final package committed' : 'Run ended in error',
        transientNote: result.status === 'done'
          ? 'Rendered output is final and stable.'
          : 'The run failed before a final package was committed.',
      };

      if (finalMarkdown) {
        void dumpToTmp(
          finalMarkdown,
          runNum,
          index,
          job.jobTitle,
          job.company,
          results[index].draftAttempt,
          (result.lintErrors || results[index].draftErrors).filter((e) => e.severity === 'error').length,
        );
      }

      if (results[index].acceptedDraft && results[index].status === 'done') {
        openExport(index);
      }
    } catch (err) {
      if (results[index].status === 'cancelled' || isMutationLocked(index)) return;
      results[index] = {
        ...results[index],
        markdown: '',
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        lastMutation: 'Unhandled runner error',
        transientNote: 'No further mutation will happen unless you rerun this job.',
      };
    }
  }

  async function handleRun(jobs: Job[]) {
    view = 'output';
    const currentRun = runCounter;
    runCounter++;
    results = jobs.map(j => ({
      markdown: '',
      status: 'pending' as JobStatus,
      error: '',
      statusDetail: '',
      jobTitle: j.jobTitle,
      company: j.company,
      job: j,
      startedAt: null,
      elapsed: 0,
      abortController: new AbortController(),
      keep: false,
      draftErrors: [],
      draftFitDiagnostics: null,
      draftAttempt: 0,
      draftMaxAttempts: 0,
      pauseRequested: false,
      resumeResolver: null,
      acceptedDraft: false,
      checkpointPhase: null,
      lastMutation: 'Queued',
      transientNote: 'Waiting for the job runner to start.',
      rescuePath: '',
      rescueStatus: '',
      mutationLocked: false,
      currentDraftMarkdown: '',
      rejectedCandidateDebug: null,
      totalCost: null,
      repairRoute: null,
      repairFixtureLabel: '',
      repairProof: [],
    }));

    await Promise.allSettled(jobs.map((job, index) => runJobAtIndex(job, index, currentRun)));
  }

  function handleBack() {
    cancelAll();
    // Reset all slots, then write back checked jobs to their original slots
    appStore.resetInputs();
    for (const r of results) {
      if (r.keep) {
        const i = r.job.slotIndex;
        appStore.jobInputs[i] = {
          jobTitle: r.job.jobTitle,
          company: r.job.company,
          jdText: r.job.jdText,
          resumeMode: r.job.resumeMode,
        };
      }
    }
    view = 'input';
    results = [];
  }

  function openExport(index: number) {
    exportJobIndex = index;
    view = 'export';
  }

  function closeExport() {
    exportJobIndex = null;
    view = 'output';
  }

  async function handleRerunJob(index: number) {
    if (anyRunning) return;

    const job = results[index].job;
    const rerunNum = runCounter;
    runCounter++;
    const ac = new AbortController();
    const now = Date.now();
    results[index] = {
      ...results[index],
      status: 'running',
      markdown: '',
      error: '',
      startedAt: now,
      elapsed: 0,
      abortController: ac,
      currentDraftMarkdown: '',
      draftErrors: [],
      draftFitDiagnostics: null,
      draftAttempt: 0,
      draftMaxAttempts: 0,
      pauseRequested: false,
      resumeResolver: null,
      acceptedDraft: false,
      checkpointPhase: null,
      lastMutation: 'Rerun started',
      transientNote: 'Fresh rerun in progress. No stable draft yet.',
      rescuePath: '',
      rescueStatus: '',
      mutationLocked: false,
      rejectedCandidateDebug: null,
      totalCost: null,
      repairRoute: null,
      repairFixtureLabel: '',
      repairProof: [],
    };

    try {
      const result = await runSingleJob(
        job,
        ac.signal,
        (detail) => {
          if (isMutationLocked(index)) return;
          const nextStatus: JobStatus =
            detail.startsWith('First lint pass') ? 'linting' :
            detail.startsWith('Repair ') ? 'fixing' :
            'running';
          results[index] = {
            ...results[index],
            status: nextStatus,
            statusDetail: detail,
            lastMutation: detail,
            transientNote: nextStatus === 'fixing'
              ? 'Draft may change while repairs continue.'
              : nextStatus === 'linting'
                ? 'Runner is validating the current draft before any repair call.'
                : 'Generation is still in progress; no stable draft checkpoint yet.',
          };
        },
        createRepairHandler(index),
      );
      if (results[index].status === 'cancelled' || isMutationLocked(index)) return;
      const finalMarkdown = result.markdown || results[index].currentDraftMarkdown;
      results[index] = {
        ...results[index],
        markdown: finalMarkdown,
        status: result.status === 'done' ? 'done' : 'error',
        error: result.error || '',
        currentDraftMarkdown: finalMarkdown || results[index].currentDraftMarkdown,
        draftErrors: result.lintErrors || results[index].draftErrors,
        rejectedCandidateDebug: results[index].rejectedCandidateDebug,
        totalCost: result.totalCost ?? results[index].totalCost,
        repairRoute: finalMarkdown ? buildRepairRoute(finalMarkdown, job.resumeMode || appStore.resumeMode) : results[index].repairRoute,
        repairProof: [],
        lastMutation: result.status === 'done' ? 'Final package committed' : 'Rerun ended in error',
        transientNote: result.status === 'done'
          ? 'Rendered output is final and stable.'
          : 'The rerun failed before a final package was committed.',
      };
      if (finalMarkdown) {
        void dumpToTmp(
          finalMarkdown,
          rerunNum,
          index,
          job.jobTitle,
          job.company,
          results[index].draftAttempt,
          (result.lintErrors || results[index].draftErrors).filter((e) => e.severity === 'error').length,
        );
      }
      if (results[index].acceptedDraft && results[index].status === 'done') {
        openExport(index);
      }
    } catch (err) {
      if (results[index].status === 'cancelled' || isMutationLocked(index)) return;
      results[index] = {
        ...results[index],
        markdown: '',
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        lastMutation: 'Unhandled rerun error',
        transientNote: 'No further mutation will happen unless you rerun this job.',
      };
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Settings button (floating, always visible) -->
<button class="settings-btn" onclick={() => (showSettings = !showSettings)} title="Settings (Ctrl+,)">
  <IconSettings />
</button>

<!-- Model/Backend display (bottom left, always visible) -->
<div class="model-display">
  {#if appStore.selectedBackend === 'claude' || appStore.selectedBackend === 'codex'}
    Agent - {appStore.selectedModel === 'sonnet' ? 'Sonnet' : appStore.selectedModel === 'opus' ? 'Opus' : appStore.selectedModel === 'haiku' ? 'Haiku' : appStore.selectedModel}{appStore.selectedBackend !== 'claude' ? `-${appStore.selectedBackend.charAt(0).toUpperCase() + appStore.selectedBackend.slice(1)}` : ''}
  {:else}
    API - {appStore.selectedModel}
  {/if}
</div>

<!-- Settings modal -->
{#if showSettings}
  <button
    type="button"
    class="modal-backdrop"
    aria-label="Close settings"
    onclick={() => (showSettings = false)}
  ></button>
  <div class="modal-container">
    <SettingsPanel onClose={() => (showSettings = false)} />
  </div>
{/if}

<!-- Keyboard shortcuts modal -->
{#if showShortcuts}
  <button
    type="button"
    class="modal-backdrop"
    aria-label="Close keyboard shortcuts"
    onclick={() => (showShortcuts = false)}
  ></button>
  <div class="modal-container">
    <div class="shortcuts-panel" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div class="shortcuts-header">
        <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
        <button
          type="button"
          class="shortcuts-close"
          aria-label="Close keyboard shortcuts"
          onclick={() => (showShortcuts = false)}
        >
          ×
        </button>
      </div>
      <div class="shortcuts-body">
        <p class="shortcuts-note">Core:</p>
        <ul class="shortcuts-list">
          <li><kbd>Ctrl+G</kbd> Generate (input view)</li>
          <li><kbd>Ctrl+Shift+R</kbd> Open repair import / fixture loader (input view)</li>
          <li><kbd>Ctrl+K</kbd> Cancel current running job</li>
          <li><kbd>Ctrl+J</kbd> Cancel all running jobs</li>
          <li><kbd>Ctrl+P</kbd> Export PDFs (export view)</li>
          <li><kbd>Ctrl+R</kbd> Back to results (export view)</li>
          <li><kbd>Ctrl+I</kbd> Back to input (export view)</li>
          <li><kbd>Ctrl+,</kbd> Open/close settings</li>
          <li><kbd>Ctrl+H</kbd> Open/close this shortcuts panel</li>
        </ul>
        <p class="shortcuts-note">Navigation / Pickers:</p>
        <ul class="shortcuts-list">
          <li><kbd>Ctrl+←</kbd> Previous job slot</li>
          <li><kbd>Ctrl+→</kbd> Next job slot</li>
          <li><kbd>Ctrl+M</kbd> Focus resume mode dropdown</li>
          <li><kbd>Ctrl/Cmd+Shift+M</kbd> Focus model picker</li>
          <li><kbd>Ctrl/Cmd+Shift+B</kbd> Focus backend/provider picker</li>
          <li><kbd>Tab</kbd> Cycle focus through controls</li>
          <li><kbd>Esc</kbd> Close open picker or modal</li>
        </ul>
      </div>
    </div>
  </div>
{/if}

<main class="page">
  {#if view === 'input'}
    <SimpleInput
      bind:this={inputRef}
      onRun={handleRun}
      onImportRepair={handleImportRepair}
      onLoadRepairFixture={handleLoadRepairFixture}
      onOpenSettings={() => { showSettings = true; }}
    />
  {:else if view === 'export' && exportJobIndex !== null && results[exportJobIndex]}
    <ExportView
      bind:this={exportRef}
      markdown={getExportMarkdown(exportJobIndex)}
      jobTitle={results[exportJobIndex].jobTitle}
      company={results[exportJobIndex].company}
      onResults={closeExport}
      onInput={handleBack}
    />
  {:else}
    <div class="output-view">
      <!-- Header -->
      <div class="output-header">
        <button type="button" class="back-btn" onclick={handleBack}>
          ← Back
        </button>

        <!-- Status icons + timers for all jobs -->
        <div class="status-row">
          {#each results as result, i}
            <div class="status-item" title="{result.jobTitle || `Job ${i + 1}`}: {result.statusDetail || result.status}">
              <span class="status-index">{i + 1}</span>
              {#if result.status === 'pending'}
                <IconBadge class="status-icon status-pending" />
              {:else if result.status === 'running'}
                <IconRefreshCw class="status-icon status-running" />
                <span class="elapsed">{formatElapsed(result.elapsed)}</span>
                <button type="button" class="cancel-btn" onclick={() => cancelJob(i)} title="Cancel this job">
                  <IconX class="cancel-icon" />
                </button>
              {:else if result.status === 'done'}
                <IconCheck class="status-icon status-done" />
                <span class="elapsed done">{formatElapsed(result.elapsed)}</span>
              {:else if result.status === 'paused'}
                <IconPause class="status-icon status-cancelled" />
                {#if result.elapsed > 0}
                  <span class="elapsed">{formatElapsed(result.elapsed)}</span>
                {/if}
              {:else if result.status === 'error'}
                <IconClipboardX class="status-icon status-error" />
                {#if result.elapsed > 0}
                  <span class="elapsed error">{formatElapsed(result.elapsed)}</span>
                {/if}
              {:else if result.status === 'cancelled'}
                <IconX class="status-icon status-cancelled" />
              {/if}
            </div>
          {/each}
        </div>

        <div class="header-actions-right">
          {#if anyRunning}
            <button type="button" class="cancel-all-btn" onclick={cancelAll}>
              Cancel All
            </button>
          {/if}
        </div>
      </div>

      <!-- All done indicator -->
      {#if allDone}
        <div class="completion-banner {anyFailed || anyCancelled ? 'partial' : 'success'}">
          {#if anyFailed || anyCancelled}
            {@const errorCount = results.filter(r => r.status === 'error').length}
            {@const cancelCount = results.filter(r => r.status === 'cancelled').length}
            Completed{errorCount ? ` with ${errorCount} error(s)` : ''}{cancelCount ? ` (${cancelCount} cancelled)` : ''}
          {:else}
            All packages complete
          {/if}
        </div>
      {/if}

      <!-- Single column output list -->
      <div class="output-list">
        {#each results as result, i}
          <div class="output-item">
            <label class="job-label">
              <input
                type="checkbox"
                class="keep-check"
                bind:checked={result.keep}
              />
              {result.jobTitle || `Job ${i + 1}`}{result.company ? ` @ ${result.company}` : ''}
            </label>
            {#if result.status === 'cancelled'}
              <div class="cancelled-msg">Cancelled</div>
            {:else}
              <SimpleOutput
                markdown={result.markdown}
                status={result.status}
                error={result.error}
                statusDetail={result.statusDetail}
                currentDraftMarkdown={result.currentDraftMarkdown}
                draftErrors={result.draftErrors}
                draftFitDiagnostics={result.draftFitDiagnostics}
                draftAttempt={result.draftAttempt}
                draftMaxAttempts={result.draftMaxAttempts}
                rejectedCandidateDebug={result.rejectedCandidateDebug}
                totalCost={result.totalCost}
                repairRoute={result.repairRoute}
                repairFixtureLabel={result.repairFixtureLabel}
                repairProof={result.repairProof}
                isPaused={result.status === 'paused' || (result.pauseRequested && result.resumeResolver !== null)}
                isRepairing={(result.status === 'running' || result.status === 'linting' || result.status === 'fixing') && result.currentDraftMarkdown !== ''}
                checkpointPhase={result.checkpointPhase}
                lastMutation={result.lastMutation}
                transientNote={result.transientNote}
                rescueStatus={result.rescueStatus}
                rescuePath={result.rescuePath}
                authority={getAuthority(result)}
                renderedSource={result.markdown ? 'final' : result.currentDraftMarkdown ? 'draft' : 'none'}
                exportSource={result.markdown ? 'final' : result.currentDraftMarkdown ? 'draft' : 'none'}
                draftStability={result.status === 'paused' || (result.pauseRequested && result.resumeResolver !== null) ? 'stable' : result.markdown ? 'final' : result.currentDraftMarkdown ? 'transient' : 'none'}
                onPause={() => pauseJob(i)}
                onResume={() => resumeJob(i)}
                onAcceptDraft={() => acceptJobDraft(i)}
                onApplyLocalRepair={(targetKey) => applyLocalRepair(i, targetKey)}
                onRerun={result.job.jdText ? () => handleRerunJob(i) : undefined}
                onRescue={() => rescueJob(i)}
                onExport={(result.status === 'done' || !!result.currentDraftMarkdown) ? () => openExport(i) : undefined}
              />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</main>

<style>
  .page {
    height: 100vh;
    height: 100dvh; /* Dynamic viewport height for mobile */
  }

  /* --- Output view layout --- */
  .output-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-md) var(--space-lg);
    gap: var(--space-sm);
    /* Add safe area padding for mobile */
    padding-top: calc(var(--space-md) + max(env(safe-area-inset-top, 0px), var(--android-status-fallback)));
    padding-bottom: calc(var(--space-md) + max(env(safe-area-inset-bottom, 0px), var(--android-nav-fallback)));
  }

  @media (min-width: 768px) {
    .output-view {
      padding: var(--space-lg) var(--space-xl);
    }
  }

  /* --- Output header --- */
  .output-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
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

  .header-actions-right {
    min-width: 5rem;
    display: flex;
    justify-content: flex-end;
  }

  /* --- Status row --- */
  .status-row {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
    flex-wrap: wrap;
  }

  @media (min-width: 768px) {
    .status-row {
      gap: var(--space-lg);
    }
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .status-index {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .elapsed {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    min-width: 2rem;
  }

  .elapsed.done {
    color: rgb(var(--color-success-500));
  }

  .elapsed.error {
    color: rgb(var(--color-error-500));
  }

  /* --- Cancel buttons --- */
  .cancel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
  }

  .cancel-btn:hover {
    background: rgb(var(--color-error-500) / 0.15);
    color: rgb(var(--color-error-500));
  }

  :global(.cancel-icon) {
    width: 0.85rem;
    height: 0.85rem;
  }

  .cancel-all-btn {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid rgb(var(--color-error-500) / 0.4);
    background: rgb(var(--color-error-500) / 0.08);
    cursor: pointer;
    font-size: 0.8rem;
    color: rgb(var(--color-error-500));
    font-family: inherit;
    font-weight: 500;
  }

  .cancel-all-btn:hover {
    background: rgb(var(--color-error-500) / 0.15);
  }

  :global(.status-icon) {
    width: 1.25rem;
    height: 1.25rem;
  }

  :global(.status-pending) {
    color: rgb(var(--color-surface-500));
  }

  :global(.status-running) {
    color: rgb(var(--color-warning-500));
    animation: spin 1s linear infinite;
  }

  :global(.status-done) {
    color: rgb(var(--color-success-500));
  }

  :global(.status-error) {
    color: rgb(var(--color-error-500));
  }

  :global(.status-cancelled) {
    color: var(--text-muted);
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* --- Completion banner --- */
  .completion-banner {
    text-align: center;
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    font-weight: 500;
  }

  .completion-banner.success {
    background: rgb(var(--color-success-500) / 0.1);
    color: rgb(var(--color-tertiary-700));
  }

  .completion-banner.partial {
    background: rgb(var(--color-warning-500) / 0.1);
    color: rgb(var(--color-warning-500));
  }

  /* --- Output list --- */
  .output-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .output-item {
    display: flex;
    flex-direction: column;
  }

  .job-label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: var(--space-xs);
    cursor: pointer;
    user-select: none;
  }

  .keep-check {
    -webkit-appearance: checkbox;
    appearance: checkbox;
    width: 0.9rem;
    height: 0.9rem;
    accent-color: var(--accent-color);
    cursor: pointer;
  }

  .cancelled-msg {
    padding: var(--space-sm) var(--space-md);
    font-size: 0.85rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* --- Settings button --- */
  .settings-btn {
    position: fixed;
    bottom: calc(1rem + max(env(safe-area-inset-bottom, 0px), var(--android-navbar-fallback, 0px)));
    right: 1rem;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    transition: all 0.2s ease;
  }

  .settings-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    transform: rotate(90deg);
  }

  /* --- Model display (bottom left) --- */
  .model-display {
    position: fixed;
    bottom: calc(1rem + max(env(safe-area-inset-bottom, 0px), var(--android-navbar-fallback, 0px)));
    left: 1rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-family: monospace;
    z-index: 50;
    pointer-events: none;
    user-select: none;
  }

  /* --- Settings modal --- */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 200;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }

  .modal-container {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 201;
    padding: 1rem;
    pointer-events: none;
  }

  .modal-container > :global(*) {
    pointer-events: all;
  }

  .shortcuts-panel {
    width: min(36rem, 92vw);
    max-height: min(80vh, 42rem);
    overflow: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
  }

  .shortcuts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--border-color);
  }

  .shortcuts-header h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .shortcuts-close {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.4rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.1rem 0.3rem;
  }

  .shortcuts-close:hover {
    color: var(--text-primary);
  }

  .shortcuts-body {
    padding: 0.9rem 1rem 1rem;
  }

  .shortcuts-note {
    margin: 0.15rem 0 0.55rem;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .shortcuts-list {
    margin: 0 0 0.85rem;
    padding-left: 1.15rem;
  }

  .shortcuts-list li {
    margin: 0 0 0.35rem;
    color: var(--text-primary);
    font-size: 0.86rem;
  }

  kbd {
    display: inline-block;
    padding: 0.08rem 0.38rem;
    border: 1px solid var(--border-color);
    border-bottom-width: 2px;
    border-radius: 0.35rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.78rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    white-space: nowrap;
  }
</style>
