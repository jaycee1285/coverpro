import type { LintError, ResumeMode } from '$lib/types';
import { lintMarkdown } from '$lib/utils/linter';
import { parsePackage } from '$lib/utils/resume-parser';
import { normalizeSectionKey } from '$lib/utils/lint-field-keys';

export type RepairUnitKind = 'local' | 'line' | 'section' | 'coverLetter' | 'structure' | 'fallback';

export interface RepairUnit {
  kind: RepairUnitKind;
  targetKey: string;
  label: string;
  currentText: string;
  diagnostics: LintError[];
  preservedTargets: string[];
}

export interface RepairRouteResult {
  valid: boolean;
  units: RepairUnit[];
  errors: LintError[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function getTitleLine(markdown: string): string {
  return markdown.split('\n').find((line) => /^#\s+/.test(line)) || '';
}

function getCoverLetterSection(markdown: string): string {
  return markdown.match(/^## WAR Cover Letter\s*\n[\s\S]*?(?=^## |\s*$)/m)?.[0].trim() || '';
}

function getBulletLine(markdown: string, fieldKey: string): string {
  const [blockKey, kind, indexText] = fieldKey.split(':');
  if (kind !== 'bullet') return '';

  const bulletIndex = Number(indexText) - 1;
  if (Number.isNaN(bulletIndex)) return '';

  const pkg = parsePackage(markdown);
  const section = pkg.sections.find((candidate) => normalizeSectionKey(candidate.heading) === blockKey);
  const bullet = section?.bullets[bulletIndex];
  return bullet ? `- ${bullet.text}` : '';
}

function getSectionText(markdown: string, sectionKey: string): string {
  const normalized = sectionKey.replace(/^section:/, '');
  const pkg = parsePackage(markdown);
  const section = pkg.sections.find((candidate) => normalizeSectionKey(candidate.heading) === normalized);
  return section?.raw.trim() || '';
}

function getSectionLabel(sectionKey: string): string {
  return sectionKey
    .replace(/^section:/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function getErrorTargets(error: LintError): string[] {
  if (error.fieldKey) return [error.fieldKey];
  if (error.fieldKeys?.length) return error.fieldKeys;

  if (error.code === 'cover-letter-missing' || error.code?.startsWith('cover-letter-')) {
    return ['war-cover-letter:block'];
  }

  return [];
}

function classifyTarget(targetKey: string): RepairUnitKind {
  if (targetKey === 'title:block') return 'local';
  if (targetKey === 'war-cover-letter:block') return 'coverLetter';
  if (targetKey.includes(':bullet:')) return 'line';
  if (targetKey.startsWith('section:')) return 'section';
  return 'fallback';
}

function getTargetText(markdown: string, targetKey: string, kind: RepairUnitKind): string {
  if (targetKey === 'title:block') return getTitleLine(markdown);
  if (targetKey === 'war-cover-letter:block') return getCoverLetterSection(markdown);
  if (kind === 'line') return getBulletLine(markdown, targetKey);
  if (kind === 'section') return getSectionText(markdown, targetKey);
  return '';
}

function getTargetLabel(targetKey: string, kind: RepairUnitKind, diagnostics: LintError[]): string {
  const fieldLabel = diagnostics.find((error) => error.fieldLabel)?.fieldLabel;
  if (fieldLabel) return fieldLabel;
  if (targetKey === 'title:block') return 'Title';
  if (targetKey === 'war-cover-letter:block') return 'WAR Cover Letter';
  if (kind === 'section') return getSectionLabel(targetKey);
  return targetKey;
}

function collectPreservedTargets(units: RepairUnit[]): string[] {
  const mutable = new Set(units.map((unit) => unit.targetKey));
  for (const unit of units) {
    if (unit.kind === 'line' && unit.targetKey.includes(':bullet:')) {
      const sectionKey = unit.targetKey.split(':bullet:')[0];
      mutable.add(`section:${sectionKey}`);
    }
  }

  const canonical = [
    'title:block',
    'section:summary',
    'section:independent-consulting',
    'section:focus-digital',
    'section:first-page-sage',
    'section:lear-marketing',
    'section:technical-projects',
    'section:ebay',
    'section:earlier-experience',
    'war-cover-letter:block',
  ];

  return canonical.filter((target) => !mutable.has(target));
}

export function buildRepairRoute(markdown: string, mode: ResumeMode): RepairRouteResult {
  const lint = lintMarkdown(markdown, mode);
  const hardErrors = lint.errors.filter((error) => error.severity === 'error');
  const grouped = new Map<string, LintError[]>();
  const fallbackErrors: LintError[] = [];

  for (const error of hardErrors) {
    const targets = getErrorTargets(error);
    if (targets.length === 0) {
      fallbackErrors.push(error);
      continue;
    }

    for (const target of targets) {
      const existing = grouped.get(target) || [];
      existing.push(error);
      grouped.set(target, existing);
    }
  }

  const units: RepairUnit[] = Array.from(grouped.entries()).map(([targetKey, diagnostics]) => {
    const kind = classifyTarget(targetKey);
    return {
      kind,
      targetKey,
      label: getTargetLabel(targetKey, kind, diagnostics),
      currentText: getTargetText(markdown, targetKey, kind),
      diagnostics,
      preservedTargets: [],
    };
  });

  if (fallbackErrors.length > 0) {
    units.push({
      kind: 'fallback',
      targetKey: 'package:fallback',
      label: 'Unmapped package errors',
      currentText: '',
      diagnostics: fallbackErrors,
      preservedTargets: [],
    });
  }

  const preservedTargets = collectPreservedTargets(units);
  for (const unit of units) {
    unit.preservedTargets = unique(preservedTargets);
  }

  return {
    valid: lint.valid,
    units,
    errors: lint.errors,
  };
}
