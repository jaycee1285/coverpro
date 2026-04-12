---
id: authority-index
kind: index
authority: []
mutates: []
observes:
  - app-store
  - generation-runner
  - lint-gate
  - resume-knowledge-base
  - run-storage
  - settings-surface
  - tauri-command-bridge
persists_to: null
depends_on:
  - app-store
  - generation-runner
  - lint-gate
  - resume-knowledge-base
  - run-storage
  - settings-surface
  - tauri-command-bridge
staleness_risks: []
entrypoints:
  - traverse/app-store.md
  - traverse/generation-runner.md
  - traverse/lint-gate.md
  - traverse/resume-knowledge-base.md
  - traverse/run-storage.md
  - traverse/settings-surface.md
  - traverse/tauri-command-bridge.md
---

# Authority Index

## Purpose
Groups the main truth surfaces in CoverPro so later agents can separate frontend projection, generation orchestration, factual constraints, and durable artifacts.

## Authority Groups
- Frontend-local state truth: [App Store](app-store.md)
- Generation flow truth: [Generation Runner](generation-runner.md)
- Output acceptance truth: [Lint Gate](lint-gate.md)
- Structured resume fact/narrative truth: [Resume Knowledge Base](resume-knowledge-base.md)
- Durable run artifact truth: [Run Storage](run-storage.md)
- Durable settings/key truth: [Settings Surface](settings-surface.md)
- Native side-effect truth: [Tauri Command Bridge](tauri-command-bridge.md)

## Links
- [Mutation Index](mutation-index.md)
- [Feature Index](feature-index.md)
