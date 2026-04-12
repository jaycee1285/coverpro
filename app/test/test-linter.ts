import { lintMarkdown } from '../src/lib/utils/linter';
import { readFileSync } from 'fs';
import { join } from 'path';

const markdown = readFileSync(join(__dirname, 'sample-output.md'), 'utf-8');

console.log('=== Testing Linter on Sample Output ===\n');
console.log('Input file: test/sample-output.md\n');

const result = lintMarkdown(markdown);

if (result.valid) {
  console.log('✓ PASSED - All lint checks passed!\n');
} else {
  console.log('✗ FAILED - Lint errors found:\n');
  for (const error of result.errors) {
    console.log(`  [${error.severity.toUpperCase()}] ${error.block}: ${error.message}`);
  }
}

// Also show bullet character counts for verification
console.log('\n=== Bullet Character Counts ===\n');

const lines = markdown.split('\n');
let currentSection = '';

for (const line of lines) {
  const headerMatch = line.match(/^## (.+)$/);
  if (headerMatch) {
    currentSection = headerMatch[1];
    continue;
  }

  const bulletMatch = line.match(/^- (.+)$/);
  if (bulletMatch && currentSection !== 'WAR Cover Letter') {
    const text = bulletMatch[1];
    const len = text.length;
    const status = len >= 80 && len <= 110 ? '✓' : '✗';
    const endsWithPeriod = text.endsWith('.') ? '✓' : '✗';
    console.log(`${status} [${len.toString().padStart(3)}] ${endsWithPeriod} ${currentSection}: "${text.slice(0, 50)}..."`);
  }
}
