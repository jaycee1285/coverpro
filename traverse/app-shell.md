---
id: app-shell
kind: ui-surface
authority:
  - app-store
  - generation-runner
mutates:
  - app-store
  - generation-runner
observes:
  - app-store
  - import-contract
persists_to: null
depends_on:
  - app-store
  - generation-runner
  - import-contract
  - run-storage
staleness_risks:
  - stale-visible-draft
  - stale-model-picker-state
entrypoints:
  - app/src/routes/+page.svelte
  - app/src/lib/components/InputPanel.svelte
  - app/src/lib/components/OutputPanel.svelte
  - app/src/lib/components/ExportView.svelte
  - app/src/lib/components/QueueImport.svelte
  - app/src/lib/components/SettingsPanel.svelte
---

# App Shell

## Purpose
Owns the main CoverPro workflow surface: input slots, run/output views, export flow, repair pause/resume interaction, candidate rejection visibility, settings, and job import UI. It is the human-facing shell over the resume generation pipeline.

## Scope of Touch
Safe to edit when changing:
- layout and panel flow
- import/export UI
- pause/resume controls
- debug surfacing for rejected candidates
- settings entry-point visibility and shortcut affordances

Risky to edit when changing:
- how visible draft state relates to runner state
- currentDraft vs candidateDraft projection in the UI
- multi-job workflow assumptions
- what the user sees during repair, rescue, or export transitions
- model picker projection relative to persisted settings/catalog changes

## Authority Notes
This node is authoritative for visible interaction state only. It depends on the app store for state projection and the runner for actual generation progress. The visible draft should be treated as admitted state, not just the latest model response. For model selection, this shell must refresh visible picker state whenever settings mutate discovery/manual-model configuration.

## Links
- [App Store](app-store.md)
- [Generation Runner](generation-runner.md)
- [Import Contract](import-contract.md)
- [Run Storage](run-storage.md)
