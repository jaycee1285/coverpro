import { EXPERIENCE_DATA } from '$lib/config/resume-data';

export type StructuredResumeMode = 'content' | 'pmm';

type StructuredCoverLetter =
  | {
      kind: 'paragraphs';
      paragraphs: string[];
    }
  | {
      kind: 'answers';
      answers: { label: string; text: string }[];
    };

interface StructuredPackageBase {
  mode: StructuredResumeMode;
  title: string;
  summary: string;
  warCoverLetter: StructuredCoverLetter;
}

export interface StructuredContentPackage extends StructuredPackageBase {
  mode: 'content';
  independentConsultingExperience: string[];
  focusDigitalExperience: string[];
  firstPageSageExperience: string[];
  learMarketingExperience: string[];
  optionalSection:
    | {
        kind: 'technical-projects';
        gestallt: string[];
      }
    | {
        kind: 'ebay-experience';
        ebayExperience: string[];
      };
}

export interface StructuredPmmPackage extends StructuredPackageBase {
  mode: 'pmm';
  technicalProjects: {
    gestallt: string[];
    coverpro: string[];
    traverse: string[];
  };
  independentConsultingExperience: string[];
  focusDigitalExperience: string[];
  learMarketingExperience: string[];
}

export type StructuredPackage = StructuredContentPackage | StructuredPmmPackage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStringArray(
  value: unknown,
  label: string,
  exactLength: number,
): { ok: true; value: string[] } | { ok: false; reason: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reason: `${label} must be an array.` };
  }
  if (value.length !== exactLength) {
    return { ok: false, reason: `${label} must contain exactly ${exactLength} item(s).` };
  }
  if (!value.every(isNonEmptyString)) {
    return { ok: false, reason: `${label} contains an empty or invalid string.` };
  }
  return { ok: true, value: value.map((item) => item.trim()) };
}

function validateCoverLetter(
  value: unknown,
): { ok: true; value: StructuredCoverLetter } | { ok: false; reason: string } {
  if (!isRecord(value) || !isNonEmptyString(value.kind)) {
    return { ok: false, reason: 'warCoverLetter must be an object with a kind.' };
  }

  if (value.kind === 'paragraphs') {
    if (!Array.isArray(value.paragraphs) || value.paragraphs.length === 0) {
      return { ok: false, reason: 'warCoverLetter.paragraphs must contain at least one paragraph.' };
    }
    if (!value.paragraphs.every(isNonEmptyString)) {
      return { ok: false, reason: 'warCoverLetter.paragraphs contains an empty paragraph.' };
    }
    return {
      ok: true,
      value: {
        kind: 'paragraphs',
        paragraphs: value.paragraphs.map((paragraph) => paragraph.trim()),
      },
    };
  }

  if (value.kind === 'answers') {
    if (!Array.isArray(value.answers) || value.answers.length === 0) {
      return { ok: false, reason: 'warCoverLetter.answers must contain at least one answer.' };
    }
    const answers = [];
    for (const answer of value.answers) {
      if (!isRecord(answer) || !isNonEmptyString(answer.label) || !isNonEmptyString(answer.text)) {
        return { ok: false, reason: 'warCoverLetter.answers items must include non-empty label and text.' };
      }
      answers.push({
        label: answer.label.trim(),
        text: answer.text.trim(),
      });
    }
    return {
      ok: true,
      value: {
        kind: 'answers',
        answers,
      },
    };
  }

  return { ok: false, reason: 'warCoverLetter.kind must be "paragraphs" or "answers".' };
}

function renderCoverLetter(coverLetter: StructuredCoverLetter): string[] {
  if (coverLetter.kind === 'paragraphs') {
    return coverLetter.paragraphs;
  }

  return coverLetter.answers.map((answer) => `${answer.label}: ${answer.text}`);
}

function renderBullets(lines: string[]): string[] {
  return lines.map((line) => `- ${line.trim()}`);
}

