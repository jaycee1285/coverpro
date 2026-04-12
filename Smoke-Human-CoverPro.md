# Manual Smoke Test (Human) - CoverPro

Status: PASS
Last updated: 2026-03-01
Source: user-confirmed in session (API-generated runs, import-repair flow, frozen-pause flow)

## Bounds

- Platform: Linux desktop (Tauri v2 + WebKitGTK)
- Scope: high-signal workflow maturity smoke
- Focus: input/generate/import → lint/repair → frozen pause/rescue → export → PDF
- Excludes: pipeline mode, agent-generated runs, dedicated Android/mobile packaging verification

## Conditions (Passed)

- [x] App launches with CSS rendering correctly
- [x] JD paste + job title + company populate input slots
- [x] Multi-job generation starts concurrently and cards update independently
- [x] Output renders with employer-tagged sections and char counts
- [x] Lint/repair lifecycle is visible through SAMOP-style debug state
- [x] Content mode preserves the eBay/Gestallt either-or slot invariant
- [x] Export view shows editable fields with char count validation
- [x] PDF export produces both resume and cover-letter files
- [x] Per-run markdown artifacts are written to `/tmp/coverpro/` with title/company/date/run/iteration/error metadata
- [x] Rescue snapshots can be written to `/tmp/coverpro/rescue/`
- [x] Import Repair accepts a valid saved package and jumps directly to export view
- [x] Import Repair rejects non-CoverPro markdown with a hard error instead of best-effort parsing
- [x] Frozen pause stops further runner mutation of the current item state
- [x] Frozen paused draft remains exportable and matches the visible state
- [x] Imported repair artifact can be taken to PDF export within a few clicks

## Ultimate Workflow Result

- [x] A job response or saved package can be turned into an exportable PDF application package in roughly three clicks

## Notes

- This project is use-case mature for the current single-user desktop workflow.
- The remaining work is packaging/distribution polish: mobile-first UX hardening, Nix flake streamlining, and delivery surfaces.
- This cleanup pass was specifically about stopping draft/cost leakage and making saved work recoverable.
