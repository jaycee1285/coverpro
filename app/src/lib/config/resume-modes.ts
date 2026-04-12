import type { ResumeMode } from '$lib/types';

export interface ResumeModeDefinition {
  id: ResumeMode;
  shortLabel: string;
  label: string;
  description: string;
  expectedBulletCounts: Record<string, number>;
  eitherOrSections?: [string, string];
  focusDigitalRequirement?: {
    minimumMatches: number;
    labels: string[];
    forbidSeoFraming?: boolean;
    messaging: string;
  };
  repairGuidance: string[];
}

export const DEFAULT_RESUME_MODE: ResumeMode = 'pm';

export const RESUME_MODE_DEFINITIONS: ResumeModeDefinition[] = [
  {
    id: 'pm',
    shortLabel: 'PM',
    label: 'Product Manager',
    description: 'Technical projects first, 2 FD bullets with no SEO metrics, omits First Page Sage.',
    expectedBulletCounts: {
      'summary': 1,
      'independent consult': 1,
      'focus digital': 2,
      'lear marketing': 1,
      'technical projects': 7,
    },
    repairGuidance: [
      'Technical Projects are REQUIRED: Gestallt (3 bullets), CoverPro (2 bullets), DayLight/ContextMax (2 bullets).',
      'Focus Digital: EXACTLY 2 bullets, NO SEO metrics (631%, 366%, 241%, 14 leads, $25K).',
      'Lear Marketing: EXACTLY 1 bullet.',
      'Do NOT include First Page Sage.',
    ],
  },
  {
    id: 'content',
    shortLabel: 'Content',
    label: 'Content Strategist',
    description: 'Marketing experience first, 5 FD bullets with SEO metrics, includes First Page Sage.',
    expectedBulletCounts: {
      'summary': 1,
      'independent consult': 1,
      'focus digital': 5,
      'first page sage': 3,
      'lear marketing': 3,
      'technical projects': 2,
      'ebay': 3,
    },
    eitherOrSections: ['technical projects', 'ebay'],
    focusDigitalRequirement: {
      minimumMatches: 3,
      labels: ['631%', '366%', '241%', '14 leads', '$25K'],
      messaging: 'Focus Digital requires 3+ client-pinned metrics: 631%, 366%, 241%, 14 leads/qualified, $25K.',
    },
    repairGuidance: [
      'Include EITHER Technical Projects (Gestallt) OR eBay Experience, not both.',
      'Focus Digital must include at least 3 client-pinned metrics: 631%, 366%, 241%, 14 leads/qualified, $25K.',
      'First Page Sage is allowed in this mode.',
    ],
  },
  {
    id: 'fme',
    shortLabel: 'FME',
    label: 'Founding Marketing Engineer',
    description: 'labDemand centerpiece, 3 FD bullets with pipeline metrics, Gestallt + CoverPro, no ContextMax.',
    expectedBulletCounts: {
      'summary': 1,
      'independent consult': 2,
      'focus digital': 3,
      'lear marketing': 1,
      'technical projects': 3,
    },
    focusDigitalRequirement: {
      minimumMatches: 2,
      labels: ['14 qualified leads', '$25K', '3.5x', '2.4x'],
      forbidSeoFraming: true,
      messaging: 'FME Focus Digital requires 2+ pipeline metrics (14 leads, $25K, 3.5x, 2.4x) and must avoid SEO framing.',
    },
    repairGuidance: [
      'Independent Consulting (labDemand): EXACTLY 2 bullets. Founding marketing story.',
      'Focus Digital: EXACTLY 3 bullets. Include 2+ pipeline metrics (14 qualified leads, $25K, 3.5x, 2.4x).',
      'Do NOT use +631% impressions or +366% traffic; reframe for pipeline/funnel.',
      'Gestallt: EXACTLY 2 bullets. CoverPro: EXACTLY 1 bullet.',
      'Lear Marketing: EXACTLY 1 bullet.',
      'Do NOT include ContextMax, DayLight, or First Page Sage sections.',
    ],
  },
  {
    id: 'pmm',
    shortLabel: 'PMM',
    label: 'PMM (Developer Tools)',
    description: '4 project + 6 marketing bullets. Pipeline metrics + competitive positioning. No DayLight/OpenSwarm.',
    expectedBulletCounts: {
      'summary': 1,
      'independent consult': 2,
      'focus digital': 3,
      'lear marketing': 1,
      'technical projects': 4,
    },
    focusDigitalRequirement: {
      minimumMatches: 2,
      labels: ['14 qualified leads', '$25K', '2.4x', 'competitive positioning'],
      forbidSeoFraming: true,
      messaging: 'PMM Focus Digital requires 2+ pipeline/positioning signals and must avoid SEO framing.',
    },
    repairGuidance: [
      'Technical Projects: Gestallt (2 bullets), CoverPro (1 bullet), ContextMax (1 bullet) = 4 total.',
      'Independent Consulting (labDemand): EXACTLY 2 bullets.',
      'Focus Digital: EXACTLY 3 bullets. Include 2+ of 14 qualified leads, $25K, 2.4x, competitive positioning.',
      'Do NOT use +631% or +366%.',
      'Lear Marketing: EXACTLY 1 bullet.',
      'Do NOT include DayLight, OpenSwarm, or First Page Sage sections.',
    ],
  },
  {
    id: 'devrel',
    shortLabel: 'DevRel',
    label: 'Developer Advocate',
    description: 'OpenSwarm centerpiece, project-heavy. 1 FD bullet, no labDemand/First Page Sage.',
    expectedBulletCounts: {
      'summary': 1,
      'focus digital': 1,
      'lear marketing': 1,
      'technical projects': 7,
    },
    repairGuidance: [
      'Technical Projects: OpenSwarm (2 bullets), Gestallt (2 bullets), CoverPro (2 bullets), ContextMax (1 bullet) = 7 total.',
      'Focus Digital: EXACTLY 1 bullet.',
      'Lear Marketing: EXACTLY 1 bullet.',
      'Do NOT include labDemand or First Page Sage sections.',
    ],
  },
  {
    id: 'dxe',
    shortLabel: 'DXE',
    label: 'DX Engineer',
    description: 'ContextMax leads, DayLight for API design. No OpenSwarm/labDemand.',
    expectedBulletCounts: {
      'summary': 1,
      'focus digital': 1,
      'lear marketing': 1,
      'technical projects': 7,
    },
    repairGuidance: [
      'Technical Projects: ContextMax (2 bullets), Gestallt (2 bullets), CoverPro (2 bullets), DayLight (1 bullet) = 7 total.',
      'Focus Digital: EXACTLY 1 bullet.',
      'Lear Marketing: EXACTLY 1 bullet.',
      'Do NOT include OpenSwarm, labDemand, or First Page Sage sections.',
    ],
  },
  {
    id: 'isd',
    shortLabel: 'ISD',
    label: 'Internal Systems Developer',
    description: 'ContextMax 3 bullets, DayLight support, strongest positioning fit.',
    expectedBulletCounts: {
      'summary': 1,
      'focus digital': 1,
      'lear marketing': 1,
      'technical projects': 8,
    },
    repairGuidance: [
      'Technical Projects: ContextMax (3 bullets), Gestallt (2 bullets), CoverPro (2 bullets), DayLight (1 bullet) = 8 total.',
      'Focus Digital: EXACTLY 1 bullet.',
      'Lear Marketing: EXACTLY 1 bullet.',
      'Do NOT include OpenSwarm, labDemand, or First Page Sage sections.',
    ],
  },
  {
    id: 'fe',
    shortLabel: 'FE',
    label: 'Founding Engineer',
    description: '100% projects, zero marketing. DayLight leads with 3, plus OpenSwarm, Gestallt, CoverPro.',
    expectedBulletCounts: {
      'summary': 1,
      'independent consult': 1,
      'technical projects': 9,
    },
    repairGuidance: [
      'Technical Projects: DayLight (3 bullets), Gestallt (2 bullets), OpenSwarm (2 bullets), CoverPro (2 bullets) = 9 total.',
      'Independent Consulting (labDemand): EXACTLY 1 bullet.',
      'Do NOT include Focus Digital, Lear Marketing, ContextMax, or First Page Sage sections. 100% projects.',
    ],
  },
];

export const RESUME_MODE_MAP: Record<ResumeMode, ResumeModeDefinition> = Object.fromEntries(
  RESUME_MODE_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<ResumeMode, ResumeModeDefinition>;

export const RESUME_MODE_IDS = RESUME_MODE_DEFINITIONS.map((definition) => definition.id);
