---
id: resume-knowledge-base
kind: knowledge-base
authority: []
mutates: []
observes: []
persists_to: null
depends_on: []
staleness_risks:
  - stale-experience-data
  - stale-model-catalog
entrypoints:
  - app/src/lib/config/resume-data.ts
  - app/src/lib/config/models.ts
  - app/src/lib/config/resume-data.ts
---

# Resume Knowledge Base

## Purpose
Holds the structured source material for generation: experience data, positioning angles, role-fit signals, model catalogs, constraints, and project facts. It is the canonical narrative/fact base the runner and linter both depend on.

## Scope of Touch
Safe to edit when changing:
- allowed project lists
- role-fit and positioning metadata
- model catalog defaults

Risky to edit when changing:
- factual source data
- employer-specific constraints
- metrics and guardrails the linter treats as truth

## Authority Notes
This node is authoritative for structured generation inputs and factual reference material inside the app. If it drifts, both prompting and linting drift together.

## Links
- [Generation Runner](generation-runner.md)
- [Lint Gate](lint-gate.md)
- [Kickstart Legacy Context](kickstart-legacy-context.md)
