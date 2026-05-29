import type { Job, JobInput, JobStatus, Run, LintError, LintResult, PipelineStep, ResumeMode, LlmBackend } from '$lib/types';
import { appStore } from '$lib/stores/app.svelte';
import { storage, generateRunId, createRunIndexEntry } from '$lib/utils/storage';
import { markdownToHtml } from '$lib/utils/markdown';
import { getBulletFieldKey, getBulletFieldLabel, lintMarkdown } from '$lib/utils/linter';
import { checkMarkdownFitDiagnostics } from '$lib/utils/pdf-export';
import { parsePackage, validatePackageMarkdown } from '$lib/utils/resume-parser';
import { loadApiSettings } from '$lib/utils/settings';
import { getModelForTier, getModelTier } from '$lib/config/models';
import { DEFAULT_RESUME_MODE, RESUME_MODE_MAP } from '$lib/config/resume-modes';
import { EXPERIENCE_DATA, INSTRUCTIONS, POSITIONING_ANGLES, ROLE_FIT, NEGATIVE_SIGNALS, STAR_BANK, SKILL_TAGS, PORTFOLIO_SITES } from '$lib/config/resume-data';
import { tryRenderStructuredPackage, type StructuredResumeMode } from '$lib/config/structured-output';

// Dynamic import for Tauri API to handle browser context
async function getTauriInvoke(): Promise<typeof import('@tauri-apps/api/core').invoke> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke;
  }
  throw new Error('Tauri API not available. Please run this app via "bun run tauri dev".');
}

const MAX_CONCURRENT = 4;
const MAX_REPAIR_ATTEMPTS = 10; // Keep retrying until lint passes or we hit a hard cap
const BAD_FIT_THRESHOLD = 4; // If we need this many repairs, job might be a bad fit

function getConcurrencyLimit(): number {
  return appStore.selectedBackend === 'codex' ? 1 : MAX_CONCURRENT;
}

async function runJobsWithConcurrency(run: Run, jobs: Job[], signal: AbortSignal): Promise<void> {
  const limit = Math.max(1, Math.min(getConcurrencyLimit(), jobs.length));
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < jobs.length) {
      const job = jobs[nextIndex++];
      await executeJob(run, job, signal);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
}

// JD classification result (exported for pre-run UI)
export interface JdClassification {
  tier: 'tier1' | 'tier2' | 'tier3_avoid';
  warnings: string[];
  tier1Hits: number;
  tier3Hits: number;
}

// Classify JD for role fit before generation (exported for pre-run UI)
export function classifyJD(jdText: string): JdClassification {
  const text = jdText.toLowerCase();
  const warnings: string[] = [];

  // Check hard no signals first
  for (const signal of NEGATIVE_SIGNALS.hardNo) {
    if (text.includes(signal.toLowerCase())) {
      warnings.push(`⛔ Hard no: "${signal}"`);
    }
  }

  // Check soft no signals
  for (const signal of NEGATIVE_SIGNALS.softNo) {
    if (text.includes(signal.toLowerCase())) {
      warnings.push(`⚠️ Soft no: "${signal}"`);
    }
  }

  // Count tier signals
  const tier1Hits = ROLE_FIT.tier1.signals.filter(s => text.includes(s.toLowerCase())).length;
  const tier3Hits = ROLE_FIT.tier3_avoid.signals.filter(s => text.includes(s.toLowerCase())).length;

  let tier: 'tier1' | 'tier2' | 'tier3_avoid';
  if (warnings.some(w => w.startsWith('⛔')) || tier3Hits > tier1Hits) {
    tier = 'tier3_avoid';
  } else if (tier1Hits >= 2) {
    tier = 'tier1';
  } else {
    tier = 'tier2';
  }

  return { tier, warnings, tier1Hits, tier3Hits };
}

// Get emphasized employers based on JD skill keywords
function getEmphasizedEmployers(jdText: string): string[] {
  const text = jdText.toLowerCase();
  const employerScores: Record<string, number> = {};

  for (const [skill, employers] of Object.entries(SKILL_TAGS)) {
    if (text.includes(skill.toLowerCase())) {
      for (const emp of employers) {
        employerScores[emp] = (employerScores[emp] || 0) + 1;
      }
    }
  }

  return Object.entries(employerScores)
    .sort((a, b) => b[1] - a[1])
    .map(([emp]) => emp);
}

interface RunnerState {
  isRunning: boolean;
  abortController: AbortController | null;
  activeProcesses: Map<number, number>; // jobId -> pid
}

interface TypstBulletMeasureInput {
  fieldKey: string;
  text: string;
}

interface TypstBulletMeasureResult {
  fieldKey: string;
  text: string;
  contentWidthPt: number | null;
  naturalWidthPt: number | null;
  wrappedHeightPt: number | null;
  singleLineHeightPt: number | null;
  overflowWidthPt: number | null;
  singleLine: boolean;
  estimatedTrimChars: number | null;
  estimatedLineCount: number | null;
}

const state: RunnerState = {
  isRunning: false,
  abortController: null,
  activeProcesses: new Map(),
};

interface EditableBlock {
  heading: string;
  headingKey: string;
  lines: string[];
  bulletLineIndexes: number[];
}

interface EditableDocument {
  titleLine: string;
  leadingLines: string[];
  blocks: EditableBlock[];
}

function validateCandidatePackage(markdown: string): { valid: boolean; reason?: string } {
  const validation = validatePackageMarkdown(markdown);
  return {
    valid: validation.valid,
    reason: validation.reason,
  };
}

function collectTypstBulletMeasureInputs(markdown: string): TypstBulletMeasureInput[] {
  const parsed = parsePackage(markdown);
  const inputs: TypstBulletMeasureInput[] = [];

  for (const section of parsed.sections) {
    if (section.kind !== 'experience') continue;
    for (const [index, bullet] of section.bullets.entries()) {
      inputs.push({
        fieldKey: getBulletFieldKey(section.heading, index),
        text: bullet.text,
      });
    }
  }

  return inputs;
}

function formatTrimGuidance(estimatedTrimChars: number | null): string {
  if (typeof estimatedTrimChars !== 'number' || estimatedTrimChars <= 0) {
    return 'Cut roughly 3-6 characters or tighten a long word/phrase.';
  }

  const low = Math.max(1, estimatedTrimChars);
  const high = Math.max(low + 2, Math.ceil(estimatedTrimChars * 1.6));
  return `Cut roughly ${low}-${high} characters, or replace one wide phrase.`;
}

async function enrichLintWithTypstMeasurements(markdown: string, lintResult: LintResult): Promise<LintResult> {
  const bulletInputs = collectTypstBulletMeasureInputs(markdown);
  if (bulletInputs.length === 0) {
    return lintResult;
  }

  let measured: TypstBulletMeasureResult[];
  try {
    const invoke = await getTauriInvoke();
    measured = await invoke<TypstBulletMeasureResult[]>('measure_typst_bullets', { bullets: bulletInputs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...lintResult,
      errors: [
        ...lintResult.errors,
        {
          code: 'typst-bullet-measurement-unavailable',
          block: 'Typst bullet measurement',
          message: `Typst bullet measurement was unavailable: ${message}`,
          severity: 'warning',
        },
      ],
    };
  }

  const measurementErrors: LintError[] = [];
  const parsed = parsePackage(markdown);
  let globalBulletIndex = 0;

  for (const section of parsed.sections) {
    if (section.kind !== 'experience') continue;
    for (const [index] of section.bullets.entries()) {
      const measurement = measured[globalBulletIndex++];
      if (!measurement || measurement.singleLine) continue;

      const width = typeof measurement.naturalWidthPt === 'number' ? measurement.naturalWidthPt.toFixed(1) : 'n/a';
      const available = typeof measurement.contentWidthPt === 'number' ? measurement.contentWidthPt.toFixed(1) : 'n/a';
      const overflow = typeof measurement.overflowWidthPt === 'number' ? measurement.overflowWidthPt.toFixed(1) : 'n/a';
      const lineCount = typeof measurement.estimatedLineCount === 'number' ? measurement.estimatedLineCount : 2;

      measurementErrors.push({
        code: 'typst-bullet-too-wide',
        block: section.heading,
        message: `Typst wraps this bullet to about ${lineCount} lines (${width}pt measured vs ${available}pt available, overflow ${overflow}pt). ${formatTrimGuidance(measurement.estimatedTrimChars)}`,
        severity: 'error',
        fieldKeys: [measurement.fieldKey],
        fieldKey: measurement.fieldKey,
        fieldLabel: getBulletFieldLabel(section.heading, index),
      });
    }
  }

  if (measurementErrors.length === 0) {
    return lintResult;
  }

  return {
    ...lintResult,
    valid: false,
    errors: [...lintResult.errors, ...measurementErrors],
  };
}

async function lintMarkdownWithTypst(markdown: string, mode: ResumeMode) {
  const lintResult = lintMarkdown(markdown, mode);
  const bulletEnriched = await enrichLintWithTypstMeasurements(markdown, lintResult);
  const fitDiagnostics = await checkMarkdownFitDiagnostics(markdown, '');
  if (fitDiagnostics.preflight.failures.length === 0) {
    return bulletEnriched;
  }

  const preflightErrors: LintError[] = fitDiagnostics.preflight.failures.map((failure) => ({
    code: failure.code,
    block: 'Document',
    message: failure.message,
    severity: 'error',
  }));

  return {
    ...bulletEnriched,
    valid: false,
    errors: [...bulletEnriched.errors, ...preflightErrors],
  };
}

export async function analyzeDraftMarkdown(markdown: string, mode: ResumeMode) {
  return lintMarkdownWithTypst(markdown, mode);
}

function getStructuredMode(mode: ResumeMode): StructuredResumeMode | null {
  return mode === 'content' || mode === 'pmm' ? mode : null;
}

function normalizeGeneratedPackage(rawText: string, mode: ResumeMode): string {
  const structuredMode = getStructuredMode(mode);
  if (structuredMode) {
    const structured = tryRenderStructuredPackage(rawText, structuredMode);
    if (structured) {
      return structured.markdown;
    }
  }

  return extractMarkdown(rawText);
}

function normalizeFieldSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseEditableDocument(markdown: string): EditableDocument {
  const lines = markdown.split('\n');
  const blocks: EditableBlock[] = [];
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line));
  const titleLine = titleIndex >= 0 ? lines[titleIndex] : '';
  const leadingLines = titleIndex >= 0 ? lines.slice(0, titleIndex) : [];

  let current: EditableBlock | null = null;

  const flush = () => {
    if (current) {
      blocks.push(current);
    }
  };

  for (let i = titleIndex >= 0 ? titleIndex + 1 : 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      flush();
      current = {
        heading: headerMatch[1],
        headingKey: normalizeFieldSegment(headerMatch[1]),
        lines: [],
        bulletLineIndexes: [],
      };
      continue;
    }

    if (!current) continue;
    const currentLineIndex = current.lines.length;
    current.lines.push(line);
    if (/^[-*]\s+(.+)$/.test(line)) {
      current.bulletLineIndexes.push(currentLineIndex);
    }
  }

  flush();

  return { titleLine, leadingLines, blocks };
}

function stringifyEditableDocument(doc: EditableDocument): string {
  const parts: string[] = [];
  if (doc.leadingLines.length > 0) {
    parts.push(...doc.leadingLines);
  }
  if (doc.titleLine) {
    parts.push(doc.titleLine);
  }
  for (const block of doc.blocks) {
    if (parts.length > 0 && parts[parts.length - 1] !== '') {
      parts.push('');
    }
    parts.push(`## ${block.heading}`);
    parts.push(...block.lines);
  }
  return parts.join('\n').trim() + '\n';
}

function replaceFailedFields(baseMarkdown: string, candidateMarkdown: string, failedFieldKeys: string[]): string {
  const baseDoc = parseEditableDocument(baseMarkdown);
  const candidateDoc = parseEditableDocument(candidateMarkdown);
  const candidateBlockMap = new Map(candidateDoc.blocks.map((block) => [block.headingKey, block]));

  for (const fieldKey of failedFieldKeys) {
    const [blockKey, kind, indexText] = fieldKey.split(':');
    const baseBlock = baseDoc.blocks.find((block) => block.headingKey === blockKey);
    const candidateBlock = candidateBlockMap.get(blockKey);
    if (!baseBlock || !candidateBlock) continue;

    if (kind === 'bullet') {
      const bulletIndex = Number(indexText) - 1;
      if (Number.isNaN(bulletIndex)) continue;
      const baseLineIndex = baseBlock.bulletLineIndexes[bulletIndex];
      const candidateLineIndex = candidateBlock.bulletLineIndexes[bulletIndex];
      if (baseLineIndex === undefined || candidateLineIndex === undefined) continue;
      baseBlock.lines[baseLineIndex] = candidateBlock.lines[candidateLineIndex];
      continue;
    }

    if (kind === 'block') {
      baseBlock.lines = [...candidateBlock.lines];
      baseBlock.bulletLineIndexes = [...candidateBlock.bulletLineIndexes];
    }
  }

  return stringifyEditableDocument(baseDoc);
}

function extractBulletText(markdown: string, fieldKey: string): string | null {
  const [blockKey, kind, indexText] = fieldKey.split(':');
  if (kind !== 'bullet') return null;

  const bulletIndex = Number(indexText) - 1;
  if (Number.isNaN(bulletIndex)) return null;

  const doc = parseEditableDocument(markdown);
  const block = doc.blocks.find((candidate) => candidate.headingKey === blockKey);
  if (!block) return null;

  const lineIndex = block.bulletLineIndexes[bulletIndex];
  if (lineIndex === undefined) return null;

  const line = block.lines[lineIndex];
  const match = line.match(/^[-*]\s+(.+)$/);
  return match ? match[1] : null;
}

