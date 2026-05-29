// Structured parser for CoverPro resume output.
// The output format is deterministic (enforced by linter), so we parse into
// typed sections rather than relying on generic markdown→HTML conversion.

export type SectionKind = 'summary' | 'experience' | 'cover-letter';

export type EmployerTag =
  | 'labdemand'
  | 'focus-digital'
  | 'first-page-sage'
  | 'lear-marketing'
  | 'gestallt'
  | 'coverpro'
  | 'daylight'
  | 'traverse'
  | 'openswarm'
  | 'ebay'
  | 'earlier-experience';

export interface ParsedBullet {
  text: string;
  charCount: number;
}

export interface ParsedSection {
  kind: SectionKind;
  heading: string;
  employerTag?: EmployerTag;
  bullets: ParsedBullet[];
  paragraphs: string[];
  raw: string;
}

export interface ParsedPackage {
  title: string;
  sections: ParsedSection[];
  raw: string;
}

export interface PackageValidationResult {
  valid: boolean;
  parsed: ParsedPackage | null;
  reason?: string;
}

// Maps heading substrings (lowercase) to employer tags.
// Same keys as linter.ts BLOCK_TO_EMPLOYER, but with kebab-case values for CSS.
const EMPLOYER_MAP: Record<string, EmployerTag> = {
  'labdemand': 'labdemand',
  'independent consult': 'labdemand',
  'focus digital': 'focus-digital',
  'first page sage': 'first-page-sage',
  'lear marketing': 'lear-marketing',
  'gestallt': 'gestallt',
  'technical projects': 'gestallt',
  'coverpro': 'coverpro',
  'ai resume': 'coverpro',
  'resume pipeline': 'coverpro',
  'openswarm': 'openswarm',
  'open swarm': 'openswarm',
  'multi-agent orchestration': 'openswarm',
  'agent orchestration': 'openswarm',
  'daylight': 'daylight',
  'traverse': 'traverse',
  'contextmax': 'traverse',
  'context recovery': 'traverse',
  'markdown locality': 'traverse',
  'locality graph': 'traverse',
  'multi-project orchestration': 'traverse',
  'ai-driven multi-project': 'traverse',
  'multi-project': 'daylight',
  'project management': 'daylight',
  'ebay': 'ebay',
  'earlier experience': 'earlier-experience',
};

function classifySection(heading: string): { kind: SectionKind; employerTag?: EmployerTag } {
  const lower = heading.toLowerCase();

  if (lower.includes('cover letter')) {
    return { kind: 'cover-letter' };
  }

  if (lower === 'summary' || lower.startsWith('summary')) {
    return { kind: 'summary' };
  }

  // Experience section — try to match an employer
  let employerTag: EmployerTag | undefined;
  for (const [key, tag] of Object.entries(EMPLOYER_MAP)) {
    if (lower.includes(key)) {
      employerTag = tag;
      break;
    }
  }

  return { kind: 'experience', employerTag };
}

function extractBullets(lines: string[]): ParsedBullet[] {
  const bullets: ParsedBullet[] = [];
  for (const line of lines) {
    const match = line.match(/^[-*]\s+(.+)$/);
    if (match) {
      const text = match[1];
      bullets.push({ text, charCount: text.length });
    }
  }
  return bullets;
}

function extractParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [];
      }
    } else {
      current.push(line.trim());
    }
  }

  if (current.length > 0) {
    paragraphs.push(current.join(' '));
  }

  return paragraphs;
}

