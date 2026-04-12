// Bridges parsed CoverPro output to the Typst PDF export Tauri command.

import { parsePackage } from './resume-parser';
import { getBulletFieldKey, getBulletFieldLabel } from './linter';

export interface ExportFields {
  jobTitle: string;
  summary: string;
  labDemand: string[];
  focusDigital: string[];
  firstPageSage: string[];
  learMarketing: string[];
  gestallt: string[];
  coverpro: string[];
  daylight: string[];
  contextmax: string[];
  ebay: string[];
  earlierExperience: string;
  coverLetter: string;
}

export interface ExportResult {
  success: boolean;
  resumePath: string | null;
  coverLetterPath: string | null;
  preflight: ResumePreflight;
}

export interface ResumePreflight {
  pageCount: number;
  targetPageCount: number;
  contentWidthPt: number | null;
  availableHeightPt: number | null;
  totalContentHeightPt: number | null;
  totalContentWidthPt: number | null;
  sections: PreflightSectionMetric[];
  failures: PreflightFailure[];
}

export interface PreflightSectionMetric {
  id: string;
  name: string;
  widthPt: number | null;
  heightPt: number | null;
}

export interface PreflightFailure {
  code: string;
  message: string;
  sectionId: string | null;
  details: Record<string, unknown> | null;
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

export interface ExportFitDiagnostics {
  preflight: ResumePreflight;
  bulletFailures: PreflightFailure[];
}

function extractFailureStderr(failure: PreflightFailure | undefined): string | null {
  const stderr = failure?.details?.stderr;
  if (typeof stderr !== 'string') {
    return null;
  }

  const trimmed = stderr.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function describeExportFailure(result: ExportResult): string {
  const [firstFailure] = result.preflight.failures;
  if (!firstFailure) {
    return 'PDF export failed for an unknown reason.';
  }

  if (firstFailure.code === 'resume_exceeds_page_budget') {
    return `Resume is ${result.preflight.pageCount} pages; target is ${result.preflight.targetPageCount}.`;
  }

  if (firstFailure.code === 'resume_content_exceeds_available_height') {
    const overflowPt = typeof firstFailure.details?.overflowPt === 'number' ? firstFailure.details.overflowPt : null;
    return overflowPt === null
      ? firstFailure.message
      : `${firstFailure.message} Overflow: ${overflowPt.toFixed(2)}pt.`;
  }

  if (firstFailure.code === 'resume_preflight_failed') {
    const stderr = extractFailureStderr(firstFailure);
    return stderr ? `${firstFailure.message} ${stderr}` : firstFailure.message;
  }

  if (firstFailure.code === 'resume_compile_failed' || firstFailure.code === 'cover_letter_compile_failed') {
    const stderr = extractFailureStderr(firstFailure);
    return stderr ? `${firstFailure.message} ${stderr}` : firstFailure.message;
  }

  return firstFailure.message;
}

/** Extract editable fields from a completed job's markdown + input. */
export function extractExportFields(markdown: string, jobTitle: string): ExportFields {
  const pkg = parsePackage(markdown);
  const fields: ExportFields = {
    jobTitle,
    summary: '',
    labDemand: [],
    focusDigital: [],
    firstPageSage: [],
    learMarketing: [],
    gestallt: [],
    coverpro: [],
    daylight: [],
    contextmax: [],
    ebay: [],
    earlierExperience: 'Earlier: Product Copywriter, Toyota (via agency) | Lead Content Strategist, eBay | Content Writer, Brafton',
    coverLetter: '',
  };

  for (const section of pkg.sections) {
    if (section.kind === 'summary') {
      fields.summary = section.bullets.map(b => b.text).join(' ') || section.paragraphs.join(' ');
    } else if (section.kind === 'cover-letter') {
      const body = section.raw
        .split('\n')
        .slice(1)
        .join('\n')
        .trim();
      // Skip junk cover letter sections (e.g., Codex outputting "Not applicable")
      const content = body.toLowerCase().trim();
      if (!content || content === 'not applicable' || content === 'n/a' || content === 'none' || content.length < 20) {
        continue;
      }
      fields.coverLetter = body;
    } else if (section.employerTag === 'labdemand') {
      fields.labDemand = section.bullets.map(b => b.text);
    } else if (section.employerTag === 'focus-digital') {
      fields.focusDigital = section.bullets.map(b => b.text);
    } else if (section.employerTag === 'first-page-sage') {
      fields.firstPageSage = section.bullets.map(b => b.text);
    } else if (section.employerTag === 'lear-marketing') {
      fields.learMarketing = section.bullets.map(b => b.text);
    } else if (section.employerTag === 'gestallt') {
      fields.gestallt = section.bullets.map(b => b.text);
    } else if (section.employerTag === 'coverpro') {
      fields.coverpro = section.bullets.map(b => b.text);
    } else if (section.employerTag === 'daylight') {
      fields.daylight = section.bullets.map(b => b.text);
    } else if (section.employerTag === 'contextmax') {
      fields.contextmax = section.bullets.map(b => b.text);
    } else if (section.employerTag === 'ebay') {
      fields.ebay = section.bullets.map(b => b.text);
    } else if (section.employerTag === 'earlier-experience') {
      // Extract the display line from raw section text (no bullets, just text)
      const lines = section.raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('##'));
      if (lines.length > 0) fields.earlierExperience = lines.join(' ');
    }
  }

  return fields;
}

function formatTrimGuidance(estimatedTrimChars: number | null): string {
  if (typeof estimatedTrimChars !== 'number' || estimatedTrimChars <= 0) {
    return 'Cut roughly 3-6 characters or tighten a long word/phrase.';
  }

  const low = Math.max(1, estimatedTrimChars);
  const high = Math.max(low + 2, Math.ceil(estimatedTrimChars * 1.6));
  return `Cut roughly ${low}-${high} characters, or replace one wide phrase.`;
}

function buildBulletMeasureInputs(fields: ExportFields): Array<TypstBulletMeasureInput & { block: string; label: string }> {
  const sections = [
    { block: 'Independent Consulting Experience', bullets: fields.labDemand },
    { block: 'Focus Digital Experience', bullets: fields.focusDigital },
    { block: 'First Page Sage Experience', bullets: fields.firstPageSage },
    { block: 'Lear Marketing Experience', bullets: fields.learMarketing },
    { block: 'Gestallt', bullets: fields.gestallt },
    { block: 'CoverPro', bullets: fields.coverpro },
    { block: 'DayLight', bullets: fields.daylight },
    { block: 'ContextMax', bullets: fields.contextmax },
    { block: 'eBay Experience', bullets: fields.ebay },
  ];

  return sections.flatMap(({ block, bullets }) =>
    bullets.map((text, index) => ({
      fieldKey: getBulletFieldKey(block, index),
      text,
      block,
      label: getBulletFieldLabel(block, index),
    })),
  );
}

/** Build the JSON data structure that Typst templates expect. */
export function buildExportData(fields: ExportFields) {
  const coverLetterParagraphs = fields.coverLetter
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return {
    jobTitle: fields.jobTitle,
    summary: fields.summary,
    experience: {
      labDemand: fields.labDemand,
      focusDigital: fields.focusDigital,
      firstPageSage: fields.firstPageSage,
      learMarketing: fields.learMarketing,
      gestallt: fields.gestallt,
      coverpro: fields.coverpro,
      daylight: fields.daylight,
      contextmax: fields.contextmax,
      ebay: fields.ebay,
      earlierExperience: fields.earlierExperience,
    },
    coverLetter: coverLetterParagraphs,
  };
}

/** Sanitize a string for use in a filename. */
function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, ' ');
}