function extractTitleLine(markdown: string): string | null {
  return markdown.split('\n').find((line) => /^#\s+/.test(line)) || null;
}

function buildScopedLineRepairPrompt(markdown: string, errors: LintError[]): string | null {
  const scopedErrors = errors.filter(
    (error) => error.severity === 'error' && error.fieldKey && isScopedLineRepairField(error.fieldKey) && error.fieldLabel,
  );
  if (scopedErrors.length === 0) return null;

  const grouped = new Map<string, { fieldKey: string; label: string; block: string; original: string; reasons: string[] }>();

  for (const error of scopedErrors) {
    const fieldKey = error.fieldKey as string;
    const existing = grouped.get(fieldKey);
    if (existing) {
      existing.reasons.push(error.message);
      continue;
    }

    const original = fieldKey === 'title:block'
      ? extractTitleLine(markdown)
      : extractBulletText(markdown, fieldKey);
    if (!original) return null;

    grouped.set(fieldKey, {
      fieldKey,
      label: error.fieldLabel as string,
      block: error.block,
      original,
      reasons: [error.message],
    });
  }

  const entries = Array.from(grouped.values());

  return `Rewrite only the failing resume line(s) below.

Return exactly ${entries.length} line(s), in the same order.
For title lines, start with "# ".
For bullet lines, start with "- ".
Do not return section headings, numbering, notes, explanations, or unchanged lines.

Rules:
- Keep each line in its original role.
- Preserve the same facts, metrics, named entities, and claim.
- Fix only the stated lint failures.
- For bullet lines, target 80-110 characters and end with a period.
- For title lines, preserve the job title and company while removing internal notes.
- Stay close to the original tone.

Failing lines:
${entries.map((entry) => `### ${entry.label}
Section: ${entry.block}
Original: ${entry.original}
Issues:
${entry.reasons.map((reason) => `- ${reason}`).join('\n')}`).join('\n\n')}
`;
}

function applyScopedLineRepair(baseMarkdown: string, repairResponse: string, failedFieldKeys: string[]): string | null {
  const repairedLines = repairResponse
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^#\s+/.test(line) || /^[-*]\s+/.test(line));

  if (repairedLines.length !== failedFieldKeys.length) {
    return null;
  }

  const doc = parseEditableDocument(baseMarkdown);

  for (let i = 0; i < failedFieldKeys.length; i++) {
    const [blockKey, kind, indexText] = failedFieldKeys[i].split(':');
    if (failedFieldKeys[i] === 'title:block') {
      if (!/^#\s+/.test(repairedLines[i])) return null;
      doc.titleLine = repairedLines[i];
      continue;
    }

    if (kind !== 'bullet') return null;

    const bulletIndex = Number(indexText) - 1;
    if (Number.isNaN(bulletIndex)) return null;

    const block = doc.blocks.find((candidate) => candidate.headingKey === blockKey);
    if (!block) return null;

    const lineIndex = block.bulletLineIndexes[bulletIndex];
    if (lineIndex === undefined) return null;

    block.lines[lineIndex] = repairedLines[i];
  }

  return stringifyEditableDocument(doc);
}

function isScopedLineRepairField(fieldKey: string): boolean {
  return fieldKey === 'title:block' || fieldKey.includes(':bullet:');
}

function extractCoverLetterSection(markdown: string): string | null {
  const match = markdown.match(/^## WAR Cover Letter\s*\n[\s\S]*?(?=^## |\s*$)/m);
  return match ? match[0].trim() : null;
}

function hasCoverLetterRepairError(errors: LintError[]): boolean {
  return errors.some((error) =>
    error.fieldKey === 'war-cover-letter:block' ||
    error.fieldKeys?.includes('war-cover-letter:block') ||
    error.code === 'cover-letter-missing' ||
    error.code?.startsWith('cover-letter-')
  );
}

function preserveCoverLetterIfUnchanged(baseMarkdown: string, candidateMarkdown: string, errors: LintError[]): string {
  if (hasCoverLetterRepairError(errors)) {
    return candidateMarkdown;
  }

  const originalCoverLetter = extractCoverLetterSection(baseMarkdown);
  const candidateCoverLetter = extractCoverLetterSection(candidateMarkdown);
  if (!originalCoverLetter || !candidateCoverLetter) {
    return candidateMarkdown;
  }

  return candidateMarkdown.replace(candidateCoverLetter, originalCoverLetter);
}

// Strip LLM reasoning preamble/postamble and fix duplicate/misnamed sections.
function extractMarkdown(raw: string): string {
  const fencedMarkdown = raw.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i)?.[1];
  const normalizedInput = (fencedMarkdown || raw)
    .replace(/\r\n/g, '\n')
    .replace(/^Here(?:'s| is)\s+the\s+(?:corrected|updated)\s+markdown:\s*/i, '')
    .trim();
  const lines = normalizedInput.split('\n');
  const firstHeading = lines.findIndex((line) => /^#\s+/.test(line) || /^##\s+/.test(line));
  if (firstHeading === -1) return normalizedInput;

  // Find last non-empty content line (trim trailing junk)
  let end = lines.length - 1;
  while (end > firstHeading && lines[end].trim() === '') end--;
  while (end > firstHeading && (/^---\s*$/.test(lines[end]) || /^```/.test(lines[end]) || /^\*\*\s*Changes/i.test(lines[end]) || /^The\s+(one\s+)?change/i.test(lines[end]) || /^\*\*\s*Need\s+\d/i.test(lines[end]) || /^-\s+\*\*Need\s+\d/i.test(lines[end]) || /^Let me identify/i.test(lines[end]))) {
    end--;
    while (end > firstHeading && lines[end].trim() === '') end--;
  }

  let result = lines.slice(firstHeading, end + 1).join('\n').trim();

  if (!result.startsWith('# ')) {
    result = `# Untitled - Imported\n\n${result}`;
  }

  // Normalize "## Cover Letter" to "## WAR Cover Letter"
  result = result.replace(/^##\s*(?:WAR\s+)?Cover Letter(?:\s*\(JD Questions Only\))?\s*$/gim, '## WAR Cover Letter');

  // Strip "## Cover Letter (JD Questions Only)" sections with placeholder content
  result = result.replace(/^## Cover Letter \(JD Questions[^)]*\)\s*\n(?:(?!^## ).*\n?)*/gm, '');
  result = result.replace(/^## WAR Cover Letter\s*\n(?:Not applicable|N\/A|None)\s*$/gim, '');
  result = result.replace(/^```(?:markdown|md)?\s*$/gim, '').replace(/^```\s*$/gim, '').trim();

  // If the agent wrote duplicate WAR Cover Letter sections, keep only the last one.
  // Split on resume sections vs cover letter sections.
  const warMatches = [...result.matchAll(/^## WAR Cover Letter\s*$/gm)];
  if (warMatches.length > 1) {
    // Keep everything before the first WAR section (resume bullets),
    // then replace with content from the LAST WAR section onward.
    const firstWarIndex = warMatches[0].index!;
    const lastWarIndex = warMatches[warMatches.length - 1].index!;
    const resumePart = result.slice(0, firstWarIndex).trimEnd();
    const coverPart = result.slice(lastWarIndex);
    // Strip any "needs analysis" junk between the resume and last cover letter
    result = resumePart + '\n\n' + coverPart;
  }

  return result.trim();
}

function summarizeRepairTargets(errors: Pick<LintError, 'fieldKeys'>[]): string {
  const unique = [...new Set(errors.flatMap((error) => error.fieldKeys || []))];
  if (unique.length === 0) return '- No field keys available; keep edits as narrow as possible.';
  return unique.map((fieldKey) => `- ${fieldKey}`).join('\n');
}

// Progress callback type for status updates during job execution
export type ProgressCallback = (detail: string) => void;

export interface RejectedCandidateDebug {
  phase: 'generation' | 'repair';
  attempt: number;
  reason: string;
  rawText: string;
  extractedMarkdown: string;
}

// Repair iteration callback — called after each lint cycle with current draft.
// Return 'continue' to keep repairing, 'accept' to stop and use current draft as-is.
export type RepairIterationCallback = (draft: {
  currentDraftMarkdown: string;
  markdown: string;
  errors: LintError[];
  fields?: string[];
  attempt: number;
  maxAttempts: number;
  phase: 'pre-repair' | 'post-repair';
  rejectedCandidate?: RejectedCandidateDebug | null;
  totalCost?: number | null;
}) => Promise<'continue' | 'accept'>;

// Simple single-job run - returns markdown directly
// NOTE: This function is safe for concurrent calls (no global lock)
// Pass an AbortSignal to support external cancellation.
// Pass onProgress to receive status detail strings during execution.
// Pass onRepairIteration to inspect/pause between repair cycles.
export async function runSingleJob(
  input: JobInput,
  externalSignal?: AbortSignal,
  onProgress?: ProgressCallback,
  onRepairIteration?: RepairIterationCallback,
): Promise<{
  markdown: string;
  status: JobStatus;
  error?: string;
  lintErrors?: LintError[];
  totalCost?: number | null;
}> {
  const abortController = new AbortController();
  const signal = abortController.signal;
  const jobId = Math.random() * 1000 | 0;
  const report = onProgress || (() => {});
  const backend = appStore.selectedBackend;
  let totalCost = 0;
  let hasCost = false;

  const recordInvocationCost = (cost: number | undefined) => {
    if (typeof cost !== 'number' || !Number.isFinite(cost)) return;
    totalCost += cost;
    hasCost = true;
  };

  // If caller provided a signal, forward its abort
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortController.abort();
    } else {
      externalSignal.addEventListener('abort', () => abortController.abort(), { once: true });
    }
  }

  try {
    let markdown: string;
    let lastRejectedCandidate: RejectedCandidateDebug | null = null;

    if (appStore.pipelineMode) {
      // --- Multi-agent pipeline ---
      const bulletModel = appStore.bulletModel;
      const critiqueModel = appStore.critiqueModel;

      // Step 1: Generate bullets (cheaper model)
      report(`Bullets (${bulletModel})...`);
      const bulletPrompt = buildBulletPrompt(input);
      const { text: rawBullets } = await invokeLlm(bulletPrompt, jobId, signal, bulletModel, input);

      // Step 2: Critique and refine (stronger model)
      report(`Critique (${critiqueModel})...`);
      const critiquePrompt = buildCritiquePrompt(rawBullets, input);
      const { text: vettedBullets } = await invokeLlm(critiquePrompt, jobId, signal, critiqueModel, input);

      // Step 3: Write cover letter (stronger model)
      report(`Cover letter (${critiqueModel})...`);
      const clPrompt = buildCoverLetterPrompt(vettedBullets, input);
      const { text: coverLetter } = await invokeLlm(clPrompt, jobId, signal, critiqueModel, input);

      markdown = vettedBullets.trim() + '\n\n' + coverLetter.trim();
    } else {
      // --- Single-shot mode ---
      report(`Generating (${backend})...`);
      const prompt = buildPrompt(input);
      const result = await invokeLlm(prompt, jobId, signal, undefined, input);
      recordInvocationCost(result.cost);
      markdown = normalizeGeneratedPackage(result.text, input.resumeMode || appStore.resumeMode);
      if (result.backendUsed.includes('fallback')) {
        report(`Fallback: ${result.backendUsed}`);
      }
    }

    // Strip any reasoning preamble/postamble
    markdown = normalizeGeneratedPackage(markdown, input.resumeMode || appStore.resumeMode);
    const initialValidation = validateCandidatePackage(markdown);
    if (!initialValidation.valid) {
      throw new Error(`Generated package rejected before draft admission: ${initialValidation.reason}`);
    }

    // Lint and repair loop
    const mode = input.resumeMode || appStore.resumeMode;
    report('First lint pass...');
    let lintResult = await lintMarkdownWithTypst(markdown, mode);
    let repairAttempts = 0;

    while (!lintResult.valid && repairAttempts < MAX_REPAIR_ATTEMPTS) {
      const failedFieldKeys = Array.from(new Set(
        lintResult.errors
          .filter((error) => error.severity === 'error' && error.fieldKey)
          .map((error) => error.fieldKey as string),
      ));
      const hasUnscopedErrors = lintResult.errors.some((error) => error.severity === 'error' && !error.fieldKey);

      // Surface draft + errors to caller; let them pause or accept as-is
      if (onRepairIteration) {
        const decision = await onRepairIteration({
          currentDraftMarkdown: markdown,
          markdown,
          errors: lintResult.errors,
          fields: failedFieldKeys,
          attempt: repairAttempts,
          maxAttempts: MAX_REPAIR_ATTEMPTS,
          phase: 'pre-repair',
          rejectedCandidate: lastRejectedCandidate,
          totalCost: hasCost ? totalCost : null,
        });
        if (decision === 'accept') {
          report(`Accepted as-is after ${repairAttempts} iteration${repairAttempts !== 1 ? 's' : ''}`);
          break;
        }
      }

      repairAttempts++;
      const errorCount = lintResult.errors.length;
      report(`Repair ${repairAttempts}/${MAX_REPAIR_ATTEMPTS} — ${errorCount} error${errorCount !== 1 ? 's' : ''}`);
      const useScopedLineRepair = canUseScopedLineRepair(lintResult.errors);
      const repairPrompt = useScopedLineRepair
        ? buildScopedLineRepairPrompt(markdown, lintResult.errors)
        : buildRepairPrompt(markdown, lintResult.errors, mode);
      if (!repairPrompt) {
        throw new Error('Scoped line repair prompt could not be built from localized lint errors.');
      }
      const repairResponse = await invokeLlm(repairPrompt, jobId, signal, undefined, undefined);
      recordInvocationCost(repairResponse.cost);
      const rawRepairResponse = repairResponse.text;
      const rawRepairedCandidate = useScopedLineRepair
        ? applyScopedLineRepair(markdown, rawRepairResponse, failedFieldKeys)
        : normalizeGeneratedPackage(rawRepairResponse, mode);
      const repairedCandidate = rawRepairedCandidate
        ? preserveCoverLetterIfUnchanged(markdown, rawRepairedCandidate, lintResult.errors)
        : null;
      if (!repairedCandidate) {
        lastRejectedCandidate = {
          phase: 'repair',
          attempt: repairAttempts,
          reason: 'Scoped line repair response did not return the expected number of lines.',
          rawText: rawRepairResponse,
          extractedMarkdown: rawRepairResponse,
        };
        report('Repair candidate rejected — scoped line repair response was malformed');
        lintResult = {
          valid: false,
          errors: [
            ...lintResult.errors,
            {
              block: 'Package',
              message: 'Repair response rejected: scoped line repair response was malformed.',
              severity: 'error',
            },
          ],
          fields: lintResult.fields,
        };
        continue;
      }
      const candidateValidation = validateCandidatePackage(repairedCandidate);
      if (!candidateValidation.valid) {
        lastRejectedCandidate = {
          phase: 'repair',
          attempt: repairAttempts,
          reason: candidateValidation.reason || 'Unknown package validation failure',
          rawText: rawRepairResponse,
          extractedMarkdown: repairedCandidate,
        };
        report(`Repair candidate rejected — ${candidateValidation.reason}`);
        lintResult = {
          valid: false,
          errors: [
            ...lintResult.errors,
            {
              block: 'Package',
              message: `Repair response rejected: ${candidateValidation.reason}`,
              severity: 'error',
            },
          ],
          fields: lintResult.fields,
        };
        continue;
      }
      markdown = !hasUnscopedErrors && failedFieldKeys.length > 0
        ? (useScopedLineRepair ? repairedCandidate : replaceFailedFields(markdown, repairedCandidate, failedFieldKeys))
        : repairedCandidate;
      lastRejectedCandidate = null;
      lintResult = await lintMarkdownWithTypst(markdown, mode);

      if (!lintResult.valid && onRepairIteration) {
        const remainingFailedFieldKeys = Array.from(new Set(
          lintResult.errors
            .filter((error) => error.severity === 'error' && error.fieldKey)
            .map((error) => error.fieldKey as string),
        ));
        const decision = await onRepairIteration({
          currentDraftMarkdown: markdown,
          markdown,
          errors: lintResult.errors,
          fields: remainingFailedFieldKeys,
          attempt: repairAttempts,
          maxAttempts: MAX_REPAIR_ATTEMPTS,
          phase: 'post-repair',
          rejectedCandidate: lastRejectedCandidate,
          totalCost: hasCost ? totalCost : null,
        });
        if (decision === 'accept') {
          report(`Accepted draft after ${repairAttempts} repair${repairAttempts !== 1 ? 's' : ''}`);
          break;
        }
      }
    }

    if (repairAttempts > 0 && lintResult.valid) {
      report(`Lint passed after ${repairAttempts} repair${repairAttempts !== 1 ? 's' : ''}`);
    }

    return {
      markdown,
      status: 'done',
      lintErrors: lintResult.errors,
      totalCost: hasCost ? totalCost : null,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      markdown: '',
      status: 'error',
      error: errorMsg,
      totalCost: hasCost ? totalCost : null,
    };
  }
}

// Start a new run with 1-4 jobs
export async function startRun(inputs: JobInput[]): Promise<string> {
  if (state.isRunning) {
    throw new Error('A run is already in progress');
  }

  // Filter to only jobs with JD text (title/company optional)
  const validInputs = inputs.filter(input => input.jdText.trim());

  if (validInputs.length === 0) {
    throw new Error('At least one job with a job description is required');
  }

  if (validInputs.length > 4) {
    throw new Error('Maximum 4 jobs per run');
  }

  // Use filtered inputs
  const jobInputs = validInputs;

  state.isRunning = true;
  state.abortController = new AbortController();
  state.activeProcesses.clear();
  appStore.setRunning(true);

  const runId = generateRunId();
  const now = new Date().toISOString();

  // Create run with initial jobs
  const run: Run = {
    metadata: {
      id: runId,
      createdAt: now,
    },
    jobs: jobInputs.map((input, index) => ({
      id: index + 1,
      input,
      status: 'queued' as JobStatus,
    })),
  };

  // Save initial run state
  await storage.saveRun(run);

  // Update index
  const indexEntry = createRunIndexEntry(run);
  const currentIndex = await storage.loadRunIndex();
  await storage.saveRunIndex([indexEntry, ...currentIndex]);
  appStore.setRuns([indexEntry, ...appStore.runs]);

  // Select the new run
  appStore.selectRun(runId);
  appStore.setCurrentRun(run);

  // Execute all jobs concurrently (max 4)
  try {
    await runJobsWithConcurrency(run, run.jobs, state.abortController!.signal);
  } finally {
    state.isRunning = false;
    state.abortController = null;
    state.activeProcesses.clear();
    appStore.setRunning(false);
  }

  return runId;
}

// Cancel the current run
export function cancelRun(): void {
  if (state.abortController) {
    state.abortController.abort();
  }

  getTauriInvoke()
    .then((invoke) => invoke<number>('kill_all_processes'))
    .catch(console.error);

  // Kill all active processes
  for (const [jobId, pid] of state.activeProcesses) {
    killProcess(pid).catch(console.error);
  }
}

// Re-run specific jobs with optional custom instructions
export async function rerunJobs(run: Run, jobIds: number[], customInstructions?: string): Promise<void> {
  if (state.isRunning) {
    throw new Error('A run is already in progress');
  }

  state.isRunning = true;
  state.abortController = new AbortController();
  state.activeProcesses.clear();
  appStore.setRunning(true);

  // Reset selected jobs to queued state
  for (const jobId of jobIds) {
    const job = run.jobs.find(j => j.id === jobId);
    if (job) {
      job.status = 'queued';
      job.markdown = undefined;
      job.html = undefined;
      job.lintErrors = undefined;
      job.error = undefined;
      job.repairAttempts = undefined;
      job.badFitWarning = undefined;
      // Store custom instructions for this re-run
      if (customInstructions?.trim()) {
        job.input.customInstructions = customInstructions.trim();
      }
    }
  }

  // Update store
  appStore.setCurrentRun({ ...run });

  // Execute selected jobs concurrently
  try {
    const jobsToRerun = run.jobs.filter(j => jobIds.includes(j.id));
    await runJobsWithConcurrency(run, jobsToRerun, state.abortController!.signal);

    // Save updated run
    await storage.saveRun(run);
  } finally {
    state.isRunning = false;
    state.abortController = null;
    state.activeProcesses.clear();
    appStore.setRunning(false);
  }
}

// Kill a process by PID (Tauri command)
async function killProcess(pid: number): Promise<void> {
  try {
    const invoke = await getTauriInvoke();
    await invoke('kill_process', { pid });
  } catch (e) {
    console.error('Failed to kill process:', e);
  }
}

// Update pipeline step and sync with store
function updatePipelineStep(run: Run, jobId: number, step: PipelineStep): void {
  const job = run.jobs.find(j => j.id === jobId);
  if (job) {
    job.pipelineStep = step;
  }
  if (appStore.currentRun?.metadata.id === run.metadata.id) {
    appStore.setCurrentRun({ ...run });
  }
}

// Update status detail text and sync with store
function updateStatusDetail(run: Run, jobId: number, detail: string): void {
  const job = run.jobs.find(j => j.id === jobId);
  if (job) {
    job.statusDetail = detail;
  }
  if (appStore.currentRun?.metadata.id === run.metadata.id) {
    appStore.setCurrentRun({ ...run });
  }
}

// Execute a single job using Claude Code CLI
async function executeJob(run: Run, job: Job, signal: AbortSignal): Promise<void> {
  try {
    // Classify JD for role fit before starting
    const classification = classifyJD(job.input.jdText);
    job.roleFitTier = classification.tier;
    job.roleFitWarnings = classification.warnings;

    // Update status to running
    updateJobStatus(run, job.id, 'running');
    const backend = appStore.selectedBackend;

    // Show classification in status
    const tierLabel = classification.tier === 'tier1' ? '✓ Tier 1' :
                      classification.tier === 'tier2' ? '○ Tier 2' : '⚠ Tier 3';
    updateStatusDetail(run, job.id, `${tierLabel} · Starting (${backend})...`);

    if (signal.aborted) {
      updateJobStatus(run, job.id, 'cancelled');
      return;
    }

    let markdown: string;

    if (appStore.pipelineMode) {
      // --- Multi-agent pipeline ---
      const bulletModel = appStore.bulletModel;
      const critiqueModel = appStore.critiqueModel;

      // Step 1: Generate bullets (cheaper model)
      updatePipelineStep(run, job.id, 'bullets');
      updateStatusDetail(run, job.id, `Bullets (${bulletModel})...`);
      const bulletPrompt = buildBulletPrompt(job.input);
      const { text: rawBullets } = await invokeLlm(bulletPrompt, job.id, signal, bulletModel, job.input);

      if (signal.aborted) { updateJobStatus(run, job.id, 'cancelled'); return; }

      // Step 2: Critique and refine (stronger model)
      updatePipelineStep(run, job.id, 'critique');
      updateStatusDetail(run, job.id, `Critique (${critiqueModel})...`);
      const critiquePrompt = buildCritiquePrompt(rawBullets, job.input);
      const { text: vettedBullets } = await invokeLlm(critiquePrompt, job.id, signal, critiqueModel, job.input);

      if (signal.aborted) { updateJobStatus(run, job.id, 'cancelled'); return; }

      // Step 3: Write cover letter (stronger model)
      updatePipelineStep(run, job.id, 'cover-letter');
      updateStatusDetail(run, job.id, `Cover letter (${critiqueModel})...`);
      const clPrompt = buildCoverLetterPrompt(vettedBullets, job.input);
      const { text: coverLetter } = await invokeLlm(clPrompt, job.id, signal, critiqueModel, job.input);

      if (signal.aborted) { updateJobStatus(run, job.id, 'cancelled'); return; }

      // Combine vetted bullets + cover letter
      markdown = extractMarkdown(vettedBullets.trim()) + '\n\n' + extractMarkdown(coverLetter.trim());
    } else {
      // --- Single-shot mode ---
      updateStatusDetail(run, job.id, `Generating (${backend} / ${appStore.selectedModel})...`);
      const prompt = buildPrompt(job.input);
      const result = await invokeLlm(prompt, job.id, signal, undefined, job.input);
      markdown = normalizeGeneratedPackage(result.text, job.input.resumeMode || appStore.resumeMode);
      const generatedValidation = validateCandidatePackage(markdown);
      if (!generatedValidation.valid) {
        throw new Error(`Generated package rejected before draft admission: ${generatedValidation.reason}`);
      }
      if (result.backendUsed.includes('fallback')) {
        updateStatusDetail(run, job.id, `Fallback: ${result.backendUsed}`);
      }
    }

    if (signal.aborted) {
      updateJobStatus(run, job.id, 'cancelled');
      return;
    }

    // Save markdown
    await storage.saveJobMarkdown(run.metadata.id, job.id, markdown);
    job.markdown = markdown;

    // Update status to linting
    updateJobStatus(run, job.id, 'linting');
    updateStatusDetail(run, job.id, 'First lint pass...');
    if (appStore.pipelineMode) updatePipelineStep(run, job.id, 'lint');

    // Lint the output
    const jobMode = job.input.resumeMode || appStore.resumeMode;
    let lintResult = await lintMarkdownWithTypst(markdown, jobMode);
    let currentMarkdown = markdown;
    let repairAttempts = 0;

    while (!lintResult.valid && repairAttempts < MAX_REPAIR_ATTEMPTS) {
      if (signal.aborted) {
        updateJobStatus(run, job.id, 'cancelled');
        return;
      }

      const failedFieldKeys = Array.from(new Set(
        lintResult.errors
          .filter((error) => error.severity === 'error' && error.fieldKey)
          .map((error) => error.fieldKey as string),
      ));
      const hasUnscopedErrors = lintResult.errors.some((error) => error.severity === 'error' && !error.fieldKey);

      updateJobStatus(run, job.id, 'fixing');
      if (appStore.pipelineMode) updatePipelineStep(run, job.id, 'repair');
      repairAttempts++;
      const errorCount = lintResult.errors.length;
      updateStatusDetail(run, job.id, `Repair ${repairAttempts}/${MAX_REPAIR_ATTEMPTS} — ${errorCount} error${errorCount !== 1 ? 's' : ''}`);

      // Attempt repair via LLM
      const useScopedLineRepair = canUseScopedLineRepair(lintResult.errors);
      const repairPrompt = useScopedLineRepair
        ? buildScopedLineRepairPrompt(currentMarkdown, lintResult.errors)
        : buildRepairPrompt(currentMarkdown, lintResult.errors, jobMode);
      if (!repairPrompt) {
        throw new Error('Scoped line repair prompt could not be built from localized lint errors.');
      }
      const rawRepairResponse = (await invokeLlm(repairPrompt, job.id, signal, undefined, undefined)).text;
      const rawRepairedCandidate = useScopedLineRepair
        ? applyScopedLineRepair(currentMarkdown, rawRepairResponse, failedFieldKeys)
        : normalizeGeneratedPackage(rawRepairResponse, jobMode);
      const repairedCandidate = rawRepairedCandidate
        ? preserveCoverLetterIfUnchanged(currentMarkdown, rawRepairedCandidate, lintResult.errors)
        : null;
      if (!repairedCandidate) {
        updateStatusDetail(run, job.id, 'Repair candidate rejected — scoped line repair response was malformed');
        lintResult = {
          valid: false,
          errors: [
            ...lintResult.errors,
            {
              block: 'Package',
              message: 'Repair response rejected: scoped line repair response was malformed.',
              severity: 'error',
            },
          ],
          fields: lintResult.fields,
        };
        continue;
      }
      const candidateValidation = validateCandidatePackage(repairedCandidate);
      if (!candidateValidation.valid) {
        updateStatusDetail(run, job.id, `Repair candidate rejected — ${candidateValidation.reason}`);
        lintResult = {
          valid: false,
          errors: [
            ...lintResult.errors,
            {
              block: 'Package',
              message: `Repair response rejected: ${candidateValidation.reason}`,
              severity: 'error',
            },
          ],
          fields: lintResult.fields,
        };
        continue;
      }
      currentMarkdown = !hasUnscopedErrors && failedFieldKeys.length > 0
        ? (useScopedLineRepair ? repairedCandidate : replaceFailedFields(currentMarkdown, repairedCandidate, failedFieldKeys))
        : repairedCandidate;
      lintResult = await lintMarkdownWithTypst(currentMarkdown, jobMode);

      // Save repaired markdown
      if (lintResult.valid) {
        await storage.saveJobMarkdown(run.metadata.id, job.id, currentMarkdown);
        job.markdown = currentMarkdown;
        updateStatusDetail(run, job.id, `Lint passed after ${repairAttempts} repair${repairAttempts !== 1 ? 's' : ''}`);
      }
    }

    // Track repair attempts and flag bad fits
    job.repairAttempts = repairAttempts;
    if (repairAttempts >= BAD_FIT_THRESHOLD) {
      job.badFitWarning = true;
      console.warn(`Job ${job.id}: Bad fit warning - ${repairAttempts} repair attempts needed`);
    }

    // Convert to HTML
    const html = markdownToHtml(currentMarkdown);
    await storage.saveJobHtml(run.metadata.id, job.id, html);
    job.html = html;
    job.lintErrors = lintResult.errors;

    // Final status
    updateJobStatus(run, job.id, 'done');

  } catch (error) {
    // Capture detailed error info
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
    }
    console.error(`Job ${job.id} failed:`, error);
    job.error = errorMessage;
    updateJobStatus(run, job.id, 'error');
  }
}

// Update job status and sync with store
function updateJobStatus(run: Run, jobId: number, status: JobStatus): void {
  const job = run.jobs.find(j => j.id === jobId);
  if (job) {
    job.status = status;
  }

  // Update store
  if (appStore.currentRun?.metadata.id === run.metadata.id) {
    appStore.setCurrentRun({ ...run });
  }

  // Update sidebar
  const runIndex = appStore.runs.find(r => r.id === run.metadata.id);
  if (runIndex) {
    const jobSummary = runIndex.jobSummaries.find(j => j.id === jobId);
    if (jobSummary) {
      jobSummary.status = status;
      appStore.setRuns([...appStore.runs]);
    }
  }
}

// Helper: format all bullet variants for an employer into a prompt section
function formatBulletVariants(variants: { default: string[]; graphite?: string[]; dbeaver?: string[]; productLens?: string[] }): string {
  const sections: string[] = [];
  sections.push('Source bullets (reference material — reframe, do not copy verbatim):');
  sections.push(variants.default.map(b => `- ${b}`).join('\n'));

  if (variants.graphite) {
    sections.push('Alternative framings (lifecycle/SEO angle):');
    sections.push(variants.graphite.map(b => `- ${b}`).join('\n'));
  }
  if (variants.dbeaver) {
    sections.push('Alternative framings (technical/product angle):');
    sections.push(variants.dbeaver.map(b => `- ${b}`).join('\n'));
  }
  if (variants.productLens) {
    sections.push('Product-operator framings (for GTM/product roles):');
    sections.push(variants.productLens.map(b => `- ${b}`).join('\n'));
  }

  return sections.join('\n');
}

// Helper: format all bullets from a cover-letter-only employer
function formatCoverLetterBullets(variants: { default: string[]; dbeaver?: string[] }): string {
  const all = [...variants.default, ...(variants.dbeaver || [])];
  return all.join(' ');
}

// --- Shared prompt building helpers ---

// Build a single employer's fact bank section for the system prompt
function buildFactBankSection(
  employer: { company: string; role: string; bulletVariants: any; sectionScopes?: { allowed: string[]; disallowed: string[] } },
  header: string,
  annotation: string,
  options?: { liveAt?: string; hardBan?: boolean; skipScopes?: boolean }
): string {
  const lines = [
    `### FACT BANK: ${header}`,
    `Company: ${employer.company}`,
    `Role: ${employer.role}`,
  ];
  if (options?.liveAt) lines.push(`Live at: ${options.liveAt}`);
  lines.push(annotation);
  if (!options?.skipScopes && employer.sectionScopes) {
    lines.push(`Allowed topics: ${employer.sectionScopes.allowed.join(', ')}`);
    const banLabel = options?.hardBan ? 'HARD BAN — automatic failure' : 'BANNED topics (will cause lint failure)';
    lines.push(`${banLabel}: ${employer.sectionScopes.disallowed.join(', ')}`);
  }
  lines.push(formatBulletVariants(employer.bulletVariants));
  return lines.join('\n');
}

// Build the cover-letter-only section shared by all modes
function buildCoverLetterOnlySection(options?: {
  includeOpenSwarm?: boolean;
  includeDaylightPMM?: boolean;
}): string {
  const { toyota, ebay, brafton, reporter, gestallt, openswarm } = EXPERIENCE_DATA;
  const lines = [
    `### COVER LETTER ONLY (not for resume sections — available for cover letter plays)`,
    `Toyota (${toyota.role}): ${formatCoverLetterBullets(toyota.bulletVariants)}`,
    `eBay (${ebay.role}): ${formatCoverLetterBullets(ebay.bulletVariants)}`,
    `Brafton (${brafton.role}): ${formatCoverLetterBullets(brafton.bulletVariants)}`,
    `Reporter (${reporter.role}): ${formatCoverLetterBullets(reporter.bulletVariants)}`,
    `Gestallt (expanded, live at gestallt.com): ${formatCoverLetterBullets(gestallt.bulletVariants)}`,
  ];
  if (options?.includeOpenSwarm) {
    lines.push(`OpenSwarm (expanded): ${formatCoverLetterBullets(openswarm.bulletVariants)}`);
  }
  if (options?.includeDaylightPMM) {
    lines.push(`Daylight (product marketing microsite, live at daylightapps.com): Complete messaging house with 4 buyer personas, competitive matrix, email/social sequences, and 6 homepage design variations. Demonstrates full PMM execution from positioning through launch assets.`);
  }
  return lines.join('\n');
}

// Assemble the final PromptParts from system content + user intro
// Universal length rule applied to every mode. Lines under 80 chars hard-fail
// the linter; lines over 110 trigger a warning but Typst preflight is the
// authoritative check on actual page-fit.
const UNIVERSAL_LENGTH_RULE = `
## Universal Length Rule (applies to every resume line)
- The Summary line and EVERY section bullet must be 80–110 characters.
- Lines under 80 characters HARD FAIL the linter — they lack the specificity
  expected of resume copy. Pad short lines with concrete outcomes, metrics,
  scope, or technical detail before submitting.
- Lines over 110 characters get a warning; Typst preflight will measure actual
  page width and tell you whether to trim.
- Every line ends with a period.`.trim();

function assembleModePromptParts(
  input: JobInput,
  system: string,
  userIntro: string,
  extraUserContent?: string,
): PromptParts {
  const hasTitle = input.jobTitle.trim();
  const hasCompany = input.company.trim();

  let jobHeader = '';
  if (hasTitle || hasCompany) {
    jobHeader = `**Target**: ${hasTitle || '[parse from JD]'} at ${hasCompany || '[parse from JD]'}\n\n`;
  }

  const user = `${userIntro}
${extraUserContent ? `\n${extraUserContent}\n` : ''}
${jobHeader}## Job Description
${input.jdText}${input.customInstructions ? `\n\n## ADDITIONAL INSTRUCTIONS\n${input.customInstructions}` : ''}`.trim();

  return {
    system: `${system.trim()}\n\n${UNIVERSAL_LENGTH_RULE}`,
    user,
  };
}

// Prompt parts for API caching (system = stable, user = varies per job)
interface PromptParts {
  system: string; // Stable instructions + fact banks + rules
  user: string;   // JD + custom instructions
}

// Build prompt split into system/user parts for API caching
function buildPromptParts(input: JobInput): PromptParts {
  const mode = input.resumeMode || appStore.resumeMode;
  if (mode === 'content') {
    return buildContentPromptParts(input);
  }
  if (mode === 'fme') {
    return buildFmePromptParts(input);
  }
  if (mode === 'pmm') {
    return buildPmmPromptParts(input);
  }
  if (mode === 'devrel') {
    return buildDevrelPromptParts(input);
  }
  if (mode === 'dxe') {
    return buildDxePromptParts(input);
  }
  if (mode === 'isd') {
    return buildIsdPromptParts(input);
  }
  if (mode === 'fe') {
    return buildFePromptParts(input);
  }

  // --- PM MODE (default) ---
  const { labDemand, focusDigital, learMarketing, gestallt, coverpro, daylight } = EXPERIENCE_DATA;

  const factBanks = `## SOURCE MATERIAL (reframe for this JD, don't copy verbatim)

You have MULTIPLE framings of each employer's experience below. Use them as raw material to REFRAME for the target JD — do not copy any bullet verbatim. Mix, adapt, and rewrite using the JD's vocabulary.

${buildFactBankSection(labDemand,
    'Independent Consulting (formerly labDemand)',
    'NOTE: This is a ONE-LINER section. Only 1 bullet. Shows activity post-Focus Digital.')}

${buildFactBankSection(focusDigital,
    'Focus Digital (PM ROLE — stakeholder communication angle)',
    `FOR PM ROLES: EXACTLY 2 bullets. Reframe for stakeholder communication and requirements gathering.
CRITICAL FOR PM ROLES: Do NOT include SEO performance metrics (631%, 366%, 241%, 14 leads, $25K). Those metrics are for content strategist roles ONLY.
Allowed angles for PM roles:
- Presenting strategy to non-marketing stakeholders
- Requirements gathering from B2B clients (RF testing labs, industrial manufacturers)
- Translating technical needs into deliverable outcomes
- Managing roadmap across multiple client verticals`)}

${buildFactBankSection(learMarketing,
    'Lear Marketing (PM ROLE — GTM and stakeholder presentations)',
    `FOR PM ROLES: EXACTLY 1 bullet. Reframe for stakeholder presentations and GTM strategy for technical products.
Allowed angles for PM roles:
- Presenting Ahrefs/SEMRush strategy to founders with no marketing background
- Building modular systems for early-stage companies without marketing ops
- Translating technical product capabilities into market positioning`,
    { hardBan: true })}

${buildFactBankSection(gestallt,
    'Gestallt (Technical Project — REQUIRED FOR PM RESUMES)',
    'REQUIRED: EXACTLY 3 bullets for PM resumes. Emphasize user research, architecture decisions, HIPAA compliance, shipping.',
    { liveAt: 'gestallt.com' })}

${buildFactBankSection(coverpro,
    'CoverPro (Technical Project — REQUIRED FOR PM RESUMES)',
    'REQUIRED: EXACTLY 2 bullets for PM resumes. Emphasize problem identification, quality gates, automated systems.')}

${buildFactBankSection(daylight,
    'Daylight (Technical Project — REQUIRED FOR PM RESUMES)',
    'REQUIRED: EXACTLY 2 bullets for PM resumes. Emphasize context recovery, multi-project management, automation.')}

### EARLIER EXPERIENCE (consolidated one-liner, no bullets)
${EXPERIENCE_DATA.earlierExperience.displayLine}

${buildCoverLetterOnlySection({ includeDaylightPMM: true })}`;

  const systemRules = `## BULLET WRITING RULES

- All bullets: 80-110 characters, end with period
- Use strong verbs: "shipped", "built", "drove", "architected"
- Reframe source bullets for this JD (adapt verbs/nouns to match their language)
- Keep each employer's bullets in their own section (Gestallt bullets only in Gestallt section, etc.)
## COVER LETTER

3 short paragraphs, ~150 words total.
- Para 1: Name the company. Address their biggest need with proof.
- Para 2: Surface a depth signal (built HIPAA platform, ships Rust apps, etc.)
- Para 3: End with "Review my portfolio at www.blankpagesyndrome.com, then set up a time for us to discuss [Company]'s [their core need]."
Voice: Short sentences. Concrete proof. No AI slop ("excited to", "passionate about", etc.)


## JD QUESTION OVERRIDE (SUPERSEDES WAR STRUCTURE)

If the JD/application explicitly asks specific questions:
- REPLACE the "## WAR Cover Letter" section content with those answers
- Do NOT add a separate section — keep the same "## WAR Cover Letter" heading
- Follow their sentence/length limits exactly
- Label answers clearly (e.g., "Q1:" / "A1:" or "Question 1:" / "Answer 1:")
- If the JD does NOT ask specific questions, just write the normal WAR cover letter`;

  const outputFormat = `## OUTPUT STRUCTURE

# [Job Title] - [Company]

## Summary
- Write one bullet (80-110 characters) emphasizing product execution and technical delivery.

## For All Bullets: 80-110 characters or you'll fail lint.

## Technical Projects

### Gestallt
- Pick and re-write three Gestallt bullets from below that have search similarity to job description.

### CoverPro
- Pick and re-write two CoverPro bullets from below that have search similarity to job description.

### Daylight
- Pick and re-write two Daylight bullets from below that have search similarity to job description.

## Independent Consulting Experience
- Pick and re-write one labDemand bullet from below that has search similarity to job description.

## Focus Digital Experience
- Pick and re-write two Focus Digital bullets from below. Reframe for stakeholder communication and requirements gathering. AVOID from JSON: [631%, 366%, 241%, 14 leads, $25K, SEO, organic traffic, impressions, qualified leads].

## Lear Marketing Experience
- Pick and re-write one Lear Marketing bullet from below. Reframe for stakeholder presentations and GTM strategy. AVOID from JSON: [Toyota, eBay].

## Earlier Experience
${EXPERIENCE_DATA.earlierExperience.displayLine}

## WAR Cover Letter
Write 3 short paragraphs (~150 words total). Name the company in paragraph 1. Surface a depth signal in paragraph 2. End paragraph 3 with "Review my portfolio at www.blankpagesyndrome.com, then set up a time for us to discuss [Company]'s [their core need]."`;

  const system = `${factBanks}\n\n${systemRules}\n\n${outputFormat}`.trim();

  return assembleModePromptParts(input, system,
    'Generate a tailored resume + WAR cover letter using ONLY the employer-specific fact banks provided. Follow the anti-drift algorithm and employer-lock rules exactly. Reframe bullets for THIS JD — do not paraphrase source material.');
}

// PMM-mode prompt parts (Product Marketing Manager — Developer Tools)
function buildPmmPromptParts(input: JobInput): PromptParts {
  const { labDemand, focusDigital, learMarketing, gestallt, coverpro, daylight } = EXPERIENCE_DATA;

  const factBanks = `## SOURCE MATERIAL (reframe for this JD, don't copy verbatim)

You have MULTIPLE framings of each employer's experience below. Use them as raw material to REFRAME for the target JD — do not copy any bullet verbatim. Mix, adapt, and rewrite using the JD's vocabulary.

${buildFactBankSection(gestallt,
    'Gestallt (Technical Project — product depth proof)',
    'FOR PMM ROLES: EXACTLY 2 bullets. Show you understand products at architecture level, not feature level. Trade-off thinking is key — "We chose X over Y because Z" is core PMM positioning.',
    { liveAt: 'gestallt.com' })}

${buildFactBankSection(coverpro,
    'CoverPro (Technical Project — AI/developer tools domain knowledge)',
    'FOR PMM ROLES: EXACTLY 1 bullet. Show AI/LLM domain knowledge and cost optimization thinking.')}

${buildFactBankSection(daylight,
    'Traverse (Technical Project — developer onboarding as product marketing)',
    'FOR PMM ROLES: EXACTLY 1 bullet. Developer onboarding IS product marketing for devtools. Getting developers from "never heard of you" to "productive with your product."')}

${buildFactBankSection(labDemand,
    'Independent Consulting (formerly labDemand) — pipeline proof',
    'FOR PMM ROLES: EXACTLY 2 bullets. Show 0→1 GTM ownership and revenue attribution.')}

${buildFactBankSection(focusDigital,
    'Focus Digital (PMM ROLE — pipeline metrics + competitive positioning)',
    `FOR PMM ROLES: EXACTLY 3 bullets. Hybrid framing: pipeline metrics AND positioning thinking.
ALLOWED metrics: 14 qualified leads/month, $25K-$75K contracts, 2.4x engagement.
One bullet should mention competitive positioning across verticals.
FORBIDDEN: Do NOT use "+631% impressions" or "+366% traffic" as lead metrics (SEO framing).`)}

${buildFactBankSection(learMarketing,
    'Lear Marketing (PMM ROLE — positioning for technical founders)',
    'FOR PMM ROLES: EXACTLY 1 bullet. Reframe for translating product capabilities into buyer-facing messaging.',
    { hardBan: true })}

### EARLIER EXPERIENCE (consolidated one-liner, no bullets)
${EXPERIENCE_DATA.earlierExperience.displayLine}

${buildCoverLetterOnlySection()}`;

  const systemRules = `## BULLET WRITING RULES

- All bullets: 80-110 characters, end with period
- Use strong verbs: "architected", "drove", "positioned", "launched", "built"
- Reframe source bullets for this JD (adapt verbs/nouns to match their language)
- Keep each employer's bullets in their own section
- PMM resumes need product depth AND pipeline proof — prove you understand the product AND can drive revenue
- NEVER use "revolutionary", "cutting-edge", or developer-repelling marketing speak

## COVER LETTER (PMM WAR Format)

3 short paragraphs, ~150 words total.
- Para 1: Product depth. "Most PMMs learn your product from demos. I build products like yours." Name company and their developer product.
- Para 2: Pipeline proof with metrics. Reference specific results from Focus Digital and labDemand.
- Para 3: Developer-honest positioning philosophy. End with call-to-action.
Voice: Confident, specific, market-aware. Not "I'm passionate about developer marketing." Show you understand developers as buyers.

## JD QUESTION OVERRIDE (SUPERSEDES WAR STRUCTURE)

If the JD/application explicitly asks specific questions:
- REPLACE the "## WAR Cover Letter" section content with those answers
- Do NOT add a separate section — keep the same "## WAR Cover Letter" heading
- Follow their sentence/length limits exactly
- Label answers clearly (e.g., "Q1:" / "A1:")
- If the JD does NOT ask specific questions, just write the normal WAR cover letter`;

  const outputFormat = `## OUTPUT FORMAT (STRICT JSON FIRST)

Return ONE JSON object only. No markdown. No code fences. No commentary.

Schema:
{
  "mode": "pmm",
  "title": "[Job Title] - [Company]",
  "summary": "single bullet text, 80-110 chars, trailing period",
  "technicalProjects": {
    "gestallt": ["2 bullets"],
    "coverpro": ["1 bullet"],
    "traverse": ["1 bullet"]
  },
  "independentConsultingExperience": ["2 bullets"],
  "focusDigitalExperience": ["3 bullets"],
  "learMarketingExperience": ["1 bullet"],
  "warCoverLetter": {
    "kind": "paragraphs" | "answers",
    "paragraphs": ["3 short paragraphs"] OR
    "answers": [{ "label": "Q1", "text": "..." }]
  }
}

Rules:
- Every bullet string must be 80-110 characters and end with a period.
- 'focusDigitalExperience' must include at least 2 of: 14 qualified leads, $25K, 2.4x, competitive positioning.
- Do NOT use +631% or +366% in 'focusDigitalExperience'.
- 'learMarketingExperience' must avoid Toyota/eBay references.
- If the JD asks explicit questions, set 'warCoverLetter.kind' to "answers" and return labeled answers.
- Otherwise set 'warCoverLetter.kind' to "paragraphs" and return 3 short paragraphs.

Fallback only if JSON completely fails: output the legacy markdown package format exactly.`;

  const system = `${factBanks}\n\n${systemRules}\n\n${outputFormat}`.trim();

  return assembleModePromptParts(input, system,
    'Generate a tailored resume + WAR cover letter for a PRODUCT MARKETING MANAGER (Developer Tools) role. Use ONLY the employer-specific fact banks provided. This role demands proof of: product architecture understanding, measurable pipeline, and developer-honest positioning. Reframe bullets for THIS JD.');
}

// FME-mode prompt parts (Founding Marketing Engineer)
function buildFmePromptParts(input: JobInput): PromptParts {
  const { labDemand, focusDigital, learMarketing, gestallt, coverpro } = EXPERIENCE_DATA;

  const factBanks = `## SOURCE MATERIAL (reframe for this JD, don't copy verbatim)

You have MULTIPLE framings of each employer's experience below. Use them as raw material to REFRAME for the target JD — do not copy any bullet verbatim. Mix, adapt, and rewrite using the JD's vocabulary.

${buildFactBankSection(labDemand,
    'Independent Consulting (formerly labDemand) — CENTERPIECE',
    `FOR FME ROLES: EXACTLY 2 bullets. This IS the founding marketing story — 0→1 demand gen for a regulated vertical.
Framing: Show you can build demand gen from zero, map test methods to buyer intent, source revenue from organic.`)}

${buildFactBankSection(focusDigital,
    'Focus Digital (FME ROLE — pipeline and funnel angle)',
    `FOR FME ROLES: EXACTLY 3 bullets. Reframe for pipeline thinking, not SEO execution.
ALLOWED pipeline metrics: 14 qualified leads/month, $25K-$75K contracts, 3.5x YoY sessions, 2.4x engagement.
FORBIDDEN SEO framing: Do NOT use "+631% impressions" or "+366% traffic" as lead metrics. A founding marketing engineer thinks in CAC and qualified leads, not impressions.
Framing angles:
- Pipeline outcomes: qualified leads, contract values, zero paid spend
- Content-as-funnel: proof blocks, TL;DR blocks, AEO FAQs lifting engagement
- Operating alone at scale: six verticals, no dedicated team`)}

${buildFactBankSection(gestallt,
    'Gestallt (Technical Project — shows you build products, not just market them)',
    'FOR FME ROLES: EXACTLY 2 bullets. Show product building capability — RBAC architecture, HIPAA compliance.',
    { liveAt: 'gestallt.com' })}

${buildFactBankSection(coverpro,
    'CoverPro (Technical Project — automation and cost efficiency)',
    'FOR FME ROLES: EXACTLY 1 bullet. Show automation thinking and cost awareness.')}

${buildFactBankSection(learMarketing,
    'Lear Marketing (FME ROLE — GTM for technical products at early-stage companies)',
    'FOR FME ROLES: EXACTLY 1 bullet. Reframe for founding marketing work: founders with no ICP, no GTM, no marketing ops.',
    { hardBan: true })}

### EARLIER EXPERIENCE (consolidated one-liner, no bullets)
${EXPERIENCE_DATA.earlierExperience.displayLine}

${buildCoverLetterOnlySection()}`;

  const systemRules = `## BULLET WRITING RULES

- All bullets: 80-110 characters, end with period
- Use strong verbs: "shipped", "built", "drove", "architected", "lifted", "sourced"
- Reframe source bullets for this JD (adapt verbs/nouns to match their language)
- Keep each employer's bullets in their own section
- FME resumes need BOTH projects AND metrics — prove you do the full loop

## COVER LETTER (FME WAR Format)

3 short paragraphs, ~150 words total.
- Para 1: Name the company. Lead with labDemand as founding marketing proof + Focus Digital metrics as scale proof.
- Para 2: Projects as product capability. "I don't just market products — I build them."
- Para 3: Measurement rigor and call-to-action. End with "I'd like to show you how I'd approach [specific challenge from JD]."
Voice: Confident, pragmatic, zero fluff. "I've done this" not "I'm passionate about this."

## JD QUESTION OVERRIDE (SUPERSEDES WAR STRUCTURE)

If the JD/application explicitly asks specific questions:
- REPLACE the "## WAR Cover Letter" section content with those answers
- Do NOT add a separate section — keep the same "## WAR Cover Letter" heading
- Follow their sentence/length limits exactly
- Label answers clearly (e.g., "Q1:" / "A1:")
- If the JD does NOT ask specific questions, just write the normal WAR cover letter`;

  const outputFormat = `## OUTPUT STRUCTURE

# [Job Title] - [Company]

## Summary
- Write one bullet (80-110 characters) emphasizing full-stack marketing execution: builds product, writes content, measures pipeline. 0→1 comfort.

## For All Bullets: 80-110 characters or you'll fail lint.

## Technical Projects

### Gestallt
- Pick and re-write two Gestallt bullets from below that match the JD.

### CoverPro
- Pick and re-write one CoverPro bullet from below that matches the JD.

## Independent Consulting Experience
- Pick and re-write two labDemand bullets from below. Emphasize 0→1 founding marketing work.

## Focus Digital Experience
- Pick and re-write three Focus Digital bullets from below. Reframe for pipeline/funnel thinking. MUST include 2+ of: 14 qualified leads, $25K, 3.5x, 2.4x. Do NOT use +631% or +366% as lead metrics.

## Lear Marketing Experience
- Pick and re-write one Lear Marketing bullet from below. Reframe for GTM at early-stage companies. AVOID: [Toyota, eBay].

## Earlier Experience
${EXPERIENCE_DATA.earlierExperience.displayLine}

## WAR Cover Letter
Write 3 short paragraphs (~150 words total). Name the company. Include at least one project AND one metric. End with call-to-action.`;

  const system = `${factBanks}\n\n${systemRules}\n\n${outputFormat}`.trim();

  return assembleModePromptParts(input, system,
    'Generate a tailored resume + WAR cover letter for a FOUNDING MARKETING ENGINEER role. Use ONLY the employer-specific fact banks provided. This role demands proof of: building products, measuring pipelines, and executing alone. Reframe bullets for THIS JD.');
}

// DevRel-mode prompt parts (Developer Advocate)
function buildDevrelPromptParts(input: JobInput): PromptParts {
  const { focusDigital, learMarketing, gestallt, coverpro, openswarm, daylight } = EXPERIENCE_DATA;

  const factBanks = `## SOURCE MATERIAL (reframe for this JD, don't copy verbatim)

You have MULTIPLE framings of each employer's experience below. Use them as raw material to REFRAME for the target JD — do not copy any bullet verbatim. Mix, adapt, and rewrite using the JD's vocabulary.

${buildFactBankSection(openswarm,
    'OpenSwarm (Technical Project — CENTERPIECE)',
    'FOR DEVREL ROLES: EXACTLY 2 bullets. This is the "I actually build" proof. Multi-agent orchestration, mobile remote control, distributed systems.')}

${buildFactBankSection(gestallt,
    'Gestallt (Technical Project — depth proof)',
    'FOR DEVREL ROLES: EXACTLY 2 bullets. Multi-tenant RBAC, Cloud Functions, HIPAA. DevRel audiences value honest trade-offs — the search key trade-off bullet is more shareable than compliance checkboxes.',
    { liveAt: 'gestallt.com' })}

${buildFactBankSection(coverpro,
    'CoverPro (Technical Project — API integration and automation)',
    'FOR DEVREL ROLES: EXACTLY 2 bullets. Multi-backend API integration and quality systems thinking. Both are relevant to developer tools companies.')}

${buildFactBankSection(daylight,
    'Traverse (Technical Project — knowledge transfer IS DevRel)',
    'FOR DEVREL ROLES: EXACTLY 1 bullet. DevRel IS knowledge transfer. Getting new contributors to 95% understanding from a single document.')}

${buildFactBankSection(focusDigital,
    'Focus Digital (DEVREL ROLE — content credibility signal only)',
    'FOR DEVREL ROLES: EXACTLY 1 bullet. Content architecture credibility, not marketing execution. Show you understand content structure, not that you drove traffic.')}

${buildFactBankSection(learMarketing,
    'Lear Marketing (DEVREL ROLE — technical translation)',
    'FOR DEVREL ROLES: EXACTLY 1 bullet. Reframe for translating complex technical domains to non-technical audiences. DevRel is translation work.',
    { hardBan: true })}

### EARLIER EXPERIENCE (consolidated one-liner, no bullets)
${EXPERIENCE_DATA.earlierExperience.displayLine}

${buildCoverLetterOnlySection({ includeOpenSwarm: true })}`;

  const systemRules = `## BULLET WRITING RULES

- All bullets: 80-110 characters, end with period
- Use strong verbs: "architected", "built", "designed", "shipped", "documented"
- Reframe source bullets for this JD (adapt verbs/nouns to match their language)
- Keep each employer's bullets in their own section
- DevRel resumes are project-heavy. Marketing is credibility signal, not the main event.
- NEVER use "passionate about" anything. NEVER use marketing speak.

## COVER LETTER (DevRel WAR Format)

3 short paragraphs, ~150 words total.
- Para 1: Lead with OpenSwarm or another shipped project with technical specificity. "I built X, here's what broke, here's what I learned."
- Para 2: Honest trade-offs as content philosophy. Reference a specific technical decision and its costs.
- Para 3: Knowledge transfer as system design. End with "I'd rather show you code than a slide deck."
Voice: Direct, technical, zero marketing speak. "Here's what I built" not "I'm passionate about developer communities."

## JD QUESTION OVERRIDE (SUPERSEDES WAR STRUCTURE)

If the JD/application explicitly asks specific questions:
- REPLACE the "## WAR Cover Letter" section content with those answers
- Do NOT add a separate section — keep the same "## WAR Cover Letter" heading
- Follow their sentence/length limits exactly
- Label answers clearly (e.g., "Q1:" / "A1:")
- If the JD does NOT ask specific questions, just write the normal WAR cover letter`;

  const outputFormat = `## OUTPUT STRUCTURE

# [Job Title] - [Company]

## Summary
- Write one bullet (80-110 characters) emphasizing developer advocate who builds and documents. Code over slides.

## For All Bullets: 80-110 characters or you'll fail lint.

## Technical Projects

### OpenSwarm
- Pick and re-write two OpenSwarm bullets from below. Show distributed systems, agent orchestration, mobile remote control.

### Gestallt
- Pick and re-write two Gestallt bullets from below. Emphasize honest trade-offs over compliance checkboxes.

### CoverPro
- Pick and re-write two CoverPro bullets from below. Show API integration depth and quality systems.

### Traverse
- Pick and re-write one Traverse/Daylight bullet from below. Frame as knowledge transfer expertise.

## Focus Digital Experience
- Pick and re-write one Focus Digital bullet from below. Content architecture credibility signal only. No SEO metrics.

## Lear Marketing Experience
- Pick and re-write one Lear Marketing bullet from below. Frame as technical translation. AVOID: [Toyota, eBay].

## Earlier Experience
${EXPERIENCE_DATA.earlierExperience.displayLine}

## WAR Cover Letter
Write 3 short paragraphs (~150 words total). Name the company and their developer product. Lead with code you've built. Include one honest trade-off. End with "I'd rather show you code than a slide deck."`;

  const system = `${factBanks}\n\n${systemRules}\n\n${outputFormat}`.trim();

  return assembleModePromptParts(input, system,
    'Generate a tailored resume + WAR cover letter for a DEVELOPER ADVOCATE role. Use ONLY the employer-specific fact banks provided. This role demands proof of: building real production systems, honest documentation, and developer empathy through actual development experience. Reframe bullets for THIS JD.');
}

// DXE-mode prompt parts (Developer Experience Engineer)
function buildDxePromptParts(input: JobInput): PromptParts {
  const { focusDigital, learMarketing, gestallt, coverpro, daylight } = EXPERIENCE_DATA;

  const factBanks = `## SOURCE MATERIAL (reframe for this JD, don't copy verbatim)

${buildFactBankSection(daylight,
    'Traverse (Technical Project — CENTERPIECE)',
    'FOR DX ROLES: EXACTLY 2 bullets. 80% onboarding reduction IS developer experience. The Kickstart system designs "the first 10 minutes for a new contributor."')}

${buildFactBankSection(gestallt,
    'Gestallt (Technical Project — developer-facing API design)',
    'FOR DX ROLES: EXACTLY 2 bullets. Cloud Functions as gatekeepers = APIs other developers consume. Trade-off thinking = DX pragmatism.',
    { liveAt: 'gestallt.com' })}

${buildFactBankSection(coverpro,
    'CoverPro (Technical Project — developer-facing abstractions)',
    'FOR DX ROLES: EXACTLY 2 bullets. Multi-backend abstraction (switch providers without changing workflows) and fact-locking linter (clear error messages, actionable feedback).')}

${buildFactBankSection(daylight,
    'DayLight (Technical Project — API design taste)',
    'FOR DX ROLES: EXACTLY 1 bullet. Pure-function recurrence engine = clean domain model, testable, zero side effects. Shows API design taste.',
    { skipScopes: true })}

${buildFactBankSection(focusDigital,
    'Focus Digital (DX ROLE — information design signal)',
    'FOR DX ROLES: EXACTLY 1 bullet. Content structures as information architecture. Not marketing execution.')}

${buildFactBankSection(learMarketing,
    'Lear Marketing (DX ROLE — making complexity accessible)',
    'FOR DX ROLES: EXACTLY 1 bullet. Translating technical complexity into accessible documentation.',
    { hardBan: true })}

### EARLIER EXPERIENCE (consolidated one-liner, no bullets)
${EXPERIENCE_DATA.earlierExperience.displayLine}

${buildCoverLetterOnlySection()}`;

  const systemRules = `## BULLET WRITING RULES

- All bullets: 80-110 characters, end with period
- Use strong verbs: "designed", "built", "shipped", "documented", "implemented"
- Reframe for this JD — DX is about making the product easier to use
- NEVER use "passionate about" or marketing speak

## COVER LETTER (DX WAR Format)

3 short paragraphs, ~150 words total.
- Para 1: Lead with Traverse — 80% onboarding reduction. "The first 10 minutes" philosophy.
- Para 2: Preemptive debugging philosophy — find the friction, document the fix, make it findable.
- Para 3: Builder + documenter hybrid. End with call-to-action referencing specific DX challenge from JD.
Voice: Direct, empathetic toward developers. "Developers' time is expensive" as implicit throughline.

## JD QUESTION OVERRIDE (SUPERSEDES WAR STRUCTURE)

If the JD explicitly asks specific questions:
- REPLACE the "## WAR Cover Letter" content with those answers
- Keep the same "## WAR Cover Letter" heading
- Follow their limits exactly, label answers clearly`;

  const outputFormat = `## OUTPUT STRUCTURE

# [Job Title] - [Company]

## Summary
- Write one bullet (80-110 characters) emphasizing builder who designs the experience around the code.

## For All Bullets: 80-110 characters or you'll fail lint.

## Technical Projects

### Traverse
- Pick and re-write two Traverse bullets. Emphasize onboarding reduction and knowledge transfer design.

### Gestallt
- Pick and re-write two Gestallt bullets. Emphasize developer-facing API design and pragmatic trade-offs.

### CoverPro
- Pick and re-write two CoverPro bullets. Emphasize developer-facing abstractions and validation.

### DayLight
- Pick and re-write one DayLight bullet. Emphasize clean API design (pure functions, testable).

## Focus Digital Experience
- Pick and re-write one Focus Digital bullet. Frame as information architecture, not marketing. No SEO metrics.

## Lear Marketing Experience
- Pick and re-write one Lear Marketing bullet. Frame as making technical complexity accessible. AVOID: [Toyota, eBay].

## Earlier Experience
${EXPERIENCE_DATA.earlierExperience.displayLine}

## WAR Cover Letter
Write 3 short paragraphs (~150 words total). Name the company. Lead with Traverse onboarding story.`;

  const system = `${factBanks}\n\n${systemRules}\n\n${outputFormat}`.trim();

  return assembleModePromptParts(input, system,
    'Generate a tailored resume + WAR cover letter for a DEVELOPER EXPERIENCE ENGINEER role. Use ONLY the fact banks provided. This role demands proof of: building AND documenting, onboarding flow thinking, and preemptive debugging. Reframe bullets for THIS JD.');
}

// ISD-mode prompt parts (Internal Systems Developer)
function buildIsdPromptParts(input: JobInput): PromptParts {
  const { focusDigital, learMarketing, gestallt, coverpro, daylight } = EXPERIENCE_DATA;

  const factBanks = `## SOURCE MATERIAL (reframe for this JD, don't copy verbatim)

${buildFactBankSection(daylight,
    'Traverse (Technical Project — CENTERPIECE, FULL TREATMENT)',
    `FOR ISD ROLES: EXACTLY 3 bullets (unique — most of any mode). This project IS the job: context recovery, multi-project management, automated workflows. Three-layer architecture, 80% onboarding reduction, audit automation.
Ordering: Architecture bullet first, then outcome, then execution.`)}

${buildFactBankSection(gestallt,
    'Gestallt (Technical Project — real access control systems)',
    'FOR ISD ROLES: EXACTLY 2 bullets. Multi-tenant RBAC = the kind of access control internal tools need. Dynamic team switching = real internal systems problem.',
    { liveAt: 'gestallt.com' })}

${buildFactBankSection(coverpro,
    'CoverPro (Technical Project — automation and validation)',
    'FOR ISD ROLES: EXACTLY 2 bullets. Repair system (efficient pipelines) and validation linter (catch errors before propagation). Internal tools ARE automation.')}

${buildFactBankSection(daylight,
    'DayLight (Technical Project — maintainable code)',
    'FOR ISD ROLES: EXACTLY 1 bullet. Pure-function domain model = code that works after the builder leaves. Internal tools outlive their creators.',
    { skipScopes: true })}

${buildFactBankSection(focusDigital,
    'Focus Digital (ISD ROLE — scaling across teams)',
    'FOR ISD ROLES: EXACTLY 1 bullet. Managing six verticals concurrently = building systems that scale across teams without dedicated staff.')}

${buildFactBankSection(learMarketing,
    'Lear Marketing (ISD ROLE — building from zero)',
    'FOR ISD ROLES: EXACTLY 1 bullet. Built modular systems for orgs with no existing infrastructure. That\'s internal tools.',
    { hardBan: true })}

### EARLIER EXPERIENCE (consolidated one-liner, no bullets)
${EXPERIENCE_DATA.earlierExperience.displayLine}

${buildCoverLetterOnlySection()}`;

  const systemRules = `## BULLET WRITING RULES

- All bullets: 80-110 characters, end with period
- Use strong verbs: "architected", "built", "automated", "designed", "shipped"
- Reframe for this JD — ISD builds infrastructure that makes internal teams effective
- "Tools that work after the builder leaves" is the throughline
- NEVER use marketing language as lead framing

## COVER LETTER (ISD WAR Format)

3 short paragraphs, ~150 words total.
- Para 1: Lead with Traverse — three-layer architecture, 80% onboarding reduction. "I've already built the solution your team needs."
- Para 2: Tools that outlive their builder. Reference DayLight's pure-function model and Gestallt's server-verified auth.
- Para 3: Knowledge as product. End with "I'd like to walk through how Traverse works and discuss [company]'s internal tooling challenges."
Voice: Pragmatic, outcome-focused, anti-over-engineering.

## JD QUESTION OVERRIDE (SUPERSEDES WAR STRUCTURE)

If the JD explicitly asks specific questions:
- REPLACE the "## WAR Cover Letter" content with those answers
- Keep the same "## WAR Cover Letter" heading
- Follow their limits exactly, label answers clearly`;

  const outputFormat = `## OUTPUT STRUCTURE

# [Job Title] - [Company]

## Summary
- Write one bullet (80-110 characters) emphasizing internal systems architecture, context recovery, automated workflows.

## For All Bullets: 80-110 characters or you'll fail lint.

## Technical Projects

### Traverse
- Pick and re-write three Traverse bullets. Lead with architecture, then outcome, then execution. Full treatment.

### Gestallt
- Pick and re-write two Gestallt bullets. Emphasize access control systems for internal teams.

### CoverPro
- Pick and re-write two CoverPro bullets. Emphasize automation and validation pipelines.

### DayLight
- Pick and re-write one DayLight bullet. Emphasize maintainable code (pure functions, testable).

## Focus Digital Experience
- Pick and re-write one Focus Digital bullet. Frame as scaling systems across teams/verticals. No SEO metrics.

## Lear Marketing Experience
- Pick and re-write one Lear Marketing bullet. Frame as building infrastructure from zero. AVOID: [Toyota, eBay].

## Earlier Experience
${EXPERIENCE_DATA.earlierExperience.displayLine}

## WAR Cover Letter
Write 3 short paragraphs (~150 words total). Name the company. Traverse MUST appear. Include one other project for code quality.`;

  const system = `${factBanks}\n\n${systemRules}\n\n${outputFormat}`.trim();

  return assembleModePromptParts(input, system,
    'Generate a tailored resume + WAR cover letter for an INTERNAL SYSTEMS DEVELOPER role. Use ONLY the fact banks provided. This role demands proof of: systems people actually use, source-of-truth thinking, and solving context-switching at scale. Reframe bullets for THIS JD.');
}

// FE-mode prompt parts (Founding Engineer)
function buildFePromptParts(input: JobInput): PromptParts {
  const { labDemand, gestallt, coverpro, openswarm, daylight } = EXPERIENCE_DATA;

  const factBanks = `## SOURCE MATERIAL (reframe for this JD, don't copy verbatim)

${buildFactBankSection(daylight,
    'DayLight (Technical Project — CENTERPIECE)',
    'FOR FE ROLES: EXACTLY 3 bullets. Most impressive engineering: recurrence logic, timezone handling, cross-platform. Shows depth that separates "I build React apps" from "I build whatever the startup needs."',
    { skipScopes: true })}

${buildFactBankSection(gestallt,
    'Gestallt (Technical Project — security architecture)',
    'FOR FE ROLES: EXACTLY 2 bullets. Multi-tenant RBAC, HIPAA, defense-in-depth. Shows you handle security architecture, not just features.',
    { liveAt: 'gestallt.com' })}

${buildFactBankSection(openswarm,
    'OpenSwarm (Technical Project — distributed systems)',
    'FOR FE ROLES: EXACTLY 2 bullets. PTY management, signal handling, WebSocket protocols. "I\'m not just a web developer" signal.')}

${buildFactBankSection(coverpro,
    'CoverPro (Technical Project — AI integration and cost optimization)',
    'FOR FE ROLES: EXACTLY 2 bullets. Multi-backend flexibility (startups pivot) and cost optimization (startups have runway).')}

${buildFactBankSection(labDemand,
    'Independent Consulting (formerly labDemand) — 0→1 execution',
    'FOR FE ROLES: EXACTLY 1 bullet. Built the product AND the go-to-market from nothing. "I don\'t need a marketing team."')}

### EARLIER EXPERIENCE (consolidated one-liner, no bullets)
${EXPERIENCE_DATA.earlierExperience.displayLine}

${buildCoverLetterOnlySection({ includeOpenSwarm: true })}`;

  const systemRules = `## BULLET WRITING RULES

- All bullets: 80-110 characters, end with period
- Use strong verbs: "shipped", "built", "architected", "designed", "implemented"
- This is 100% projects. No marketing roles. Projects are the resume.
- Reframe for this JD — founding engineers DO, they don't manage
- The vibe-code acknowledgment is a STRENGTH: "I architect systems using AI to implement"
- NEVER use "managed" or "led" — use "built", "shipped", "architected"

## COVER LETTER (FE WAR Format)

3 short paragraphs, ~150 words total.
- Para 1: Shipping velocity and range. 22 active projects. Multiple stacks. Real complexity.
- Para 2: Pragmatic trade-offs. Every decision optimizes for shipping, not architecture astronautics.
- Para 3: Full-stack execution including go-to-market. "I don't need a team to be productive on day one." End with "I'd rather show you code than talk about process."
Voice: Confident, pragmatic, zero ceremony. Include vibe-code acknowledgment naturally.

## JD QUESTION OVERRIDE (SUPERSEDES WAR STRUCTURE)

If the JD explicitly asks specific questions:
- REPLACE the "## WAR Cover Letter" content with those answers
- Keep the same "## WAR Cover Letter" heading
- Follow their limits exactly, label answers clearly`;

  const outputFormat = `## OUTPUT STRUCTURE

# [Job Title] - [Company]

## Summary
- Write one bullet (80-110 characters) emphasizing solo builder, 22 projects, architect + implement + measure.

## For All Bullets: 80-110 characters or you'll fail lint.

## Technical Projects

### DayLight
- Pick and re-write three DayLight bullets. Show engineering depth: recurrence logic, timezone handling, cross-platform.

### Gestallt
- Pick and re-write two Gestallt bullets. Show security architecture (RBAC, defense-in-depth).

### OpenSwarm
- Pick and re-write two OpenSwarm bullets. Show distributed systems beyond web apps.

### CoverPro
- Pick and re-write two CoverPro bullets. Show multi-backend flexibility and cost optimization.

## Independent Consulting Experience
- Pick and re-write one labDemand bullet. Emphasize 0→1 founding work — product AND go-to-market.

## Earlier Experience
${EXPERIENCE_DATA.earlierExperience.displayLine}

## WAR Cover Letter
Write 3 short paragraphs (~150 words total). Name the company. Lead with shipping velocity. Include pragmatic trade-off. End with code-over-process.`;

  const system = `${factBanks}\n\n${systemRules}\n\n${outputFormat}`.trim();

  return assembleModePromptParts(input, system,
    'Generate a tailored resume + WAR cover letter for a FOUNDING ENGINEER role. Use ONLY the fact banks provided. This is a 100% projects resume — zero marketing roles. This role demands proof of: end-to-end solo shipping, pragmatic architecture decisions, and handling real complexity. Reframe bullets for THIS JD.');
}

// Content-mode prompt parts (adapted from buildPromptOLD)
function buildContentPromptParts(input: JobInput): PromptParts {
  const { labDemand, focusDigital, firstPageSage, learMarketing, gestallt, ebay } = EXPERIENCE_DATA;

  // Content-mode fact banks with content-appropriate annotations
  const factBanks = `## EMPLOYER FACT BANKS (use ONLY these as source material)

You have MULTIPLE framings of each employer's experience below. Use them as raw material to REFRAME for the target JD — do not copy any bullet verbatim. Mix, adapt, and rewrite using the JD's vocabulary.

${buildFactBankSection(labDemand,
    'Independent Consulting (formerly labDemand)',
    'NOTE: This is a ONE-LINER section. Only 1 bullet. Shows activity post-Focus Digital.')}

${buildFactBankSection(focusDigital,
    'Focus Digital (CONTENT ROLE — SEO and demand generation lead)',
    `EXACTLY 5 bullets. MUST include at least 3 of these client-pinned metrics: 631%, 366%, 241%, 14 leads, $25K.
These metrics are real and verified — use them confidently.`)}

${buildFactBankSection(firstPageSage,
    'First Page Sage',
    'EXACTLY 3 bullets.')}

${buildFactBankSection(learMarketing,
    'Lear Marketing',
    'EXACTLY 3 bullets. NO Toyota/eBay references allowed.',
    { hardBan: true })}

${buildFactBankSection(gestallt,
    'Gestallt (Technical Project — credibility signal for technical JDs)',
    'EXACTLY 2 bullets. Include this section INSTEAD of eBay when JD mentions engineering, dev tools, platforms, APIs, or technical products.',
    { liveAt: 'gestallt.com' })}

${buildFactBankSection(ebay,
    'eBay (Lead Content Strategist — scale signal for content/marketing JDs)',
    'EXACTLY 3 bullets. Include this section INSTEAD of Gestallt when JD is content/marketing focused.')}

### MANDATORY SLOT: You MUST include EXACTLY ONE of these sections:
- **Technical Projects (Gestallt)** — if JD mentions engineering, dev tools, platforms, APIs, technical products
- **eBay Experience** — if JD is content, marketing, email, lifecycle, or operations focused
You cannot include both. You cannot include neither. Choose based on JD analysis.

### EARLIER EXPERIENCE (consolidated one-liner, no bullets)
Use this line if you chose Gestallt above: ${EXPERIENCE_DATA.earlierExperience.displayLineWithEbay}
Use this line if you chose eBay above: ${EXPERIENCE_DATA.earlierExperience.displayLine}

${buildCoverLetterOnlySection({ includeDaylightPMM: true })}`;

  // FD lens system (content mode uses this for vocabulary control)
  const fdLenses = focusDigital.lenses ? `
## FOCUS DIGITAL LENS SYSTEM (MANDATORY)

Before writing FD bullets, choose 1 primary lens based on JD analysis:

${Object.entries(focusDigital.lenses).map(([name, lens]) => {
  const guide = INSTRUCTIONS.fdLensSelection.lensGuide[name as keyof typeof INSTRUCTIONS.fdLensSelection.lensGuide] || '';
  return `**${name.toUpperCase()} lens**: ${guide}
Example bullets at this lens:
${(lens as { bulletPalette: string[] }).bulletPalette.map((b: string) => `- ${b}`).join('\n')}`;
}).join('\n\n')}

Safe reframes (same facts, different vocabulary):
${INSTRUCTIONS.fdLensSelection.safeReframes.map((r: string) => `- ${r}`).join('\n')}
` : '';

  // Positioning angle selection (frames entire resume voice)
  const positioningSection = `
## POSITIONING ANGLE (SELECT ONE BEFORE GENERATING)

Analyze the JD and select the positioning angle that best frames the candidate:

${Object.entries(POSITIONING_ANGLES).map(([key, angle]) => `**${key}**
- Trigger: ${angle.trigger}
- Frame: "${angle.frame}"
- Emphasize: ${angle.emphasize.join(', ')}`).join('\n\n')}

Silently choose one positioning angle before writing. Use it to frame the resume voice, but do NOT include the selected angle, analysis, or any "Selected angle" text in the JSON output. The FD lens (above) then controls bullet-level vocabulary within this framing.
`;

  // Skill-based employer emphasis (JD-dependent, goes in user message)
  const emphasizedEmployers = getEmphasizedEmployers(input.jdText);
  const skillEmphasisSection = emphasizedEmployers.length > 0 ? `
## SKILL-MATCHED EMPLOYERS (Prioritize these)

Based on JD skill keywords, emphasize bullets from: **${emphasizedEmployers.slice(0, 3).join(', ')}**

${emphasizedEmployers.includes('gestallt') ? '**Note**: Gestallt matches skill keywords in this JD. Use the Technical Projects (Gestallt) section for the mandatory slot.' : ''}
${emphasizedEmployers.includes('ebay') ? '**Note**: eBay matches skill keywords in this JD. Use the eBay Experience section for the mandatory slot.' : ''}
` : '';

  const systemRules = `## ANTI-DRIFT GENERATION ALGORITHM (FOLLOW EXACTLY)

${INSTRUCTIONS.antiDriftAlgorithm.join('\n')}

## EMPLOYER LOCK (NON-NEGOTIABLE)

Your #1 job is preventing "experience bleed." Each resume section may ONLY use facts from that employer's fact bank.

Hard fail triggers:
- A fact from one employer appears in another employer's section
- A metric belonging to Focus Digital (631%, 366%, 241%, 14 leads, $25K) appears in any other section
- Toyota/eBay appears in Lear Marketing section
- Any cross-employer token in the wrong section (checked against allowed/banned topic lists above)

Repair behavior: If bleed is detected, REPLACE the entire bullet. Do not edit around it.

## BULLET FORMAT RULES

- Aim for roughly 80-110 characters, but Typst width is authoritative.
- If Typst says a bullet wraps, tighten the wording even if the character count looks acceptable.
- AP-style numbers (51%, 90 days, 2.4x). Never spell out numbers.
- Operator voice: strong verbs ("shipped", "built", "drove"), not filler ("responsible for", "worked on", "helped with")
- Specificity without trivia: outcomes, constraints, artifacts. Not tool soup.

## TAILORING MANDATE

Do NOT paraphrase source bullets. REFRAME them for this specific JD:
- Swap verbs and nouns to match the JD's language and priorities
- Keep underlying facts and metrics unchanged
- A bullet that's >80% similar to any source bullet = lint failure

${fdLenses}
## COVER LETTER

3 short paragraphs, ~150 words total.
- Para 1: Name the company. Address their biggest need with proof.
- Para 2: Surface a depth signal (built HIPAA platform, ships Rust apps, etc.)
- Para 3: End with "Review my portfolio at www.blankpagesyndrome.com, then set up a time for us to discuss [Company]'s [their core need]."
Voice: Short sentences. Concrete proof. No AI slop ("excited to", "passionate about", etc.)


## JD QUESTION OVERRIDE (SUPERSEDES WAR STRUCTURE)

If the JD/application explicitly asks specific questions:
- REPLACE the "## WAR Cover Letter" section content with those answers
- Do NOT add a separate section — keep the same "## WAR Cover Letter" heading
- Follow their sentence/length limits exactly
- Label answers clearly (e.g., "Q1:" / "A1:" or "Question 1:" / "Answer 1:")
- If the JD does NOT ask specific questions, just write the normal WAR cover letter`;

  const outputFormat = `## OUTPUT FORMAT (STRICT JSON FIRST)

Return ONE JSON object only. No markdown. No code fences. No commentary.

Schema:
{
  "mode": "content",
  "title": "[Job Title] - [Company]",
  "summary": "single bullet text, 80-110 chars, trailing period",
  "independentConsultingExperience": ["1 bullet"],
  "focusDigitalExperience": ["5 bullets"],
  "firstPageSageExperience": ["3 bullets"],
  "learMarketingExperience": ["3 bullets"],
  "optionalSection":
    { "kind": "technical-projects", "gestallt": ["2 bullets"] }
    OR
    { "kind": "ebay-experience", "ebayExperience": ["3 bullets"] },
  "warCoverLetter": {
    "kind": "paragraphs" | "answers",
    "paragraphs": ["3 short paragraphs"] OR
    "answers": [{ "label": "Q1", "text": "..." }]
  }
}

Rules:
- Every bullet string must end with a period. Aim for roughly 80-110 characters, but Typst width is authoritative.
- 'focusDigitalExperience' must include at least 3 of these metrics: 631%, 366%, 241%, 14 leads, $25K.
- Include exactly ONE optional section: Gestallt for technical/devtools/product JDs, or eBay for content/marketing JDs.
- 'learMarketingExperience' must avoid Toyota/eBay references.
- If the JD asks explicit questions, set 'warCoverLetter.kind' to "answers" and return labeled answers.
- Otherwise set 'warCoverLetter.kind' to "paragraphs" and return 3 short paragraphs.

Fallback only if JSON completely fails: output the legacy markdown package format exactly.`;

  const system = `${factBanks}\n${positioningSection}\n\n${systemRules}\n\n${outputFormat}`.trim();

  return assembleModePromptParts(input, system,
    'Generate a tailored resume + WAR cover letter using ONLY the employer-specific fact banks provided. Follow the anti-drift algorithm and employer-lock rules exactly. Reframe bullets for THIS JD — do not paraphrase source material.',
    skillEmphasisSection);
}

// Build prompt for generating a package (legacy for CLI backends - concatenates system + user)
function buildPrompt(input: JobInput): string {
  const parts = buildPromptParts(input);
  return `${parts.system}\n\n${parts.user}`;
}

// Build repair prompt for fixing lint errors
function buildRepairPrompt(markdown: string, errors: { block: string; message: string; fieldLabel?: string; fieldKey?: string; code?: string }[], mode: ResumeMode = DEFAULT_RESUME_MODE): string {
  const modeConfig = RESUME_MODE_MAP[mode];
  const errorList = errors.map(e => `- ${e.fieldLabel || e.block}: ${e.message}`).join('\n');
  const targetedFields = Array.from(new Set(errors.filter((error) => error.fieldLabel).map((error) => error.fieldLabel as string)));

  // Categorize errors to give targeted repair guidance
  const hasSimilarity = errors.some(e => e.message.includes('similar to source'));
  const hasBleed = errors.some(e => e.message.includes('Forbidden') || e.message.includes('bleed') || e.message.includes('cross-employer'));
  const hasMetrics = errors.some(e => e.message.includes('metric'));
  const hasHeaderMismatch = errors.some(e => e.message.includes('Rename to match'));
  const missingCoverLetter = errors.some((error) => error.code === 'cover-letter-missing');
  const hasShortLines = errors.some((error) => error.code === 'bullet-too-short');
  const hasLongLines = errors.some((error) => error.code === 'bullet-too-long');

  let repairGuidance = `## Format Rules
- Summary line and every bullet: 80–110 characters, end with period.
- Lines under 80 chars HARD FAIL — pad with concrete outcome, metric, scope, or technical detail.
- Lines over 110 chars warn; Typst preflight is authoritative for actual page-fit.
- Cover letter: max 2 sentences per paragraph, no em-dashes (—), no AI slop phrases.
- Lear Marketing: no Toyota/eBay references.
- If the JD required specific questions, preserve that Q&A format under the WAR Cover Letter heading.
- Do NOT output sections with placeholder text like "Not applicable" — omit empty sections entirely.`;

  if (hasShortLines) {
    repairGuidance += `\n\n## Lines Too Short (HARD FAIL)
Some lines fall under the 80-character minimum. They lack the specificity expected of resume copy.
For each flagged line, add concrete substance — outcome, metric, scope, technical detail, or named system —
until the line lands in the 80–110 character window. Do not pad with filler phrases ("worked on", "responsible for");
add real information.`;
  }

  if (hasLongLines) {
    repairGuidance += `\n\n## Lines Too Long
Some lines exceed the 110-character soft cap. Tighten wording where you can; if Typst preflight has not flagged
them as wrapping, the line is fine to leave. Trim only if both this rule and a Typst width error fire on the same line.`;
  }

  if (targetedFields.length > 0) {
    repairGuidance += `\n\n## Locked Field Policy
Only rewrite these failing fields:
${targetedFields.map((field) => `- ${field}`).join('\n')}

Treat every other field in the package as LOCKED. Keep locked fields semantically unchanged.`;
  }

  if (hasHeaderMismatch) {
    repairGuidance += `\n\n## Section Header Errors
A section header doesn't match the expected format. RENAME the header — do NOT remove the section or rewrite its content.
Keep all existing bullets intact. Only change the "## " header line to the name specified in the error.`;
  }

  if (hasSimilarity) {
    repairGuidance += `\n\n## Similarity Errors
Bullets flagged as too similar to source material must be REWRITTEN, not lightly edited.
Reframe the underlying fact for the target JD using different verbs and nouns.
The same outcome described through the JD's vocabulary will pass.`;
  }

  if (hasBleed) {
    repairGuidance += `\n\n## Experience Bleed Errors
Bullets containing tokens from the wrong employer must be REPLACED entirely.
Write a new bullet using ONLY facts from the correct employer's domain.
Do not edit around the problem — replace the whole bullet.`;
  }

  if (missingCoverLetter) {
    repairGuidance += `\n\n## Cover Letter Gate
The package is invalid until it contains a real "## WAR Cover Letter" section.
Write the cover letter if it is missing. Do not leave the section blank and do not use placeholders like "Not applicable".`;
  }

  if (hasMetrics && mode === 'content') {
    repairGuidance += `\n\n## Missing Metrics
Focus Digital section must include at least 3 of these client-pinned metrics: 631%, 366%, 241%, 14 leads/qualified, $25K.
Add the missing metric(s) to existing bullets or write new ones that include them.`;
  }

  repairGuidance += `\n\n## ${modeConfig.shortLabel} Mode Layout
${modeConfig.repairGuidance.map((line) => `- ${line}`).join('\n')}`;

  return `Fix these errors in the resume package.

## Current Content
${markdown}

## Errors to Fix
${errorList}

${repairGuidance}

CRITICAL: Your entire response must be ONLY the corrected markdown, starting with the "# " title line.
Do not include ANY text before the first "# " heading.
Do not include ANY text after the last bullet or paragraph.
No explanations, no reasoning, no "Changes made" notes, no "---" separators wrapping the content.
Just the raw corrected markdown document.`;
}

function canUseScopedLineRepair(errors: LintError[]): boolean {
  const hardErrors = errors.filter((error) => error.severity === 'error');
  if (hardErrors.length === 0) return false;
  return hardErrors.every((error) => error.fieldKey && isScopedLineRepairField(error.fieldKey));
}

// Invoke LLM CLI and return output
// Result from invokeLlm includes backend info for rate limit/fallback tracking
interface LlmInvokeResult {
  text: string;
  backendUsed: string; // e.g. "claude" or "codex(fallback from claude: Rate limited)"
  cost?: number;
}

async function invokeLlm(prompt: string, jobId: number, signal: AbortSignal, model?: string, input?: JobInput): Promise<LlmInvokeResult> {
  if (signal.aborted) {
    throw new Error('Aborted');
  }

  const backend = appStore.selectedBackend;
  const effectiveModel = model || appStore.selectedModel;

  // Branch: API vs CLI backends
  if (backend === 'anthropic-api' || backend === 'openai-api' || backend === 'openrouter-api') {
    // --- API PATH ---
    const { callLlmApi, shouldFallbackToApi } = await import('$lib/services/api-client');
    const { detectPlatform, isDesktop } = await import('$lib/utils/platform');

    const settings = await loadApiSettings();
    let provider: 'anthropic' | 'openai' | 'openrouter';
    if (backend === 'anthropic-api') {
      provider = 'anthropic';
    } else if (backend === 'openai-api') {
      provider = 'openai';
    } else {
      provider = 'openrouter';
    }

    // For API backends, split prompt into system/user for caching
    // Detect if this is a repair prompt (has "## Current Content" section)
    let systemMessage = '';
    let userMessage = prompt;

    if (!prompt.includes('## Current Content') && input) {
      // Normal generation - split into cached system + user
      const parts = buildPromptParts(input);
      systemMessage = parts.system;
      userMessage = parts.user;
    }

    try {
      console.log(`Job ${jobId} starting with ${backend} API, model: ${effectiveModel}`);

      const response = await callLlmApi(
        {
          provider,
          model: effectiveModel,
          prompt: userMessage,
          systemMessage,
          signal,
          temperature: appStore.temperature,
        },
        settings
      );

      // Log cache stats
      if (response.usage.cacheReadTokens) {
        console.log(`Job ${jobId}: Cache hit! Read ${response.usage.cacheReadTokens} cached tokens`);
      }

      console.log(`Job ${jobId}: ${provider} API completed. Tokens: ${response.usage.inputTokens}/${response.usage.outputTokens}`);

      return {
        text: response.text,
        backendUsed: backend,
        cost: response.usage.cost,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Job ${jobId}: ${backend} failed:`, errorMsg);

      // Check platform for fallback
      const platform = await detectPlatform();

      if (isDesktop(platform) && shouldFallbackToApi(errorMsg)) {
        // Desktop: fallback to CLI
        console.warn(`Job ${jobId}: Falling back to CLI backend (claude)`);
        try {
          const sourceBackend = backend as LlmBackend;
          const tier = getModelTier(sourceBackend, effectiveModel) ?? 'default';
          const fallbackCliModel = getModelForTier('claude', tier);
          const cliResult = await invokeCli(prompt, jobId, signal, 'claude', fallbackCliModel);
          return {
            text: cliResult.output,
            backendUsed: `claude(api-fallback: ${errorMsg.slice(0, 50)})`,
          };
        } catch (cliErr) {
          const cliMsg = cliErr instanceof Error ? cliErr.message : String(cliErr);
          throw new Error(`Both API and CLI failed. API: ${errorMsg}. CLI: ${cliMsg}`);
        }
      } else {
        // Mobile or non-rate-limit error: no fallback
        throw new Error(`${backend} failed: ${errorMsg}`);
      }
    }
  } else {
    // --- CLI PATH (existing code) ---
    const invoke = await getTauriInvoke();

    const abortPromise = new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });

    try {
      console.log(`Job ${jobId} starting with backend: ${backend}, model: ${effectiveModel}`);
      const result = await Promise.race([
        invoke<{ output: string; pid: number; backend: string }>('run_with_backend', {
          prompt,
          backend,
          model: effectiveModel,
        }),
        abortPromise,
      ]);
      state.activeProcesses.delete(jobId);
      if (result.backend.includes('fallback')) {
        console.warn(`Job ${jobId} used fallback: ${result.backend}`);
      }
      console.log(`Job ${jobId} completed using ${result.backend}`);

      // Check if Claude wrote to a file instead of stdout
      let text = result.output;
      const filePathMatch =
        text.match(/Output saved to [`']?([^`'\n]+\.md)[`']?/i) ||
        text.match(/saved to [`']?([^`'\n]+\.md)[`']?/i);

      if (filePathMatch) {
        const filePath = filePathMatch[1];
        console.log(`Job ${jobId}: Claude wrote to file, reading from ${filePath}`);
        text = await invoke<string>('read_file', { path: filePath });
      }

      return { text, backendUsed: result.backend };
    } catch (err) {
      state.activeProcesses.delete(jobId);
      console.error(`Job ${jobId} invoke error:`, err);
      if (typeof err === 'string') {
        throw new Error(err);
      }
      throw err;
    }
  }
}

// Helper to invoke CLI backend (extracted for fallback reuse)
async function invokeCli(
  prompt: string,
  jobId: number,
  signal: AbortSignal,
  backend: 'claude' | 'codex',
  model: string
): Promise<{ output: string; pid: number; backend: string }> {
  const invoke = await getTauriInvoke();

  const abortPromise = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  });

  const result = await Promise.race([
    invoke<{ output: string; pid: number; backend: string }>('run_with_backend', {
      prompt,
      backend,
      model,
    }),
    abortPromise,
  ]);

  state.activeProcesses.delete(jobId);

  // Check if Claude wrote to a file
  let text = result.output;
  const filePathMatch =
    text.match(/Output saved to [`']?([^`'\n]+\.md)[`']?/i) ||
    text.match(/saved to [`']?([^`'\n]+\.md)[`']?/i);

  if (filePathMatch) {
    const filePath = filePathMatch[1];
    text = await invoke<string>('read_file', { path: filePath });
  }

  return { ...result, output: text };
}

// --- Pipeline prompt builders (multi-agent mode) ---

// Step 1: Generate resume bullets only (cheaper model)
function buildBulletPrompt(input: JobInput): string {
  // Reuse the full prompt but strip cover letter instructions
  const fullPrompt = buildPrompt(input);
  // Replace output format to request bullets only
  return fullPrompt
    .replace(/## WAR Cover Letter[\s\S]*?(?=No meta-commentary)/, '')
    .replace(/## Cover Letter \(JD Questions Only\)[\s\S]*?(?=No meta-commentary)/, '')
    .replace(
      'Generate a tailored resume + WAR cover letter',
      'Generate ONLY the tailored resume bullets (no cover letter)'
    )
    .replace(
      '## WAR COVER LETTER RULES\n\nStructure:',
      '## SKIP COVER LETTER\nDo not generate a cover letter. Only output resume sections.\n\n## (Reference) WAR COVER LETTER RULES\nStructure:'
    );
}

// Step 2: Critique and refine bullets (stronger model)
function buildCritiquePrompt(rawBullets: string, input: JobInput): string {
  return `You are an editorial critic reviewing resume bullets for a job application. Your job is to improve quality, not just validate.

## Target Role
${input.jobTitle ? `**Title**: ${input.jobTitle}` : ''}${input.company ? ` at **${input.company}**` : ''}

## Job Description
${input.jdText}

## Current Resume Bullets (generated by another agent)
${rawBullets}

## Your Tasks

1. **Tailoring check**: Are these bullets genuinely reframed for this specific JD, or are they generic? If generic, rewrite them using the JD's vocabulary.

2. **Experience bleed check**: Does any bullet reference facts from the wrong employer? Cross-reference allowed topics:
   - Independent Consulting: consulting, B2B, regulated markets, content strategy (ONE BULLET ONLY)
   - Focus Digital: RF testing labs, die cutters, dealers, ISO 17025, EMC, landing pages, 631%/366%/241%/14 leads/$25K
   - First Page Sage: HVAC, solar, building materials, CEU, spec guides
   - Lear Marketing: electric aircraft, SAE, DOE, machine shop (NO Toyota/eBay)
   - Gestallt: RBAC, HIPAA, Firebase, JWT, Cloud Functions, multi-tenant (ALWAYS INCLUDED)

3. **Similarity check**: Are any bullets near-verbatim copies of source material? Rewrite them with different verbs and framing.

4. **FD metrics**: Does Focus Digital include at least 3 client-pinned metrics: 631%, 366%, 241%, 14 leads, $25K?

5. **Voice check**: Operator voice (shipped, built, drove) not marketer voice (responsible for, worked on).

6. **Format**: Every bullet 80-110 chars, ends with period, AP-style numbers.

## Output

Output ONLY the corrected resume markdown (all sections). No explanations, no commentary. Same format as input.`;
}

// Step 3: Write cover letter from vetted bullets (stronger model)
function buildCoverLetterPrompt(vettedBullets: string, input: JobInput): string {
  const { toyota, ebay, brafton, reporter, gestallt } = EXPERIENCE_DATA;

  return `Write a WAR cover letter for this job application. The resume bullets below have already been vetted and approved.

## Target Role
${input.jobTitle ? `**Title**: ${input.jobTitle}` : ''}${input.company ? ` at **${input.company}**` : ''}

## Job Description
${input.jdText}

## Approved Resume Bullets
${vettedBullets}

## Additional Experience (available for cover letter only)
Toyota (${toyota.role}): ${formatCoverLetterBullets(toyota.bulletVariants)}
eBay (${ebay.role}): ${formatCoverLetterBullets(ebay.bulletVariants)}
Brafton (${brafton.role}): ${formatCoverLetterBullets(brafton.bulletVariants)}
Reporter (${reporter.role}): ${formatCoverLetterBullets(reporter.bulletVariants)}
Gestallt (live at gestallt.com): ${formatCoverLetterBullets(gestallt.bulletVariants)}
Daylight (live at daylightapps.com): Complete product marketing microsite — messaging house, 4 buyer personas with JTBD, competitive matrix, email/social sequences, 6 homepage design variations. Demonstrates full PMM execution from positioning through launch assets.

## PROOF STORIES (Match to JD needs)

These are verified STAR examples. When a proof is needed, prefer pulling from these over inventing framings. Reference the RESULT, not the full story.

${STAR_BANK.map(star => `**${star.id}** [${star.tags.join(', ')}]
- Situation: ${star.situation}
- Task: ${star.task}
- Action: ${star.action.join('; ')}
- Result: ${star.result}`).join('\n\n')}

## WAR Cover Letter Rules

MAX 150 WORDS TOTAL. 3 paragraphs, roughly 50 words each. No separate close paragraph.

CHAMPION STRATEGY: This cover letter must make the reader think "I have to talk to this person." Surface ONE surprising depth signal that isn't obvious from the resume (e.g., built a HIPAA platform on Firebase, did automotive dealership SEO, ships desktop apps in Rust). Connect it to the JD's needs.

Before writing, identify from the JD:
- Need 1: the single biggest need
- Need 2: the second biggest need
- Need 3: a third need or capability

Paragraph 1 (~50 words): NAME THE COMPANY in sentence 1. Address Need 1 with strongest proof. Max one statistic. Proof embedded in the claim.

Paragraph 2 (~50 words): Need 2 and how I solve it. Surface the surprising depth signal here. Max one statistic. Different angle, different proof source.

Paragraph 3 (~50 words): Identity + CTA. Reframe Need 1's core action into a natural identity phrase. Don't mirror the JD adjective-for-adjective; just substitute the idea.
  Then weave in reframes of Need 2 and Need 3.
  End with a REAL call to action that includes the appropriate portfolio URL:
  - Technical/product/SaaS/platform JDs → "Review my portfolio at www.blankpagesyndrome.com"
  - Content strategy/PMM/GTM/messaging JDs → "See the messaging work at daylightapps.com"
  Pick ONE URL based on the JD's primary need. Never include both.

Voice:
- Flat, declarative, staccato. Short sentences. No escalation.
- Authority from specificity and understatement.
- Proof EMBEDDED in conversational claims, not appended.

Style bans:
- No em-dashes (—). Use periods or commas.
- Max ONE comma-separated triple total. Usually zero.
- No AI slop: "I'm excited to", "passionate about", "throughout my career", etc.
- Cover letter CAN reference any employer.

## JD Question Override
If the JD explicitly asks specific questions, answer ONLY those under the same "## WAR Cover Letter" heading.
Do NOT create a separate section. If no questions exist, write the normal WAR cover letter.

## Output
Output ONLY the cover letter section as markdown, starting with:
## WAR Cover Letter

No explanations. No commentary. No placeholder sections like "Not applicable".`;
}
