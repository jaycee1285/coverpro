import type { LintResult, LintError, LintFieldStatus, ResumeMode } from '$lib/types';
import { EXPERIENCE_DATA } from '$lib/config/resume-data';
import { RESUME_MODE_MAP } from '$lib/config/resume-modes';
import { checkSimilarityToSource } from '$lib/utils/similarity';
import { getSectionFieldKey } from '$lib/utils/lint-field-keys';

// ============================================================================
// IMMUTABLE FACTS (contact info, dates, metrics)
// ============================================================================

// Contact information (must match exactly)
const CONTACT_INFO = {
  name: 'John Curran',
  location: 'Beaufort, SC',
  email: 'curran.john.m@gmail.com',
  phone: '843.505.6625',
  website: 'www.blankpagesyndrome.com',
};

// Employment dates (YYYY or YYYY-YYYY format)
const EMPLOYMENT_DATES: Record<string, string> = {
  'labdemand': '2025–Present',
  'independent consult': '2025–Present',
  'focus digital': '2024–2025',
  'first page sage': '2023–2024',
  'lear marketing': '2009–2024',
};

// Valid metrics from EXPERIENCE_DATA (Focus Digital only)
const VALID_METRICS = [
  '631%', '+631%',
  '366%', '+366%',
  '241%', '+241%',
  '14 leads', '14 qualified',
  '$25K', '$25K-$75K',
  '3.5x', '2.4x',
];

// Allowed project names (only these can be mentioned in resume)
const ALLOWED_PROJECTS = [
  'Gestallt',
  'CoverPro',
  'DayLight',
  'OpenSwarm',
  'Crustdown',
  'giopad',
  'VoxClock',
  'MarkText',
  'Ferritebar',
  'Tryage',
  'IconFlash',
  'ClearSheet',
  'WordsApart',
  'VaultAdd',
  'cvgui',
];

// Common hallucinated projects to flag
const HALLUCINATED_PROJECTS = [
  'Typst Resume Compiler',
  'Resume Compiler',
  'labDemand Platform',
  'Content Platform',
];

// Forbidden tokens for Lear Marketing section (hard fail)
const FORBIDDEN_LM_TOKENS = [
  /\btoyota\b/i,
  /\bebay\b/i,
];

// Filler phrases in resume bullets (warning)
const FILLER_PHRASES = [
  /\bresponsible for\b/i,
  /\bworked on\b/i,
  /\bhelped with\b/i,
  /\bassisted with\b/i,
];

// Cover letter style violations
const COVER_LETTER_VIOLATIONS = {
  emDash: /—/g,
  aiSlop: [
    /\bI'?m excited to\b/i,
    /\bI believe I would be\b/i,
    /\bpassionate about\b/i,
    /\bthroughout my career\b/i,
    /\bwelcome the opportunity\b/i,
    /\bperfectly align/i,
    /\bunique combination of/i,
  ],
};

// Character limits
const MIN_CHAR_LENGTH = 80;
const MAX_CHAR_LENGTH = 110;

// FME Focus Digital pipeline metric patterns (at least 2 of 4 must appear)
const FME_FD_PIPELINE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: '14 qualified leads', pattern: /14\s+(qualified|leads?)/ },
  { label: '$25K', pattern: /\$25[Kk]/ },
  { label: '3.5x', pattern: /3\.5x/ },
  { label: '2.4x', pattern: /2\.4x/ },
];

// PMM Focus Digital pipeline metric patterns (at least 2 of 4 must appear)
const PMM_FD_PIPELINE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: '14 qualified leads', pattern: /14\s+(qualified|leads?)/ },
  { label: '$25K', pattern: /\$25[Kk]/ },
  { label: '2.4x', pattern: /2\.4x/ },
  { label: 'competitive positioning', pattern: /competitive\s+position/i },
];

// Focus Digital required metric patterns (at least 3 of 5 must appear)
// Client-pinned: RF lab (+631%), die cutter (+366%, +241%), 14 leads, $25K-$75K
const FD_METRIC_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: '631%', pattern: /631\s*%/ },
  { label: '366%', pattern: /366\s*%/ },
  { label: '241%', pattern: /241\s*%/ },
  { label: '14 leads', pattern: /14\s+(qualified|leads?)/ },
  { label: '$25K', pattern: /\$25[Kk]/ },
];

