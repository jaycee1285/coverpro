---
id: app-store
kind: store
authority: []
mutates: []
observes:
  - settings-surface
  - run-storage
persists_to:
  - local-storage-resume-mode
depends_on:
  - settings-surface
  - run-storage
staleness_risks:
  - stale-selected-run
  - stale-platform-defaults
  - stale-selected-model-binding
entrypoints:
  - app/src/lib/stores/app.svelte.ts
---

# App Store

## Purpose
Holds frontend state for runs, current selection, input slots, backend/model selection, pipeline mode, temperature, and current resume mode. It is the app's main reactive state surface.

## Scope of Touch
Safe to edit when changing:
- default frontend state
- current-run selection behavior
- backend/model selection persistence

Risky to edit when changing:
- initialization logic by platform
- job slot semantics
- mode selection and its relationship to generation
- selected backend/model relationship to dynamic catalog refreshes

## Authority Notes
This node is authoritative for frontend-local state and defaults. Durable run content and generated artifacts live elsewhere. `selectedModel` must remain valid for `selectedBackend` after dynamic catalog updates.

## Links
- [App Shell](app-shell.md)
- [Generation Runner](generation-runner.md)
- [Run Storage](run-storage.md)
- [Settings Surface](settings-surface.md)
