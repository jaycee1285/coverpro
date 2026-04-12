#!/usr/bin/env bun

import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);

if (args.length < 1 || args.includes('--help')) {
  console.error('Usage: bun scripts/debug-export.mjs /path/to/package.md');
  process.exit(args.includes('--help') ? 0 : 1);
}

const packagePath = resolve(args[0]);
const markdown = readFileSync(packagePath, 'utf8');

const { extractExportFields, buildExportData } = await import('../src/lib/utils/pdf-export.ts');

const tempRoot = mkdtempSync(join(tmpdir(), 'coverpro-export-debug-'));
const outputDir = join(tempRoot, 'out');
mkdirSync(outputDir, { recursive: true });

const dataPath = join(tempRoot, 'export-data.json');
const resumeTemplatePath = join(tempRoot, 'resume.typ');
const coverLetterTemplatePath = join(tempRoot, 'cover-letter.typ');
const resumePdfPath = join(outputDir, 'resume.pdf');
const coverLetterPdfPath = join(outputDir, 'cover-letter.pdf');

const fields = extractExportFields(markdown, '');
const exportData = buildExportData(fields);

writeFileSync(dataPath, JSON.stringify(exportData, null, 2));
writeFileSync(resumeTemplatePath, readFileSync(new URL('../src-tauri/templates/resume.typ', import.meta.url), 'utf8'));
writeFileSync(coverLetterTemplatePath, readFileSync(new URL('../src-tauri/templates/cover-letter.typ', import.meta.url), 'utf8'));

function run(command, runArgs) {
  const proc = Bun.spawnSync([command, ...runArgs], {
    cwd: tempRoot,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      TYPST_FONT_PATHS: process.env.TYPST_FONT_PATHS || '/etc/profiles/per-user/john/share/fonts:/home/john/.local/share/fonts:/run/current-system/sw/share/fonts',
    },
  });

  return {
    ok: proc.exitCode === 0,
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

function logSection(title, value) {
  console.log(`\n=== ${title} ===`);
  console.log(value);
}

console.log(`Package: ${packagePath}`);
console.log(`Temp root: ${tempRoot}`);
console.log(`Output dir: ${outputDir}`);

logSection('Extracted fields', JSON.stringify(fields, null, 2));

const commonArgs = ['--root', '/', '--input', `data=${dataPath}`];

const preflight = run('typst', [
  'query',
  resumeTemplatePath,
  '<coverpro-preflight>',
  '--format',
  'json',
  ...commonArgs,
]);
logSection('Resume preflight exit', String(preflight.exitCode));
logSection('Resume preflight stdout', preflight.stdout || '(empty)');
logSection('Resume preflight stderr', preflight.stderr || '(empty)');

const resumeCompile = run('typst', [
  'compile',
  resumeTemplatePath,
  resumePdfPath,
  ...commonArgs,
]);
logSection('Resume compile exit', String(resumeCompile.exitCode));
logSection('Resume compile stdout', resumeCompile.stdout || '(empty)');
logSection('Resume compile stderr', resumeCompile.stderr || '(empty)');
console.log(`Resume PDF exists: ${existsSync(resumePdfPath)}`);

const coverLetterCompile = run('typst', [
  'compile',
  coverLetterTemplatePath,
  coverLetterPdfPath,
  ...commonArgs,
]);
logSection('Cover letter compile exit', String(coverLetterCompile.exitCode));
logSection('Cover letter compile stdout', coverLetterCompile.stdout || '(empty)');
logSection('Cover letter compile stderr', coverLetterCompile.stderr || '(empty)');
console.log(`Cover letter PDF exists: ${existsSync(coverLetterPdfPath)}`);

if (process.argv.includes('--keep-temp')) {
  console.log(`Keeping temp root: ${tempRoot}`);
} else {
  rmSync(tempRoot, { recursive: true, force: true });
}
