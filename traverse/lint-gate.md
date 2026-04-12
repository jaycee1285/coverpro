---
id: lint-gate
kind: contract
authority: []
mutates: []
observes:
  - resume-knowledge-base
persists_to: null
depends_on:
  - resume-knowledge-base
staleness_risks:
  - stale-fact-locks
  - stale-section-rules
entrypoints:
  - app/src/lib/utils/linter.ts
  - forbidden-section-matrix.md
---

# Lint Gate

## Purpose
Validates generated markdown against locked facts, section structure, bullet counts, employer boundaries, project allowlists, and cover-letter style rules. It now also emits field-level failure identity used by the runner to localize repair and preserve passing content.

## Scope of Touch
Safe to edit when changing:
- warning wording
- section-count rules
- style checks
- field-level lint metadata

Risky to edit when changing:
- immutable fact validation
- experience bleed detection
- mode-specific structural constraints
- field identity stability used by scoped repair

## Authority Notes
This node is authoritative for whether output passes CoverPro’s hard constraints and which individual fields are failing those constraints. It derives many of those constraints from the resume knowledge base.

## Links
- [Generation Runner](generation-runner.md)
- [Resume Knowledge Base](resume-knowledge-base.md)
- [Export and Parse Boundary](export-and-parse-boundary.md)
- [Authority Index](authority-index.md)
