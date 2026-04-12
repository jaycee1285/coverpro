---
id: tauri-command-bridge
kind: service
authority: []
mutates:
  - cli-processes
  - filesystem-artifacts
observes:
  - cli-processes
  - filesystem-artifacts
persists_to:
  - filesystem-artifacts
depends_on: []
staleness_risks:
  - stale-build-artifact
  - stuck-cli-process
entrypoints:
  - app/src-tauri/src/lib.rs
  - app/src-tauri/src/main.rs
  - app/src-tauri/src/theme.rs
---

# Tauri Command Bridge

## Purpose
Bridges the frontend to local process execution, file writing, process cancellation, and platform-specific capabilities. It is the native side-effect boundary for CoverPro. It now also owns the Typst preflight query/compile sequence that decides whether export produces PDFs or returns structured layout failures.

## Scope of Touch
Safe to edit when changing:
- command wrappers
- process tracking
- native helper behavior
- Typst preflight/query orchestration

Risky to edit when changing:
- cancellation semantics
- backend CLI invocation rules
- file-write guarantees used by the runner and export flow
- the contract between native export results and frontend preflight handling

## Authority Notes
This node is authoritative for native execution and filesystem side effects. The frontend relies on it for any real work beyond browser-only state, including whether a Typst export attempt becomes written files or structured preflight failures.

## Links
- [Generation Runner](generation-runner.md)
- [Run Storage](run-storage.md)
- [Settings Surface](settings-surface.md)
- [Export and Parse Boundary](export-and-parse-boundary.md)
