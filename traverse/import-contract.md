---
id: import-contract
kind: contract
authority: []
mutates:
  - app-store
observes:
  - batch-html-artifact
  - batch-markdown-artifact
persists_to:
  - batch-html-artifact
  - batch-markdown-artifact
depends_on:
  - app-store
staleness_risks:
  - stale-batch-schema
  - import-format-drift
entrypoints:
  - app/src/lib/components/QueueImport.svelte
  - JD-IMPORT-FORMAT.md
---

# Import Contract

## Purpose
Defines how external job batches from the LinkedIn extension and jobtriage pipeline are parsed into CoverPro’s four-slot input model. It is the contract boundary between upstream triage artifacts and local generation state.

## Scope of Touch
Safe to edit when changing:
- parser support for known batch formats
- slot-filling behavior
- import UI details

Risky to edit when changing:
- batch schema assumptions
- compatibility with jobtriage output
- mapping from imported jobs to app input slots

## Authority Notes
This node is authoritative for how imported jobs are interpreted locally. Upstream batch artifacts remain the source truth for the imported JD content itself.

## Links
- [App Shell](app-shell.md)
- [App Store](app-store.md)
- [Kickstart Legacy Context](kickstart-legacy-context.md)
