#!/usr/bin/env bun

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const TEMPLATE_PATH = new URL('../src-tauri/templates/resume.typ', import.meta.url);
const templateSource = readFileSync(TEMPLATE_PATH, 'utf8');
const tempRoot = mkdtempSync(join(tmpdir(), 'coverpro-typst-probe-'));

const FONT_RUNS = [
  { id: 'stack', label: 'Nacelle -> Mulish stack', fontExpr: '("Nacelle", "Mulish")' },
  { id: 'nacelle', label: 'Nacelle only', fontExpr: '("Nacelle")' },
  { id: 'mulish', label: 'Mulish only', fontExpr: '("Mulish")' },
];

const SECTION_SPECS = [
  { id: 'summary', label: 'Summary', kind: 'summary', count: 1 },
  { id: 'labDemand', label: 'Independent Consulting', kind: 'bullets', count: 2 },
  { id: 'focusDigital', label: 'Focus Digital', kind: 'bullets', count: 5 },
  { id: 'firstPageSage', label: 'First Page Sage', kind: 'bullets', count: 3 },
  { id: 'learMarketing', label: 'Lear Marketing', kind: 'bullets', count: 3 },
  { id: 'gestallt', label: 'Gestallt', kind: 'bullets', count: 2 },
  { id: 'coverpro', label: 'CoverPro', kind: 'bullets', count: 2 },
  { id: 'traverse', label: 'Traverse', kind: 'bullets', count: 1 },
  { id: 'daylight', label: 'DayLight', kind: 'bullets', count: 1 },
  { id: 'ebay', label: 'eBay', kind: 'bullets', count: 3 },
];

const PACKED_MODE_SPECS = [
  {
    id: 'pm',
    label: 'PM packed',
    counts: {
      labDemand: 1,
      focusDigital: 2,
      learMarketing: 1,
      gestallt: 3,
      coverpro: 2,
      daylight: 1,
      traverse: 1,
    },
  },
  {
    id: 'content-tech',
    label: 'Content packed (tech)',
    counts: {
      labDemand: 1,
      focusDigital: 5,
      firstPageSage: 3,
      learMarketing: 3,
      gestallt: 2,
    },
  },
  {
    id: 'content-ebay',
    label: 'Content packed (eBay)',
    counts: {
      labDemand: 1,
      focusDigital: 5,
      firstPageSage: 3,
      learMarketing: 3,
      ebay: 3,
    },
  },
  {
    id: 'fme',
    label: 'FME packed',
    counts: {
      labDemand: 2,
      focusDigital: 3,
      learMarketing: 1,
      gestallt: 2,
      coverpro: 1,
    },
  },
  {
    id: 'pmm',
    label: 'PMM packed',
    counts: {
      labDemand: 2,
      focusDigital: 3,
      learMarketing: 1,
      gestallt: 2,
      coverpro: 1,
      traverse: 1,
    },
  },
];

const DEFAULT_OPTIONS = {
  minLength: 80,
  maxLength: 95,
  sampleProfile: 'wide',
};

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--min') options.minLength = Number(argv[++i]);
    else if (arg === '--max') options.maxLength = Number(argv[++i]);
    else if (arg === '--profile') options.sampleProfile = argv[++i] ?? DEFAULT_OPTIONS.sampleProfile;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.minLength) || !Number.isInteger(options.maxLength)) {
    throw new Error('`--min` and `--max` must be integers.');
  }
  if (options.minLength < 1 || options.maxLength < options.minLength) {
    throw new Error('Length range is invalid.');
  }

  return options;
}

function usage() {
  return [
    'Usage: bun scripts/probe-typst-budgets.mjs [--min 80] [--max 95] [--profile wide|balanced]',
    '',
    'Runs the real resume Typst template against synthetic exact-length content',
    'for the current stack, Nacelle-only, and Mulish-only font configurations.',
  ].join('\n');
}