// Map block names to EXPERIENCE_DATA keys for similarity and bleed checks
const BLOCK_TO_EMPLOYER: Record<string, keyof typeof EXPERIENCE_DATA> = {
  'independent consult': 'labDemand',
  'focus digital': 'focusDigital',
  'first page sage': 'firstPageSage',
  'lear marketing': 'learMarketing',
  'technical projects': 'gestallt',
  'ebay': 'ebay',
};

interface BulletBlock {
  name: string;
  bullets: { text: string; line: number; index: number }[];
  startLine: number;
}

function normalizeFieldSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getBlockFieldKey(blockName: string): string {
  return normalizeFieldSegment(blockName);
}

export function getBulletFieldKey(blockName: string, bulletIndex: number): string {
  return `${getBlockFieldKey(blockName)}:bullet:${bulletIndex + 1}`;
}

function getCoverLetterFieldKey(): string {
  return 'war-cover-letter:block';
}

export function getBulletFieldLabel(blockName: string, bulletIndex: number): string {
  return `${blockName} bullet ${bulletIndex + 1}`;
}

export function lintMarkdown(markdown: string, resumeMode: ResumeMode = 'content'): LintResult {
  const errors: LintError[] = [];
  const lines = markdown.split('\n');

  // Parse blocks
  const blocks = parseBlocks(lines);
  const modeConfig = RESUME_MODE_MAP[resumeMode];
  const expectedCounts = modeConfig.expectedBulletCounts;
  const allSectionKeys = ['summary', 'independent consult', 'focus digital', 'first page sage', 'lear marketing', 'technical projects', 'ebay'];

  // Validate immutable facts FIRST (contact info, dates, metrics, projects)
  lintContactInfo(markdown, errors);
  lintEmploymentDates(markdown, errors);
  lintMetrics(markdown, errors);
  lintProjectNames(markdown, errors);

  // Lint each block for format
  for (const block of blocks) {
    const blockKey = block.name.toLowerCase();

    // Skip cover letter and earlier experience (handled separately)
    if (blockKey.includes('cover letter')) continue;
    if (blockKey.includes('earlier experience')) continue;

    // Check for forbidden sections (not in expected counts for this mode)
    const matchesExpected = Object.keys(expectedCounts).some(key => blockKey.includes(key));
    if (!matchesExpected) {
      // Before declaring forbidden, check if it's a misnamed version of an expected section.
      // Compare significant words (≥4 chars) to catch "Digital Marketing" → "focus digital", etc.
      const blockWords = blockKey.split(/\s+/).filter(w => w.length >= 4);
      let bestMatch: string | null = null;
      let bestOverlap = 0;
      for (const key of Object.keys(expectedCounts)) {
        const keyWords = key.split(/\s+/).filter(w => w.length >= 4);
        const overlap = blockWords.filter(w => keyWords.some(kw => w.includes(kw) || kw.includes(w))).length;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestMatch = key;
        }
      }

      if (bestMatch && bestOverlap > 0) {
        // Likely a misnamed header — tell repair to rename, not remove
        const canonical = allSectionKeys.find(k => k.includes(bestMatch!)) || bestMatch;
        errors.push({
          code: 'section-header-mismatch',
          block: block.name,
          message: `Section header "${block.name}" doesn't match expected format. Rename to match the expected "## ${canonical.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} Experience" header.`,
          severity: 'error',
          fieldKeys: [getSectionFieldKey(block.name)],
        });
      } else {
        // Check if it matches ANY known section (allowed in other modes but not this one)
        const matchesAnyMode = allSectionKeys.some(key => blockKey.includes(key));
        if (matchesAnyMode) {
          errors.push({
            code: 'section-not-allowed',
            block: block.name,
            message: `Section "${block.name}" is not allowed in ${resumeMode} mode. Remove this section entirely and redistribute its content.`,
            severity: 'error',
            fieldKeys: [getSectionFieldKey(block.name)],
          });
        } else {
          // Truly unknown section
          errors.push({
            code: 'section-unknown',
            block: block.name,
            message: `Unknown section "${block.name}" is not allowed in ${resumeMode} mode. Remove this section.`,
            severity: 'error',
            fieldKeys: [getSectionFieldKey(block.name)],
          });
        }
      }
      continue;
    }

    // Check bullet count
    const expectedCount = Object.entries(expectedCounts).find(
      ([key]) => blockKey.includes(key)
    )?.[1];

    if (expectedCount && block.bullets.length < expectedCount) {
      errors.push({
        code: 'section-too-few-bullets',
        block: block.name,
        message: `Too few bullets (${block.bullets.length}/${expectedCount}). Add ${expectedCount - block.bullets.length} more.`,
        severity: 'error',
        fieldKeys: [getSectionFieldKey(block.name)],
      });
    } else if (expectedCount && block.bullets.length > expectedCount) {
      errors.push({
        code: 'section-too-many-bullets',
        block: block.name,
        message: `Too many bullets (${block.bullets.length}/${expectedCount}). Remove ${block.bullets.length - expectedCount}.`,
        severity: 'warning',
        fieldKeys: [getSectionFieldKey(block.name)],
      });
    }

    // Check each bullet format
    for (const bullet of block.bullets) {
      const fieldKey = getBulletFieldKey(block.name, bullet.index);
      const fieldLabel = getBulletFieldLabel(block.name, bullet.index);
      lintLineLength(bullet.text, block.name, errors, fieldKey, fieldLabel, bullet.line);
      lintEndsWithPeriod(bullet.text, block.name, errors, fieldKey, fieldLabel, bullet.line);
      lintFillerPhrases(bullet.text, block.name, errors, fieldKey, fieldLabel, bullet.line);
    }

    // Similarity check against source bullets
    const employerKey = Object.entries(BLOCK_TO_EMPLOYER).find(
      ([key]) => blockKey.includes(key)
    )?.[1];

    if (employerKey) {
      const employer = EXPERIENCE_DATA[employerKey];
      if ('bulletVariants' in employer) {
        const allSourceBullets = collectAllBullets(employer.bulletVariants);
        const simErrors = checkSimilarityToSource(
          block.name,
          block.bullets.map((bullet) => bullet.text),
          allSourceBullets,
        ).map((error) => ({
          ...error,
          code: error.code || 'bullet-similarity',
          fieldKeys: error.fieldKeys || [getSectionFieldKey(block.name)],
        }));
        errors.push(...simErrors);
      }
    }

    // Cross-employer bleed detection
    if (employerKey) {
      const employer = EXPERIENCE_DATA[employerKey];
      if ('sectionScopes' in employer) {
        lintExperienceBleed(block, employer.sectionScopes.disallowed, errors);
      }
    }
  }

  if (modeConfig.eitherOrSections) {
    const [leftKey, rightKey] = modeConfig.eitherOrSections;
    const hasLeft = blocks.some(b => b.name.toLowerCase().includes(leftKey));
    const hasRight = blocks.some(b => b.name.toLowerCase().includes(rightKey));
    if (hasLeft && hasRight) {
      errors.push({
        code: 'structure-either-or-conflict',
        block: 'Structure',
        message: 'Include EITHER Technical Projects (Gestallt) OR eBay Experience, not both. Remove one.',
        severity: 'error',
        fieldKeys: [getSectionFieldKey(leftKey), getSectionFieldKey(rightKey)],
      });
    } else if (!hasLeft && !hasRight) {
      errors.push({
        code: 'structure-either-or-missing',
        block: 'Structure',
        message: 'Missing mandatory section: must include Technical Projects (Gestallt) OR eBay Experience.',
        severity: 'error',
        fieldKeys: [getSectionFieldKey(leftKey), getSectionFieldKey(rightKey)],
      });
    }
  }

  if (!blocks.some((block) => block.name.toLowerCase().includes('cover letter'))) {
    errors.push({
      code: 'cover-letter-missing',
      block: 'WAR Cover Letter',
      message: 'Missing required "## WAR Cover Letter" section. The package is not admissible without a cover letter.',
      severity: 'error',
      fieldKeys: [getCoverLetterFieldKey()],
    });
  }

  // Lint Lear Marketing for forbidden tokens
  const lmBlock = blocks.find(b => b.name.toLowerCase().includes('lear marketing'));
  if (lmBlock) {
    lintLearMarketingTokens(lmBlock, errors);
  }

  // Lint Focus Digital for required metrics (mode-specific)
  const fdBlock = blocks.find(b => b.name.toLowerCase().includes('focus digital'));
  if (fdBlock) {
    if (resumeMode === 'content') {
      // Content mode: require 3 of 5 SEO metrics
      lintFocusDigitalMetrics(fdBlock, errors);
    } else if (resumeMode === 'fme') {
      // FME mode: require 2 of 4 pipeline metrics, forbid standalone SEO framing
      lintFmeFocusDigitalMetrics(fdBlock, errors);
    } else if (resumeMode === 'pmm') {
      // PMM mode: require 2 of 4 pipeline/positioning metrics, forbid SEO framing
      lintPmmFocusDigitalMetrics(fdBlock, errors);
    }
    // PM and DevRel: no FD metric requirements
  }

  // Lint cover letter style
  lintCoverLetterStyle(markdown, errors);

  const fields = collectFieldStatuses(blocks, errors, markdown);

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    fields,
  };
}

