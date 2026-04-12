---
id: generation-runner
kind: service
authority:
  - resume-knowledge-base
  - lint-gate
  - tauri-command-bridge
mutates:
  - app-store
  - run-storage
observes:
  - app-store
  - resume-knowledge-base
  - lint-gate
  - settings-surface
persists_to:
  - run-storage
  - rescue-artifacts
depends_on:
  - app-store
  - resume-knowledge-base
  - lint-gate
  - settings-surface
  - tauri-command-bridge
  - run-storage
staleness_risks:
  - stale-repair-draft
  - stale-platform-backend-choice
entrypoints:
  - app/src/lib/services/runner.ts
---

# Generation Runner

## Purpose
Owns job execution, concurrency control, backend fallback, repair gating, field-scoped repair merging, candidate-package admission, structured-response prompting for supported resume modes, per-job API cost accumulation, rescue dumps, and coordination between prompt building, linting, doc-wide Typst preflight, and persisted run state. It is the orchestration core of CoverPro.

## Scope of Touch
Safe to edit when changing:
- progress reporting
- concurrency limits
- repair-loop ergonomics
- candidate rejection/debug surfacing
- structured-output prompt staging for supported modes
- inline per-job cost accounting
- how paused checkpoints surface combined bullet-fit and doc-fit diagnostics

Risky to edit when changing:
- backend fallback policy
- pause/resume and accepted-draft semantics
- field-lock merge behavior
- candidate admission rules for current visible draft
- coordination between prompt generation, lint, and persistence
- scoped bullet-repair prompt contracts versus whole-package fallback behavior
- which Typst failures are promoted into runner-blocking errors before export

## Authority Notes
This node is authoritative for generation flow, repair orchestration, supported structured-output contracts, accumulated run cost surfaced to the UI, and whether a model response is allowed to attempt mutation of the visible draft state. It now also decides whether a draft can advance past a runner checkpoint when either Typst bullet measurement or doc-wide Typst preflight says the package is not yet fit. The runner consumes `appStore.selectedBackend` and `appStore.selectedModel` as execution input, so model validity must be enforced upstream by settings/catalog-to-picker synchronization. It is not authoritative for the factual knowledge base itself.

## Links
- [App Shell](app-shell.md)
- [App Store](app-store.md)
- [Resume Knowledge Base](resume-knowledge-base.md)
- [Lint Gate](lint-gate.md)
- [Tauri Command Bridge](tauri-command-bridge.md)
- [Run Storage](run-storage.md)