function run(command, args, options = {}) {
  const executable = process.env[`${command.toUpperCase()}_BIN`] || command;
  let result;
  try {
    result = Bun.spawnSync([executable, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: options.cwd,
      env: options.env ?? process.env,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Executable not found: ${executable}. Run this probe inside \`nix develop\`, or set ${command.toUpperCase()}_BIN if you want to override it.`,
      );
    }
    throw error;
  }

  return {
    success: result.exitCode === 0,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

function detectFontDirectories() {
  const fonts = ['Nacelle', 'Mulish'];
  const dirs = new Set();

  for (const fontName of fonts) {
    const result = run('fc-match', ['-v', fontName]);
    if (!result.success) {
      throw new Error(`fc-match failed for ${fontName}: ${result.stderr.trim()}`);
    }

    const match = result.stdout.match(/file:\s+"([^"]+)"/);
    if (!match) {
      throw new Error(`Could not resolve font file for ${fontName}.`);
    }

    dirs.add(dirname(match[1]));
  }

  return Array.from(dirs);
}

function buildTemplate(fontExpr) {
  const needle = 'font: ("Nacelle", "Mulish"),';
  if (!templateSource.includes(needle)) {
    throw new Error('Resume template font declaration changed; probe needs an update.');
  }
  return templateSource.replace(needle, `font: ${fontExpr},`);
}

function makeExactLengthText(targetLength, profile) {
  const bases = {
    wide: 'Mapped workflows, wrote growth programs, and built measured systems with clear momentum.',
    balanced: 'Built content systems, launch assets, and reporting loops that moved pipeline and clarity.',
  };
  const base = bases[profile] ?? bases.wide;
  const fillerWords = profile === 'balanced'
    ? ['Launches', 'assets', 'roadmaps', 'metrics', 'ops', 'clarity', 'wins']
    : ['Workflow', 'momentum', 'mapping', 'systems', 'measured', 'growth', 'wins'];

  let text = base;
  let index = 0;
  while (text.length < targetLength - 1) {
    text += ` ${fillerWords[index % fillerWords.length].toLowerCase()}`;
    index += 1;
  }

  text = text.slice(0, targetLength);
  text = text.replace(/[ ,;:-]+$/g, '');
  if (!text.endsWith('.')) {
    if (text.length === targetLength) {
      text = `${text.slice(0, targetLength - 1)}.`;
    } else {
      text += '.';
    }
  }

  if (text.length !== targetLength) {
    if (text.length > targetLength) {
      text = `${text.slice(0, targetLength - 1)}.`;
    } else {
      text = `${text.slice(0, targetLength - 1).padEnd(targetLength - 1, 'x')}.`;
    }
  }

  return text;
}

function buildBaseData() {
  return {
    jobTitle: 'Typst Budget Probe',
    summary: 'Built measured content systems and product messaging that fit tight resume constraints cleanly.',
    experience: {
      labDemand: [],
      focusDigital: [],
      firstPageSage: [],
      learMarketing: [],
      gestallt: [],
      coverpro: [],
      daylight: [],
      traverse: [],
      ebay: [],
      earlierExperience: 'Earlier: Product Copywriter, Toyota (via agency) | Lead Content Strategist, eBay | Content Writer, Brafton',
    },
    coverLetter: [],
  };
}

function buildScenarioData(sectionSpec, targetLength, sampleProfile) {
  const data = buildBaseData();
  const text = makeExactLengthText(targetLength, sampleProfile);

  if (sectionSpec.kind === 'summary') {
    data.summary = text;
  } else {
    data.experience[sectionSpec.id] = Array.from({ length: sectionSpec.count }, () => text);
  }

  return { data, text };
}

function buildPackedModeData(modeSpec, targetLength, sampleProfile) {
  const data = buildBaseData();
  const text = makeExactLengthText(targetLength, sampleProfile);
  data.summary = makeExactLengthText(Math.min(Math.max(targetLength, 80), 95), sampleProfile);

  for (const [field, count] of Object.entries(modeSpec.counts)) {
    data.experience[field] = Array.from({ length: count }, () => text);
  }

  return { data, text };
}

function queryTemplate(templatePath, dataPath, fontPaths) {
  const result = run(
    'typst',
    ['query', templatePath, '<coverpro-preflight>', '--format', 'json', '--root', '/', '--input', `data=${dataPath}`, ...fontPaths.flatMap((path) => ['--font-path', path])],
    { env: { ...process.env, TYPST_FONT_PATHS: fontPaths.join(':') } },
  );

  if (!result.success) {
    return {
      ok: false,
      error: result.stderr.trim() || result.stdout.trim() || `typst exited with ${result.exitCode}`,
    };
  }

  try {
    const items = JSON.parse(result.stdout);
    const value = items.find((item) => item.func === 'metadata')?.value;
    if (!value) {
      return { ok: false, error: 'Typst query output did not include metadata.' };
    }

    const totalHeight = parseTypstLength(value.totalSize?.height);
    const availableHeight = parseTypstLength(value.availableHeight);
    const pageCount = value.pageCount ?? 0;
    const targetPageCount = value.targetPageCount ?? 1;
    const overflowPt = totalHeight !== null && availableHeight !== null ? totalHeight - availableHeight : null;

    return {
      ok: true,
      value: {
        pageCount,
        targetPageCount,
        totalHeight,
        availableHeight,
        overflowPt,
        passes: pageCount <= targetPageCount && (overflowPt === null || overflowPt <= 0),
      },
    };
  } catch (error) {
    return { ok: false, error: `Failed to parse Typst query JSON: ${String(error)}` };
  }
}

function parseTypstLength(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const units = [
    ['pt', 1],
    ['in', 72],
    ['cm', 72 / 2.54],
    ['mm', 72 / 25.4],
  ];

  for (const [suffix, factor] of units) {
    if (trimmed.endsWith(suffix)) {
      const value = Number(trimmed.slice(0, -suffix.length).trim());
      return Number.isFinite(value) ? value * factor : null;
    }
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function summarizeOutcomes(outcomes) {
  const passes = outcomes.filter((outcome) => outcome.ok && outcome.value.passes);
  const fails = outcomes.filter((outcome) => !outcome.ok || !outcome.value.passes);
  const highestPassing = passes.at(-1)?.length ?? null;
  const firstFailing = fails[0]?.length ?? null;
  return { highestPassing, firstFailing };
}

function formatProbeLine(fontRun, sectionSpec, outcomes) {
  const summary = summarizeOutcomes(outcomes);
  const parts = outcomes.map((outcome) => {
    if (!outcome.ok) {
      return `${outcome.length}:ERR`;
    }

    const overflow = outcome.value.overflowPt;
    const overflowLabel = overflow === null ? 'n/a' : `${overflow.toFixed(1)}pt`;
    return `${outcome.length}:${outcome.value.passes ? 'PASS' : 'FAIL'}(${outcome.value.pageCount}p, ${overflowLabel})`;
  });

  const threshold = `max-pass=${summary.highestPassing ?? 'none'}, first-fail=${summary.firstFailing ?? 'none'}`;
  return `${fontRun.label} | ${sectionSpec.label.padEnd(23, ' ')} | ${threshold} | ${parts.join('  ')}`;
}

function formatPackedModeLine(fontRun, modeSpec, outcomes) {
  const summary = summarizeOutcomes(outcomes);
  const parts = outcomes.map((outcome) => {
    if (!outcome.ok) {
      return `${outcome.length}:ERR`;
    }

    const overflow = outcome.value.overflowPt;
    const overflowLabel = overflow === null ? 'n/a' : `${overflow.toFixed(1)}pt`;
    return `${outcome.length}:${outcome.value.passes ? 'PASS' : 'FAIL'}(${outcome.value.pageCount}p, ${overflowLabel})`;
  });

  const threshold = `max-pass=${summary.highestPassing ?? 'none'}, first-fail=${summary.firstFailing ?? 'none'}`;
  return `${fontRun.label} | ${modeSpec.label.padEnd(23, ' ')} | ${threshold} | ${parts.join('  ')}`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const fontPaths = detectFontDirectories();
  console.log(`Using font paths: ${fontPaths.join(':')}`);
  console.log(`Probe lengths: ${options.minLength}-${options.maxLength}`);
  console.log(`Sample profile: ${options.sampleProfile}`);
  console.log('');

  for (const fontRun of FONT_RUNS) {
    const templatePath = join(tempRoot, `${fontRun.id}.typ`);
    writeFileSync(templatePath, buildTemplate(fontRun.fontExpr));

    console.log('Section isolation');
    for (const sectionSpec of SECTION_SPECS) {
      const outcomes = [];
      for (let length = options.minLength; length <= options.maxLength; length += 1) {
        const { data } = buildScenarioData(sectionSpec, length, options.sampleProfile);
        const dataPath = join(tempRoot, `${fontRun.id}-${sectionSpec.id}-${length}.json`);
        writeFileSync(dataPath, JSON.stringify(data));
        const result = queryTemplate(templatePath, dataPath, fontPaths);
        outcomes.push({ length, ...result });
      }

      console.log(formatProbeLine(fontRun, sectionSpec, outcomes));
    }

    console.log('');
    console.log('Packed full-resume scenarios');
    for (const modeSpec of PACKED_MODE_SPECS) {
      const outcomes = [];
      for (let length = options.minLength; length <= options.maxLength; length += 1) {
        const { data } = buildPackedModeData(modeSpec, length, options.sampleProfile);
        const dataPath = join(tempRoot, `${fontRun.id}-${modeSpec.id}-${length}.json`);
        writeFileSync(dataPath, JSON.stringify(data));
        const result = queryTemplate(templatePath, dataPath, fontPaths);
        outcomes.push({ length, ...result });
      }

      console.log(formatPackedModeLine(fontRun, modeSpec, outcomes));
    }

    console.log('');
  }
}

try {
  main();
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
