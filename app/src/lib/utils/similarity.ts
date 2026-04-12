import type { LintError } from '$lib/types';

/**
 * Token-level Jaccard similarity between two strings.
 * Returns 0.0 (no overlap) to 1.0 (identical token sets).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalize(a));
  const tokensB = new Set(normalize(b));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/**
 * Normalize a string into lowercase tokens, stripping punctuation.
 */
function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Check generated bullets against all source bullet variants for an employer.
 * Returns lint errors for bullets that are too similar to source material.
 */
export function checkSimilarityToSource(
  blockName: string,
  generatedBullets: string[],
  sourceBullets: string[],
  errorThreshold = 0.80,
  warningThreshold = 0.65,
): LintError[] {
  const errors: LintError[] = [];

  for (const gen of generatedBullets) {
    let maxSim = 0;
    let closestSource = '';

    for (const src of sourceBullets) {
      const sim = jaccardSimilarity(gen, src);
      if (sim > maxSim) {
        maxSim = sim;
        closestSource = src;
      }
    }

    if (maxSim >= errorThreshold) {
      errors.push({
        block: blockName,
        message: `Too similar to source (${(maxSim * 100).toFixed(0)}%): "${gen.slice(0, 50)}..."`,
        severity: 'error',
      });
    } else if (maxSim >= warningThreshold) {
      errors.push({
        block: blockName,
        message: `Moderate similarity to source (${(maxSim * 100).toFixed(0)}%): "${gen.slice(0, 50)}..."`,
        severity: 'warning',
      });
    }
  }

  return errors;
}