/** Call the Tauri export_pdf command to generate both PDFs. */
export async function exportPdfs(fields: ExportFields, company: string, outputDir?: string): Promise<ExportResult> {
  const { invoke } = await import('@tauri-apps/api/core');
  const jsonData = JSON.stringify(buildExportData(fields));
  const safeCompany = sanitizeFilename(company) || 'export';
  const resumeFilename = `John Curran - Resume - ${safeCompany}.pdf`;
  const coverLetterFilename = `John Curran - Cover Letter - ${safeCompany}.pdf`;

  return await invoke<ExportResult>('export_pdf', {
    jsonData,
    resumeFilename,
    coverLetterFilename,
    outputDir: outputDir || null,
  });
}

/** Run Typst preflight without writing PDFs so manual edits can be checked before export. */
export async function checkPdfPreflight(fields: ExportFields): Promise<ResumePreflight> {
  const { invoke } = await import('@tauri-apps/api/core');
  const jsonData = JSON.stringify(buildExportData(fields));
  return await invoke<ResumePreflight>('preflight_pdf', { jsonData });
}

export async function checkPdfBulletFailures(fields: ExportFields): Promise<PreflightFailure[]> {
  const inputs = buildBulletMeasureInputs(fields);
  if (inputs.length === 0) {
    return [];
  }

  const { invoke } = await import('@tauri-apps/api/core');

  try {
    const measured = await invoke<TypstBulletMeasureResult[]>('measure_typst_bullets', {
      bullets: inputs.map(({ fieldKey, text }) => ({ fieldKey, text })),
    });

    return measured.flatMap((measurement, index) => {
      const input = inputs[index];
      if (!measurement || measurement.singleLine || !input) {
        return [];
      }

      const width = typeof measurement.naturalWidthPt === 'number' ? measurement.naturalWidthPt.toFixed(1) : 'n/a';
      const available = typeof measurement.contentWidthPt === 'number' ? measurement.contentWidthPt.toFixed(1) : 'n/a';
      const overflow = typeof measurement.overflowWidthPt === 'number' ? measurement.overflowWidthPt.toFixed(1) : 'n/a';
      const lineCount = typeof measurement.estimatedLineCount === 'number' ? measurement.estimatedLineCount : 2;

      return [{
        code: 'typst-bullet-too-wide',
        message: `Typst wraps this bullet to about ${lineCount} lines (${width}pt measured vs ${available}pt available, overflow ${overflow}pt). ${formatTrimGuidance(measurement.estimatedTrimChars)}`,
        sectionId: input.fieldKey,
        details: {
          block: input.block,
          fieldKey: input.fieldKey,
          fieldLabel: input.label,
          widthPt: measurement.naturalWidthPt,
          availablePt: measurement.contentWidthPt,
          overflowPt: measurement.overflowWidthPt,
          estimatedTrimChars: measurement.estimatedTrimChars,
        },
      }];
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{
      code: 'typst-bullet-measurement-unavailable',
      message: `Typst bullet measurement was unavailable: ${message}`,
      sectionId: null,
      details: { severity: 'warning' },
    }];
  }
}

export async function checkPdfFitDiagnostics(fields: ExportFields): Promise<ExportFitDiagnostics> {
  const [preflight, bulletFailures] = await Promise.all([
    checkPdfPreflight(fields),
    checkPdfBulletFailures(fields),
  ]);

  return { preflight, bulletFailures };
}

export async function checkMarkdownFitDiagnostics(markdown: string, jobTitle: string): Promise<ExportFitDiagnostics> {
  return checkPdfFitDiagnostics(extractExportFields(markdown, jobTitle));
}