// Collect all bullets from all variant sets into a flat array
function collectAllBullets(variants: { default: string[]; graphite?: string[]; dbeaver?: string[]; productLens?: string[] }): string[] {
  return [
    ...variants.default,
    ...(variants.graphite || []),
    ...(variants.dbeaver || []),
    ...(variants.productLens || []),
  ];
}

function parseBlocks(lines: string[]): BulletBlock[] {
  const blocks: BulletBlock[] = [];
  let currentBlock: BulletBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for header
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        name: headerMatch[1],
        bullets: [],
        startLine: i + 1,
      };
      continue;
    }

    // Check for bullet
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch && currentBlock) {
      currentBlock.bullets.push({
        text: bulletMatch[1],
        line: i + 1,
        index: currentBlock.bullets.length,
      });
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function lintLineLength(
  text: string,
  blockName: string,
  errors: LintError[],
  fieldKey?: string,
  fieldLabel?: string,
  line?: number,
): void {
  const length = text.length;
  if (length < MIN_CHAR_LENGTH) {
    errors.push({
      code: 'bullet-too-short',
      block: blockName,
      line,
      message: `Line is outside the old heuristic range (${length} chars, target ${MIN_CHAR_LENGTH}-${MAX_CHAR_LENGTH}): "${text.slice(0, 40)}..."`,
      severity: 'warning',
      fieldKeys: fieldKey ? [fieldKey] : undefined,
      fieldKey,
      fieldLabel,
    });
  } else if (length > MAX_CHAR_LENGTH) {
    errors.push({
      code: 'bullet-too-long',
      block: blockName,
      line,
      message: `Line is outside the old heuristic range (${length} chars, target ${MIN_CHAR_LENGTH}-${MAX_CHAR_LENGTH}): "${text.slice(0, 40)}..."`,
      severity: 'warning',
      fieldKeys: fieldKey ? [fieldKey] : undefined,
      fieldKey,
      fieldLabel,
    });
  }
}

function lintEndsWithPeriod(
  text: string,
  blockName: string,
  errors: LintError[],
  fieldKey?: string,
  fieldLabel?: string,
  line?: number,
): void {
  if (!text.trim().endsWith('.')) {
    errors.push({
      code: 'bullet-missing-period',
      block: blockName,
      line,
      message: `Line must end with a period: "${text.slice(-30)}"`,
      severity: 'error',
      fieldKeys: fieldKey ? [fieldKey] : undefined,
      fieldKey,
      fieldLabel,
    });
  }
}

function lintFillerPhrases(
  text: string,
  blockName: string,
  errors: LintError[],
  fieldKey?: string,
  fieldLabel?: string,
  line?: number,
): void {
  for (const pattern of FILLER_PHRASES) {
    if (pattern.test(text)) {
      const match = text.match(pattern)?.[0];
      errors.push({
        code: 'bullet-filler-phrase',
        block: blockName,
        line,
        message: `Filler phrase detected: "${match}"`,
        severity: 'warning',
        fieldKeys: fieldKey ? [fieldKey] : undefined,
        fieldKey,
        fieldLabel,
      });
    }
  }
}

function lintLearMarketingTokens(block: BulletBlock, errors: LintError[]): void {
  const fullText = block.bullets.map((bullet) => bullet.text).join(' ');

  for (const pattern of FORBIDDEN_LM_TOKENS) {
    if (pattern.test(fullText)) {
      errors.push({
        code: 'lear-marketing-forbidden-token',
        block: block.name,
        message: `Forbidden reference in Lear Marketing: ${pattern.source}`,
        severity: 'error',
        fieldKeys: [getSectionFieldKey(block.name)],
      });
    }
  }
}

function lintFocusDigitalMetrics(block: BulletBlock, errors: LintError[]): void {
  const fullText = block.bullets.map((bullet) => bullet.text).join(' ');
  const found: string[] = [];
  const missing: string[] = [];

  for (const { label, pattern } of FD_METRIC_PATTERNS) {
    if (pattern.test(fullText)) {
      found.push(label);
    } else {
      missing.push(label);
    }
  }

  if (found.length < 3) {
    errors.push({
      code: 'focus-digital-metrics-missing',
      block: block.name,
      message: `Focus Digital requires 3+ client-pinned metrics, found ${found.length}. Missing: ${missing.join(', ')}`,
      severity: 'error',
      fieldKeys: [getSectionFieldKey(block.name)],
    });
  }
}

function lintFmeFocusDigitalMetrics(block: BulletBlock, errors: LintError[]): void {
  const fullText = block.bullets.map((bullet) => bullet.text).join(' ');

  // Require 2+ pipeline metrics
  const found: string[] = [];
  const missing: string[] = [];
  for (const { label, pattern } of FME_FD_PIPELINE_PATTERNS) {
    if (pattern.test(fullText)) {
      found.push(label);
    } else {
      missing.push(label);
    }
  }
  if (found.length < 2) {
    errors.push({
      code: 'fme-focus-digital-metrics-missing',
      block: block.name,
      message: `FME Focus Digital requires 2+ pipeline metrics (14 leads, $25K, 3.5x, 2.4x), found ${found.length}. Missing: ${missing.join(', ')}`,
      severity: 'error',
      fieldKeys: [getSectionFieldKey(block.name)],
    });
  }

  // Forbid standalone SEO framing metrics (631%, 366% as lead metrics)
  if (/\+?631\s*%/.test(fullText) || /\+?366\s*%/.test(fullText)) {
    errors.push({
      code: 'fme-focus-digital-seo-framing',
      block: block.name,
      message: `FME Focus Digital must not use SEO framing (+631% impressions, +366% traffic). Reframe for pipeline/funnel.`,
      severity: 'error',
      fieldKeys: [getSectionFieldKey(block.name)],
    });
  }
}

function lintPmmFocusDigitalMetrics(block: BulletBlock, errors: LintError[]): void {
  const fullText = block.bullets.map((bullet) => bullet.text).join(' ');

  // Require 2+ pipeline/positioning metrics
  const found: string[] = [];
  const missing: string[] = [];
  for (const { label, pattern } of PMM_FD_PIPELINE_PATTERNS) {
    if (pattern.test(fullText)) {
      found.push(label);
    } else {
      missing.push(label);
    }
  }
  if (found.length < 2) {
    errors.push({
      code: 'pmm-focus-digital-metrics-missing',
      block: block.name,
      message: `PMM Focus Digital requires 2+ pipeline/positioning metrics (14 leads, $25K, 2.4x, competitive positioning), found ${found.length}. Missing: ${missing.join(', ')}`,
      severity: 'error',
      fieldKeys: [getSectionFieldKey(block.name)],
    });
  }

  // Forbid standalone SEO framing metrics
  if (/\+?631\s*%/.test(fullText) || /\+?366\s*%/.test(fullText)) {
    errors.push({
      code: 'pmm-focus-digital-seo-framing',
      block: block.name,
      message: `PMM Focus Digital must not use SEO framing (+631% impressions, +366% traffic). Reframe for pipeline/positioning.`,
      severity: 'error',
      fieldKeys: [getSectionFieldKey(block.name)],
    });
  }
}

function lintExperienceBleed(block: BulletBlock, disallowedTokens: string[], errors: LintError[]): void {
  const fullText = block.bullets.map((bullet) => bullet.text).join(' ').toLowerCase();

  for (const token of disallowedTokens) {
    // Skip very short tokens and percentage patterns that might false-positive
    if (token.length < 3) continue;

    const tokenLower = token.toLowerCase();
    // Use word boundary matching for multi-word tokens
    const escaped = tokenLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');

    if (regex.test(fullText)) {
      errors.push({
        code: 'cross-employer-bleed',
        block: block.name,
        message: `Cross-employer bleed: "${token}" is not allowed in ${block.name}`,
        severity: 'error',
        fieldKeys: [getSectionFieldKey(block.name)],
      });
    }
  }
}

function lintCoverLetterStyle(fullMarkdown: string, errors: LintError[]): void {
  // Extract cover letter text
  const coverLetterMatch = fullMarkdown.match(/## WAR Cover Letter\s*\n([\s\S]*?)(?=^## |\s*$)/m);
  if (!coverLetterMatch) return;

  const coverLetterText = coverLetterMatch[1];
  const questionsOnly = isQuestionsOnlyCoverLetter(coverLetterText);

  const fieldKey = getCoverLetterFieldKey();
  const fieldLabel = 'WAR Cover Letter';

  // Check for em-dashes
  if (COVER_LETTER_VIOLATIONS.emDash.test(coverLetterText)) {
    errors.push({
      code: 'cover-letter-em-dash',
      block: 'WAR Cover Letter',
      message: 'Em-dash (—) found. Use periods or commas.',
      severity: 'error',
      fieldKeys: [getCoverLetterFieldKey()],
      fieldKey,
      fieldLabel,
    });
  }

  // Check for AI slop phrases
  for (const pattern of COVER_LETTER_VIOLATIONS.aiSlop) {
    if (pattern.test(coverLetterText)) {
      const match = coverLetterText.match(pattern)?.[0];
      errors.push({
        code: 'cover-letter-ai-slop',
        block: 'WAR Cover Letter',
        message: `AI slop: "${match}"`,
        severity: 'error',
        fieldKeys: [getCoverLetterFieldKey()],
        fieldKey,
        fieldLabel,
      });
    }
  }

  // Check for multiple triple-item lists
  if (!questionsOnly) {
    const tripleMatches = coverLetterText.match(/\b\w+,\s*\w+,?\s*and\s+\w+\b/gi) || [];
    if (tripleMatches.length > 1) {
      errors.push({
        code: 'cover-letter-too-many-triples',
        block: 'WAR Cover Letter',
        message: `Too many triple-item lists (${tripleMatches.length}). Max 1.`,
        severity: 'error',
        fieldKeys: [getCoverLetterFieldKey()],
        fieldKey,
        fieldLabel,
      });
    }
  }

  // Check word count (max 150 words)
  if (!questionsOnly) {
    const words = coverLetterText.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length > 150) {
      errors.push({
        code: 'cover-letter-too-long',
        block: 'WAR Cover Letter',
        message: `Cover letter too long (${words.length} words, max 150). Cut ${words.length - 150} words.`,
        severity: 'error',
        fieldKeys: [getCoverLetterFieldKey()],
        fieldKey,
        fieldLabel,
      });
    }

    // Check paragraph count (max 4: 3 body + optional CTA)
    const paragraphs = coverLetterText.split(/\n\n+/).filter(p => p.trim() && !p.startsWith('#'));
    if (paragraphs.length > 4) {
      errors.push({
        code: 'cover-letter-too-many-paragraphs',
        block: 'WAR Cover Letter',
        message: `Too many paragraphs (${paragraphs.length}, max 4). Consolidate into 3 body + CTA.`,
        severity: 'error',
        fieldKeys: [getCoverLetterFieldKey()],
        fieldKey,
        fieldLabel,
      });
    }

    // Check paragraph sentence count (max 3 per paragraph)
    for (const para of paragraphs) {
      const sentences = para.split(/[.!?]+(?:\s|$)/).filter(s => s.trim().length > 10);
      if (sentences.length > 3) {
        const preview = para.slice(0, 40).replace(/\n/g, ' ');
        errors.push({
          code: 'cover-letter-paragraph-too-long',
          block: 'WAR Cover Letter',
          message: `Paragraph has ${sentences.length} sentences (max 3): "${preview}..."`,
          severity: 'error',
          fieldKeys: [getCoverLetterFieldKey()],
          fieldKey,
          fieldLabel,
        });
      }
    }
  }
}

function collectFieldStatuses(blocks: BulletBlock[], errors: LintError[], markdown: string): LintFieldStatus[] {
  const statusMap = new Map<string, LintFieldStatus>();

  for (const block of blocks) {
    for (const bullet of block.bullets) {
      const key = getBulletFieldKey(block.name, bullet.index);
      statusMap.set(key, {
        key,
        block: block.name,
        label: getBulletFieldLabel(block.name, bullet.index),
        kind: 'bullet',
        status: 'pass',
        errors: [],
      });
    }
  }

  if (/^##\s+WAR Cover Letter\s*$/m.test(markdown)) {
    const key = getCoverLetterFieldKey();
    statusMap.set(key, {
      key,
      block: 'WAR Cover Letter',
      label: 'WAR Cover Letter',
      kind: 'cover-letter',
      status: 'pass',
      errors: [],
    });
  }

  for (const error of errors) {
    if (!error.fieldKey) continue;
    const existing = statusMap.get(error.fieldKey);
    if (!existing) continue;
    existing.errors.push(error);
    if (error.severity === 'error') {
      existing.status = 'fail';
    } else if (existing.status === 'pass') {
      existing.status = 'warn';
    }
  }

  return Array.from(statusMap.values());
}

// ============================================================================
// IMMUTABLE FACT VALIDATORS
// ============================================================================

/**
 * Validate contact information hasn't been hallucinated
 */
function lintContactInfo(markdown: string, errors: LintError[]): void {
  const fullText = markdown.toLowerCase();

  // Check for wrong names
  const wrongNames = [
    /john\s+maxwell[- ]clark/i,
    /john\s+m[.\s]+curran/i,
    /jonathan\s+curran/i,
  ];

  for (const pattern of wrongNames) {
    if (pattern.test(markdown)) {
      errors.push({
        block: 'Contact Info',
        message: `Wrong name detected. Must be exactly "${CONTACT_INFO.name}"`,
        severity: 'error',
      });
      break;
    }
  }

  // Check for wrong locations
  const wrongLocations = [
    /boulder[,\s]+co/i,
    /denver[,\s]+co/i,
    /charleston[,\s]+sc/i,
    /columbia[,\s]+sc/i,
  ];

  for (const pattern of wrongLocations) {
    if (pattern.test(markdown)) {
      errors.push({
        block: 'Contact Info',
        message: `Wrong location detected. Must be "${CONTACT_INFO.location}"`,
        severity: 'error',
      });
      break;
    }
  }

  // Check for wrong email domains
  if (fullText.includes('@') && !fullText.includes(CONTACT_INFO.email.toLowerCase())) {
    // Look for common hallucinated email patterns
    const wrongEmails = [
      /@gmail\.com/i,
      /@proton/i,
      /@hey\.com/i,
    ];

    for (const pattern of wrongEmails) {
      if (pattern.test(markdown) && !markdown.toLowerCase().includes(CONTACT_INFO.email.toLowerCase())) {
        errors.push({
          block: 'Contact Info',
          message: `Wrong email detected. Must be "${CONTACT_INFO.email}"`,
          severity: 'error',
        });
        break;
      }
    }
  }

  // Check for wrong phone numbers
  const phonePattern = /\b\d{3}[.-]\d{3}[.-]\d{4}\b/;
  const phoneMatch = markdown.match(phonePattern);
  if (phoneMatch && !markdown.includes(CONTACT_INFO.phone)) {
    errors.push({
      block: 'Contact Info',
      message: `Wrong phone number detected. Must be "${CONTACT_INFO.phone}"`,
      severity: 'error',
    });
  }
}

/**
 * Validate employment dates match source data
 */
function lintEmploymentDates(markdown: string, errors: LintError[]): void {
  // Check Focus Digital dates (most commonly hallucinated)
  if (markdown.toLowerCase().includes('focus digital')) {
    const wrongDates = [
      /focus\s+digital.*?202[0123][–-]202[0123]/i,
      /focus\s+digital.*?201\d[–-]202\d/i,
    ];

    for (const pattern of wrongDates) {
      const match = markdown.match(pattern);
      if (match && !match[0].includes(EMPLOYMENT_DATES['focus digital'])) {
        errors.push({
          block: 'Focus Digital',
          message: `Wrong dates for Focus Digital. Must be "${EMPLOYMENT_DATES['focus digital']}"`,
          severity: 'error',
        });
        break;
      }
    }
  }

  // Check Lear Marketing dates
  if (markdown.toLowerCase().includes('lear marketing')) {
    const wrongDates = [
      /lear\s+marketing.*?201[0-7][–-]202\d/i,
      /lear\s+marketing.*?202\d[–-]202\d/i,
    ];

    for (const pattern of wrongDates) {
      const match = markdown.match(pattern);
      if (match && !match[0].includes(EMPLOYMENT_DATES['lear marketing'])) {
        errors.push({
          block: 'Lear Marketing',
          message: `Wrong dates for Lear Marketing. Must be "${EMPLOYMENT_DATES['lear marketing']}"`,
          severity: 'error',
        });
        break;
      }
    }
  }
}

/**
 * Validate metrics come from EXPERIENCE_DATA (no invented numbers)
 */
function lintMetrics(markdown: string, errors: LintError[]): void {
  // Find all percentage patterns
  const percentPattern = /\b(\d+)%/g;
  const percentMatches = Array.from(markdown.matchAll(percentPattern));

  for (const match of percentMatches) {
    const value = match[1] + '%';
    const withPlus = '+' + value;

    // Check if this percentage is valid
    if (!VALID_METRICS.includes(value) && !VALID_METRICS.includes(withPlus)) {
      // Common hallucinated percentages
      const commonFakes = ['51%', '12%', '50%', '100%', '200%', '300%'];
      if (commonFakes.includes(value)) {
        errors.push({
          block: 'Metrics',
          message: `Invented metric detected: "${value}". Valid metrics: ${VALID_METRICS.filter(m => m.includes('%')).join(', ')}`,
          severity: 'error',
        });
      }
    }
  }

  // Find all dollar amounts
  const dollarPattern = /\$(\d+[Kk]?)/g;
  const dollarMatches = Array.from(markdown.matchAll(dollarPattern));

  for (const match of dollarMatches) {
    const value = '$' + match[1];

    if (!VALID_METRICS.some(m => m.includes(value))) {
      errors.push({
        block: 'Metrics',
        message: `Invented dollar amount detected: "${value}". Valid: ${VALID_METRICS.filter(m => m.includes('$')).join(', ')}`,
        severity: 'error',
      });
    }
  }

  // Find all multiplier patterns (e.g., "3.5x")
  const multiplierPattern = /\b(\d+\.?\d*x)\b/gi;
  const multiplierMatches = Array.from(markdown.matchAll(multiplierPattern));

  for (const match of multiplierMatches) {
    const value = match[1].toLowerCase();

    if (!VALID_METRICS.some(m => m.toLowerCase() === value)) {
      errors.push({
        block: 'Metrics',
        message: `Invented multiplier detected: "${match[1]}". Valid: ${VALID_METRICS.filter(m => m.includes('x')).join(', ')}`,
        severity: 'error',
      });
    }
  }
}

function lintProjectNames(markdown: string, errors: LintError[]): void {
  // Check for hallucinated projects (hard fail)
  for (const project of HALLUCINATED_PROJECTS) {
    const pattern = new RegExp(`\\b${project}\\b`, 'i');
    if (pattern.test(markdown)) {
      errors.push({
        block: 'Projects',
        message: `Hallucinated project detected: "${project}". This project does not exist.`,
        severity: 'error',
      });
    }
  }

  // Extract potential project names from markdown
  // Look for patterns like "**ProjectName**" or standalone capitalized words
  const projectNamePattern = /\*\*([A-Z][a-zA-Z]+)\*\*/g;
  const matches = Array.from(markdown.matchAll(projectNamePattern));

  for (const match of matches) {
    const projectName = match[1];

    // Skip if it's a valid employer name or common markdown emphasis
    const skipWords = ['RBAC', 'API', 'JWT', 'PM', 'PMM', 'DevRel', 'Focus', 'Digital', 'Lear', 'Marketing', 'Technical', 'Projects'];
    if (skipWords.some(word => projectName.includes(word))) {
      continue;
    }

    // Check if it's an allowed project
    if (!ALLOWED_PROJECTS.includes(projectName)) {
      // Only flag if it looks like a project name (CamelCase or compound)
      if (projectName.length > 4 && /^[A-Z][a-z]+[A-Z]/.test(projectName)) {
        errors.push({
          block: 'Projects',
          message: `Unauthorized project "${projectName}". Allowed projects: ${ALLOWED_PROJECTS.join(', ')}`,
          severity: 'error',
        });
      }
    }
  }
}

function isQuestionsOnlyCoverLetter(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;

  const questionLabel = /^(q\d+[:.)]?|question\s*\d*[:.)]?)/i;
  const answerLabel = /^(a\d+[:.)]?|answer\s*\d*[:.)]?)/i;

  return lines.some(line => questionLabel.test(line) || answerLabel.test(line));
}
