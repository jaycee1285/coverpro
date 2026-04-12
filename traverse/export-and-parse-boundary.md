---
id: export-and-parse-boundary
kind: persistence-boundary
authority:
  - lint-gate
mutates:
  - pdf-export-artifacts
  - clipboard-html
observes:
  - lint-gate
  - parsed-package
persists_to:
  - pdf-export-artifacts
  - clipboard-html
depends_on:
  - lint-gate
  - tauri-command-bridge
staleness_risks:
  - stale-parsed-package
  - stale-export-target
entrypoints:
  - app/src/lib/utils/resume-parser.ts
  - app/src/lib/utils/pdf-export.ts
  - app/src/lib/utils/markdown.ts
  - app/scripts/debug-export.mjs
---

# Export and Parse Boundary

## Purpose
Parses deterministic markdown into structured sections, converts markdown to clipboard HTML, and produces PDF-ready export artifacts. It now also treats the cover letter as one editable human-facing block before re-splitting on blank lines for Typst export, consumes structured Typst preflight metadata, and exposes the same combined doc-fit plus bullet-fit diagnostic surface used by export fit checks and rescued-package probes. It is the final formatting/output boundary after lint-passing content exists.

## Scope of Touch
Safe to edit when changing:
- markdown parsing rules
- clipboard HTML conversion
- export formatting
- cover-letter block editing behavior before PDF export
- export-side interpretation of Typst preflight metadata
- direct debug/probe scripts for rescued package export reproduction

Risky to edit when changing:
- assumptions about deterministic section structure
- mapping between linted markdown and parsed sections
- PDF/clipboard fidelity guarantees
- blank-line semantics between editable cover-letter text and Typst paragraph emission
- the shape of machine-readable preflight failures returned to the UI
- response-shape assumptions between Tauri camelCase payloads and frontend export success handling

## Authority Notes
This node is authoritative for post-lint interpretation and export formatting, including the human-editable cover-letter block used before Typst export, the frontend-facing interpretation of Typst preflight failure payloads, and the direct rescued-package export probe used when UI interpretation becomes suspect. It is not authoritative for generation truth itself.

## Links
- [Lint Gate](lint-gate.md)
- [Generation Runner](generation-runner.md)
- [Tauri Command Bridge](tauri-command-bridge.md)
