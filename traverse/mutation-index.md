---
id: mutation-index
kind: index
authority: []
mutates: []
observes:
  - generation-runner
  - run-storage
  - settings-surface
  - tauri-command-bridge
  - app-shell
persists_to: null
depends_on:
  - generation-runner
  - run-storage
  - settings-surface
  - tauri-command-bridge
  - app-shell
staleness_risks: []
entrypoints:
  - traverse/generation-runner.md
  - traverse/run-storage.md
  - traverse/settings-surface.md
  - traverse/tauri-command-bridge.md
  - traverse/app-shell.md
---

# Mutation Index

## Purpose
Shows which nodes actually change important state or durable artifacts in CoverPro.

## Mutation Groups
- Generation and repair mutation: [Generation Runner](generation-runner.md)
- Run artifact mutation: [Run Storage](run-storage.md)
- Settings and key mutation: [Settings Surface](settings-surface.md)
- Native process/file mutation: [Tauri Command Bridge](tauri-command-bridge.md)
- UI-level session mutation: [App Shell](app-shell.md)

## Links
- [Authority Index](authority-index.md)
- [Feature Index](feature-index.md)