// Split "Technical Projects" section into subsections (Gestallt, CoverPro, Traverse, DayLight)
function splitTechnicalProjects(section: ParsedSection): ParsedSection[] {
  const lines = section.raw.split('\n');
  const subsections: ParsedSection[] = [];
  let currentSubheading: string | null = null;
  let currentLines: string[] = [];

  function flushSubsection() {
    if (currentSubheading === null || currentLines.length === 0) return;

    const { kind, employerTag } = classifySection(currentSubheading);
    const bullets = extractBullets(currentLines);

    subsections.push({
      kind,
      heading: currentSubheading,
      employerTag,
      bullets,
      paragraphs: [],
      raw: `### ${currentSubheading}\n${currentLines.join('\n')}`,
    });
  }

  for (const line of lines) {
    const subheadMatch = line.match(/^###\s+(.+)$/);

    if (subheadMatch) {
      flushSubsection();
      currentSubheading = subheadMatch[1];
      currentLines = [];
      continue;
    }

    if (line.startsWith('##')) continue; // Skip the main heading line

    if (currentSubheading !== null) {
      currentLines.push(line);
    }
  }

  flushSubsection();
  return subsections;
}

export function parsePackage(markdown: string): ParsedPackage {
  const lines = markdown.split('\n');
  let title = '';
  const sections: ParsedSection[] = [];

  // Find the # title line
  const titleIndex = lines.findIndex(l => /^#\s+/.test(l));
  if (titleIndex !== -1) {
    title = lines[titleIndex].replace(/^#\s+/, '').trim();
  }

  // Walk lines, split on ## headers
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let currentRawStart = -1;

  function flushSection() {
    if (currentHeading === null) return;

    const { kind, employerTag } = classifySection(currentHeading);
    const raw = currentLines.join('\n');

    const section: ParsedSection = {
      kind,
      heading: currentHeading,
      employerTag,
      bullets: kind !== 'cover-letter' ? extractBullets(currentLines) : [],
      paragraphs: kind === 'cover-letter' ? extractParagraphs(currentLines) : [],
      raw: `## ${currentHeading}\n${raw}`,
    };

    sections.push(section);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^##\s+(.+)$/);

    if (headerMatch) {
      flushSection();
      currentHeading = headerMatch[1];
      currentLines = [];
      currentRawStart = i;
      continue;
    }

    // Skip the title line itself
    if (i === titleIndex) continue;

    if (currentHeading !== null) {
      currentLines.push(line);
    }
  }

  // Flush the last section
  flushSection();

  // Post-process: split "Technical Projects" section into subsections for gestallt/coverpro/traverse/daylight
  const technicalProjectsIdx = sections.findIndex(s => s.heading.toLowerCase().includes('technical projects'));
  if (technicalProjectsIdx !== -1) {
    const techSection = sections[technicalProjectsIdx];
    const subsections = splitTechnicalProjects(techSection);
    if (subsections.length > 0) {
      // Replace the Technical Projects section with its subsections
      sections.splice(technicalProjectsIdx, 1, ...subsections);
    }
  }

  // Fallback: if no sections parsed, wrap entire text as paragraphs
  if (sections.length === 0 && markdown.trim()) {
    sections.push({
      kind: 'cover-letter',
      heading: '',
      bullets: [],
      paragraphs: extractParagraphs(lines),
      raw: markdown,
    });
  }

  return { title, sections, raw: markdown };
}

export function validatePackageMarkdown(markdown: string): PackageValidationResult {
  const parsed = parsePackage(markdown);
  const headings = parsed.sections.map((section) => section.heading.toLowerCase());
  const hasSummary = headings.some((heading) => heading === 'summary' || heading.startsWith('summary'));
  const hasCoverLetter = headings.some((heading) => heading.includes('cover letter'));
  const experienceCount = parsed.sections.filter((section) => section.kind === 'experience').length;

  if (!parsed.title.trim()) {
    return {
      valid: false,
      parsed,
      reason: 'Package is missing the "# Job Title - Company" heading.',
    };
  }

  if (!hasSummary) {
    return {
      valid: false,
      parsed,
      reason: 'Package is missing a Summary section.',
    };
  }

  if (!hasCoverLetter) {
    return {
      valid: false,
      parsed,
      reason: 'Package is missing the WAR Cover Letter section.',
    };
  }

  if (experienceCount === 0) {
    return {
      valid: false,
      parsed,
      reason: 'Package is missing experience/project sections.',
    };
  }

  return {
    valid: true,
    parsed,
  };
}
