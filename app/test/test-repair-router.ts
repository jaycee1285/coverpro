import { readFileSync } from 'fs';
import { join } from 'path';
import { buildRepairRoute, type RepairUnitKind } from '../src/lib/utils/repair-router';
import type { ResumeMode } from '../src/lib/types';

interface FixtureExpectation {
  file: string;
  mode: ResumeMode;
  expectedUnit: {
    kind: RepairUnitKind;
    targetKey: string;
  };
  mustPreserve: string[];
  mustNotRouteToFallback?: boolean;
}

const fixtures: FixtureExpectation[] = [
  {
    file: 'summary-selected-angle.md',
    mode: 'content',
    expectedUnit: { kind: 'line', targetKey: 'summary:bullet:1' },
    mustPreserve: ['war-cover-letter:block', 'section:focus-digital'],
    mustNotRouteToFallback: true,
  },
  {
    file: 'focus-missing-metrics.md',
    mode: 'content',
    expectedUnit: { kind: 'section', targetKey: 'section:focus-digital' },
    mustPreserve: ['war-cover-letter:block', 'section:lear-marketing'],
    mustNotRouteToFallback: true,
  },
  {
    file: 'cover-letter-em-dash.md',
    mode: 'content',
    expectedUnit: { kind: 'coverLetter', targetKey: 'war-cover-letter:block' },
    mustPreserve: ['section:focus-digital', 'section:lear-marketing'],
    mustNotRouteToFallback: true,
  },
];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function loadFixture(file: string): string {
  return readFileSync(join(__dirname, 'fixtures', 'repair', file), 'utf-8');
}

let passed = 0;

for (const fixture of fixtures) {
  const markdown = loadFixture(fixture.file);
  const route = buildRepairRoute(markdown, fixture.mode);
  const unit = route.units.find((candidate) => candidate.targetKey === fixture.expectedUnit.targetKey);

  console.log(`\n=== ${fixture.file} ===`);
  console.log(`valid: ${route.valid}`);
  console.log(`units: ${route.units.map((candidate) => `${candidate.kind}:${candidate.targetKey}`).join(', ') || '(none)'}`);

  assert(unit !== undefined, `Expected repair unit ${fixture.expectedUnit.targetKey}`);
  assert(unit.kind === fixture.expectedUnit.kind, `Expected ${fixture.expectedUnit.kind}, got ${unit.kind}`);
  assert(unit.currentText.trim().length > 0, `Expected currentText for ${unit.targetKey}`);

  for (const target of fixture.mustPreserve) {
    assert(unit.preservedTargets.includes(target), `Expected ${target} to be preserved for ${fixture.file}`);
  }

  if (fixture.mustNotRouteToFallback) {
    assert(!route.units.some((candidate) => candidate.kind === 'fallback'), `Unexpected fallback route for ${fixture.file}`);
  }

  console.log(`target: ${unit.label}`);
  console.log(`diagnostics: ${unit.diagnostics.map((error) => error.code || error.message).join(', ')}`);
  console.log(`preserves: ${unit.preservedTargets.join(', ')}`);
  passed++;
}

console.log(`\nRepair router smoke passed: ${passed}/${fixtures.length} fixtures.`);
