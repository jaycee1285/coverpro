---
id: settings-surface
kind: persistence-boundary
authority: []
mutates:
  - encrypted-settings-store
observes:
  - encrypted-settings-store
persists_to:
  - encrypted-settings-store
depends_on: []
staleness_risks:
  - stale-api-keys
  - stale-model-discovery-settings
  - stale-model-catalog-projection
entrypoints:
  - app/src/lib/utils/settings.ts
  - app/src/lib/components/SettingsPanel.svelte
  - app/src/lib/services/model-catalog.ts
---

# Settings Surface

## Purpose
Loads and saves API credentials, output directory, and model discovery settings through the Tauri store plugin. It is the durable configuration boundary for provider-backed generation and manual OpenRouter model IDs.

## Scope of Touch
Safe to edit when changing:
- validation behavior
- settings schema
- stored key names
- manual OpenRouter model ID list and manual-only toggle

Risky to edit when changing:
- API key precedence
- persisted output directory semantics
- provider validation and discovery filters
- how settings changes propagate to active UI model pickers

## Authority Notes
This node is authoritative for persisted generation settings and keys. Frontend defaults may derive from it, but they should not silently override it. Settings changes that affect model catalogs must trigger a refresh signal so input-surface pickers and runner-bound selected model stay synchronized.

## Links
- [App Store](app-store.md)
- [Generation Runner](generation-runner.md)
- [Tauri Command Bridge](tauri-command-bridge.md)
