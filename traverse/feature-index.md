---
id: feature-index
kind: index
authority: []
mutates: []
observes:
  - app-shell
  - app-store
  - generation-runner
  - lint-gate
  - resume-knowledge-base
  - run-storage
  - settings-surface
  - import-contract
  - export-and-parse-boundary
  - tauri-command-bridge
persists_to: null
depends_on:
  - app-shell
  - app-store
  - generation-runner
  - lint-gate
  - resume-knowledge-base
  - run-storage
  - settings-surface
  - import-contract
  - export-and-parse-boundary
  - tauri-command-bridge
staleness_risks: []
entrypoints:
  - traverse/app-shell.md
  - traverse/app-store.md
  - traverse/generation-runner.md
  - traverse/lint-gate.md
  - traverse/resume-knowledge-base.md
  - traverse/run-storage.md
  - traverse/settings-surface.md
  - traverse/import-contract.md
  - traverse/export-and-parse-boundary.md
  - traverse/tauri-command-bridge.md
---

# Feature Index

## Purpose
Groups the main architectural neighborhoods an agent is likely to care about when changing CoverPro.

## Workflow Neighborhoods
- Input and import path: [App Shell](app-shell.md), [App Store](app-store.md), [Import Contract](import-contract.md)
- Generation and repair path: [Generation Runner](generation-runner.md), [Resume Knowledge Base](resume-knowledge-base.md), [Lint Gate](lint-gate.md), [Tauri Command Bridge](tauri-command-bridge.md)
- Persistence and rerun path: [Run Storage](run-storage.md), [App Store](app-store.md), [Generation Runner](generation-runner.md)
- Export path: [Export and Parse Boundary](export-and-parse-boundary.md), [Lint Gate](lint-gate.md), [Tauri Command Bridge](tauri-command-bridge.md)
- Settings and provider path: [Settings Surface](settings-surface.md), [App Store](app-store.md), [Generation Runner](generation-runner.md)
- Model catalog sync path: [Settings Surface](settings-surface.md), [App Shell](app-shell.md), [App Store](app-store.md), [Generation Runner](generation-runner.md)

## Links
- [Authority Index](authority-index.md)
- [Mutation Index](mutation-index.md)