function renderSection(heading: string, bullets: string[]): string[] {
  return [`## ${heading}`, ...renderBullets(bullets)];
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [
    codeFenceMatch?.[1]?.trim(),
    trimmed,
  ].filter((candidate): candidate is string => !!candidate);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Fall through to brace scan below.
    }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function renderStructuredPackageToMarkdown(pkg: StructuredPackage): string {
  const lines: string[] = [`# ${pkg.title.trim()}`, ''];

  lines.push(...renderSection('Summary', [pkg.summary]));
  lines.push('');

  if (pkg.mode === 'content') {
    lines.push(...renderSection('Independent Consulting Experience', pkg.independentConsultingExperience));
    lines.push('');
    lines.push(...renderSection('Focus Digital Experience', pkg.focusDigitalExperience));
    lines.push('');
    lines.push(...renderSection('First Page Sage Experience', pkg.firstPageSageExperience));
    lines.push('');
    lines.push(...renderSection('Lear Marketing Experience', pkg.learMarketingExperience));
    lines.push('');

    if (pkg.optionalSection.kind === 'technical-projects') {
      lines.push('## Technical Projects');
      lines.push('### Gestallt');
      lines.push(...renderBullets(pkg.optionalSection.gestallt));
      lines.push('');
      lines.push('## Earlier Experience');
      lines.push(EXPERIENCE_DATA.earlierExperience.displayLineWithEbay);
    } else {
      lines.push(...renderSection('eBay Experience', pkg.optionalSection.ebayExperience));
      lines.push('');
      lines.push('## Earlier Experience');
      lines.push(EXPERIENCE_DATA.earlierExperience.displayLine);
    }
  } else {
    lines.push('## Technical Projects');
    lines.push('### Gestallt');
    lines.push(...renderBullets(pkg.technicalProjects.gestallt));
    lines.push('### CoverPro');
    lines.push(...renderBullets(pkg.technicalProjects.coverpro));
    lines.push('### Traverse');
    lines.push(...renderBullets(pkg.technicalProjects.traverse));
    lines.push('');
    lines.push(...renderSection('Independent Consulting Experience', pkg.independentConsultingExperience));
    lines.push('');
    lines.push(...renderSection('Focus Digital Experience', pkg.focusDigitalExperience));
    lines.push('');
    lines.push(...renderSection('Lear Marketing Experience', pkg.learMarketingExperience));
    lines.push('');
    lines.push('## Earlier Experience');
    lines.push(EXPERIENCE_DATA.earlierExperience.displayLine);
  }

  lines.push('');
  lines.push('## WAR Cover Letter');
  lines.push(...renderCoverLetter(pkg.warCoverLetter));

  return lines.join('\n').trim() + '\n';
}

function validateStructuredContentPackage(
  parsed: Record<string, unknown>,
): { ok: true; value: StructuredContentPackage } | { ok: false; reason: string } {
  if (!isNonEmptyString(parsed.title)) {
    return { ok: false, reason: 'title must be a non-empty string.' };
  }
  if (!isNonEmptyString(parsed.summary)) {
    return { ok: false, reason: 'summary must be a non-empty string.' };
  }

  const independent = validateStringArray(parsed.independentConsultingExperience, 'independentConsultingExperience', 1);
  if (!independent.ok) return independent;
  const focusDigital = validateStringArray(parsed.focusDigitalExperience, 'focusDigitalExperience', 5);
  if (!focusDigital.ok) return focusDigital;
  const firstPageSage = validateStringArray(parsed.firstPageSageExperience, 'firstPageSageExperience', 3);
  if (!firstPageSage.ok) return firstPageSage;
  const learMarketing = validateStringArray(parsed.learMarketingExperience, 'learMarketingExperience', 3);
  if (!learMarketing.ok) return learMarketing;
  const coverLetter = validateCoverLetter(parsed.warCoverLetter);
  if (!coverLetter.ok) return coverLetter;

  if (!isRecord(parsed.optionalSection) || !isNonEmptyString(parsed.optionalSection.kind)) {
    return { ok: false, reason: 'optionalSection must be an object with a kind.' };
  }

  if (parsed.optionalSection.kind === 'technical-projects') {
    const gestallt = validateStringArray(parsed.optionalSection.gestallt, 'optionalSection.gestallt', 2);
    if (!gestallt.ok) return gestallt;
    return {
      ok: true,
      value: {
        mode: 'content',
        title: parsed.title.trim(),
        summary: parsed.summary.trim(),
        independentConsultingExperience: independent.value,
        focusDigitalExperience: focusDigital.value,
        firstPageSageExperience: firstPageSage.value,
        learMarketingExperience: learMarketing.value,
        optionalSection: {
          kind: 'technical-projects',
          gestallt: gestallt.value,
        },
        warCoverLetter: coverLetter.value,
      },
    };
  }

  if (parsed.optionalSection.kind === 'ebay-experience') {
    const ebay = validateStringArray(parsed.optionalSection.ebayExperience, 'optionalSection.ebayExperience', 3);
    if (!ebay.ok) return ebay;
    return {
      ok: true,
      value: {
        mode: 'content',
        title: parsed.title.trim(),
        summary: parsed.summary.trim(),
        independentConsultingExperience: independent.value,
        focusDigitalExperience: focusDigital.value,
        firstPageSageExperience: firstPageSage.value,
        learMarketingExperience: learMarketing.value,
        optionalSection: {
          kind: 'ebay-experience',
          ebayExperience: ebay.value,
        },
        warCoverLetter: coverLetter.value,
      },
    };
  }

  return { ok: false, reason: 'optionalSection.kind must be "technical-projects" or "ebay-experience".' };
}

