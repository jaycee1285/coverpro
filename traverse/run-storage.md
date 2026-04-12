---
id: run-storage
kind: persistence-boundary
authority: []
mutates:
  - runs-directory
observes:
  - runs-directory
persists_to:
  - runs-directory
depends_on:
  - tauri-command-bridge
staleness_risks:
  - stale-run-index
  - memory-storage-fallback
entrypoints:
  - app/src/lib/utils/storage.ts
---

# Run Storage

## Purpose
Defines how run metadata, per-job markdown, and HTML artifacts are stored and retrieved. It is the durable artifact boundary for generated runs, even though the current frontend implementation still uses an in-memory placeholder for some paths.

## Scope of Touch
Safe to edit when changing:
- run labeling
- index-entry shape
- storage interface definitions

Risky to edit when changing:
- durable path assumptions
- compatibility between frontend storage contracts and Tauri file commands
- run/index coherence

## Authority Notes
This node is authoritative for where generated run artifacts are supposed to live and how they are addressed. The actual disk writes happen through the Tauri bridge.

## Links
- [Generation Runner](generation-runner.md)
- [Tauri Command Bridge](tauri-command-bridge.md)
- [App Store](app-store.md)
