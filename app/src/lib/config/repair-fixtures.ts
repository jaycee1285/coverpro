import type { ResumeMode } from '$lib/types';
import summarySelectedAngle from '../../../test/fixtures/repair/summary-selected-angle.md?raw';
import focusMissingMetrics from '../../../test/fixtures/repair/focus-missing-metrics.md?raw';
import coverLetterEmDash from '../../../test/fixtures/repair/cover-letter-em-dash.md?raw';

export interface RepairFixture {
  id: string;
  label: string;
  mode: ResumeMode;
  markdown: string;
}

export const REPAIR_FIXTURES: RepairFixture[] = [
  {
    id: 'summary-selected-angle',
    label: 'Summary:selectedAngle',
    mode: 'content',
    markdown: summarySelectedAngle,
  },
  {
    id: 'focus-missing-metrics',
    label: 'FocusDigital:missingMetric',
    mode: 'content',
    markdown: focusMissingMetrics,
  },
  {
    id: 'cover-letter-em-dash',
    label: 'CoverLetter:emDash',
    mode: 'content',
    markdown: coverLetterEmDash,
  },
];
