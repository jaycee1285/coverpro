# Human Smoke - 2026-04-08

## Command

```sh
cd /home/john/repos/coverpro
nix develop -c bash -lc 'cd app && bun run tauri dev'
```

## What Changed In This Pass

- OpenCode backend support was removed from frontend/backend bridge paths to reduce broken model surface area.
- OpenRouter model selection moved to a manual-model-ID-first workflow with persisted settings.
- OpenRouter no longer silently re-injects stale fallback models when manual/discovered models are available.
- Settings save now emits a model-catalog refresh signal so the input-screen picker updates immediately.
- Settings access was centralized to one always-visible floating gear plus keyboard shortcut, removing duplicate entry confusion.

## What John Observed

- "Okay, that worked. Awesome."
- "Perfect."

## Passed

- OpenCode is no longer present in backend selection surfaces.
- Updating OpenRouter models in Settings propagates to the input-screen model picker without stale free/deprecated entries.
- Runner-bound selected model now tracks updated picker/catalog state after settings changes.
- Settings access is available on desktop input view without resizing hacks.

## Failed Or Still Suspicious

- No new export/preflight-specific smoke was run in this pass; this smoke focused on model/settings UX and state sync.

## Current Gaps / Follow-Up Checks

- Capture one explicit stale-model regression artifact: save manual OpenRouter IDs, verify picker update, run generate, confirm selected model in run status.
- Continue shared budget manifest work so runner/linter/Typst layout budgeting is unified.