function validateStructuredPmmPackage(
  parsed: Record<string, unknown>,
): { ok: true; value: StructuredPmmPackage } | { ok: false; reason: string } {
  if (!isNonEmptyString(parsed.title)) {
    return { ok: false, reason: 'title must be a non-empty string.' };
  }
  if (!isNonEmptyString(parsed.summary)) {
    return { ok: false, reason: 'summary must be a non-empty string.' };
  }
  if (!isRecord(parsed.technicalProjects)) {
    return { ok: false, reason: 'technicalProjects must be an object.' };
  }

  const gestallt = validateStringArray(parsed.technicalProjects.gestallt, 'technicalProjects.gestallt', 2);
  if (!gestallt.ok) return gestallt;
  const coverpro = validateStringArray(parsed.technicalProjects.coverpro, 'technicalProjects.coverpro', 1);
  if (!coverpro.ok) return coverpro;
  const traverse = validateStringArray(parsed.technicalProjects.traverse, 'technicalProjects.traverse', 1);
  if (!traverse.ok) return traverse;
  const independent = validateStringArray(parsed.independentConsultingExperience, 'independentConsultingExperience', 2);
  if (!independent.ok) return independent;
  const focusDigital = validateStringArray(parsed.focusDigitalExperience, 'focusDigitalExperience', 3);
  if (!focusDigital.ok) return focusDigital;
  const learMarketing = validateStringArray(parsed.learMarketingExperience, 'learMarketingExperience', 1);
  if (!learMarketing.ok) return learMarketing;
  const coverLetter = validateCoverLetter(parsed.warCoverLetter);
  if (!coverLetter.ok) return coverLetter;

  return {
    ok: true,
    value: {
      mode: 'pmm',
      title: parsed.title.trim(),
      summary: parsed.summary.trim(),
      technicalProjects: {
        gestallt: gestallt.value,
        coverpro: coverpro.value,
        traverse: traverse.value,
      },
      independentConsultingExperience: independent.value,
      focusDigitalExperience: focusDigital.value,
      learMarketingExperience: learMarketing.value,
      warCoverLetter: coverLetter.value,
    },
  };
}

export function tryRenderStructuredPackage(
  rawText: string,
  mode: StructuredResumeMode,
): { markdown: string; package: StructuredPackage } | null {
  const parsed = tryParseJsonObject(rawText);
  if (!parsed) return null;

  const requestedMode = parsed.mode;
  if (requestedMode !== mode) {
    return null;
  }

  const validated = mode === 'content'
    ? validateStructuredContentPackage(parsed)
    : validateStructuredPmmPackage(parsed);

  if (!validated.ok) {
    return null;
  }

  return {
    package: validated.value,
    markdown: renderStructuredPackageToMarkdown(validated.value),
  };
}
