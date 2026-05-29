# TASKBOARD WITH HUMAN SMOKE - CoverPro Rust GUI Translation

Date: 2026-04-26
Status: planning board for `/desktop` in-repo Rust GUI migration

## Goal

Translate the current Tauri/Svelte CoverPro workflow into an in-repo `/desktop` Rust GUI that uses `iced` with pinned `iced-shadcn` components, has no webview dependency, targets NixOS first, and preserves the API-first application package workflow.

Required first-run workflow:

1. Paste a job description.
2. Select an API provider, model, and job description/resume type.
3. Generate a package.
4. Accept the package or send it back for repair.
5. Edit individual resume lines and cover-letter content.
6. Generate Typst-based resume and cover-letter PDF copies.

## Smoke Philosophy

Generated job application packages are non-deterministic because they come from LLMs. Tests must not assume exact output text, exact bullet wording, exact section prose, or exact fit in tight boxes.

Verification should instead prove workflow invariants:

- The app stays usable while outputs vary.
- Bad or oversized outputs do not destroy the last usable draft.
- Repair and accept decisions are explicit.
- The edit view can absorb variable-length LLM content.
- Typst preflight/export failures are readable and recoverable.
- Human review decides whether writing quality is acceptable.
- Automated tests cover deterministic contracts: parsing, state transitions, provider request shaping, persistence, validation, and export error handling.

## Parallel Slice Rules

- Each slice below owns a distinct code area.
- Slices in the same wave can be implemented together without overlapping file ownership.
- Cross-slice integration happens only through explicit typed contracts.
- No slice edits pinned dependency crates directly.
- Human smoke is required at the end of each wave before the next wave is treated as complete.

## Proposed Workspace

```text
/desktop
  Cargo.toml
  flake.nix
  crates/
    coverpro-app/
    coverpro-core/
    coverpro-runner/
    coverpro-export/
    coverpro-storage/
    coverpro-shadcn/
  assets/
  templates/
  docs/
  TASKBOARD.md
```

## Wave 0 - Foundation Decisions

These are already decided and should be encoded in docs/config before implementation.

| Slice | Ownership | Tasks | Done State | Smoke Gate |
| --- | --- | --- | --- | --- |
| 0A Repo placement | `TASKBOARD-WITH-SMOKE.md`, `UI-FUNCTIONALITY-RUST-GUI-PLAN.md` | Keep `/desktop` inside this repo. Preserve existing reference docs. | Board states in-repo `/desktop` as the target. | Human confirms this repo remains the migration workspace. |
| 0B Dependency policy | `/desktop/Cargo.toml`, `/desktop/flake.nix` once created | Pin `iced`, `iced-shadcn`, `lucide-icons`, Rust toolchain, and Typst source. | No path requires editing dependency crates. | Human reviews `Cargo.toml`/flake and confirms dependencies are pinned. |
| 0C Design constraints | `coverpro-shadcn`, theme docs | Apply `design-basics.md`: GTK-semantic desktop tokens, Base16 origin, Spline font pairing, 8px base unit, explicit states. | Design rules are represented as named tokens and smoke checklist. | Human checks a static theme/state preview screen. |

## Wave 1 - Scaffold And Contracts

Can run in parallel after Wave 0.

### Slice 1A - Workspace Scaffold

Ownership:

- `/desktop/Cargo.toml`
- `/desktop/flake.nix`
- `/desktop/crates/coverpro-app/**`
- `/desktop/assets/**`

Tasks:

- Create the `/desktop` Cargo workspace.
- Add a minimal `iced` native window.
- Add Nix dev/build entry points.
- Add app icon/font asset placeholders.
- Add a blank route/state shell: Input, Results, Export, Settings.

Automated checks:

- `cargo check -p coverpro-app`
- `nix flake show`
- `nix build` or documented first scaffold build command.

Human smoke:

- Launch the desktop app on NixOS.
- Confirm no webview/WebKit window is involved.
- Confirm the app opens to an input work surface, not a landing page.
- Confirm keyboard focus can move through visible controls.

### Slice 1B - Core Domain Contracts

Ownership:

- `/desktop/crates/coverpro-core/**`

Tasks:

- Define resume modes/job description types.
- Define job input, generated package, package section, bullet, cover letter, lint issue, repair request, and run status types.
- Port deterministic package parsing/validation contracts from the Svelte/Tauri app.
- Encode candidate vs current-draft concepts.
- Add fixtures with valid and invalid package shapes.

Automated checks:

- Unit tests for valid package parsing.
- Unit tests for invalid candidate rejection.
- Unit tests that optional/either-or sections are admitted only when allowed.
- No tests assert exact LLM prose.

Human smoke:

- Load three sample markdown packages.
- Confirm valid packages parse into editable fields.
- Confirm malformed packages are rejected with readable reasons.

### Slice 1C - Theme Adapter

Ownership:

- `/desktop/crates/coverpro-shadcn/**`
- `/desktop/docs/theme-smoke.md`

Tasks:

- Wrap pinned `iced-shadcn` components behind local app-facing helpers.
- Map GTK-semantic tokens into `iced-shadcn` theme values.
- Add state styles: default, hover, focus, selected, disabled, dirty, success, warning, error, running, paused, complete.
- Add Spline Sans Mono/Spline Sans font loading or document the Nix font source.
- Add spacing constants: `space-1`, `space-2`, `space-3`, `space-5`, `space-8`.

Automated checks:

- `cargo check -p coverpro-shadcn`
- Unit/snapshot-style checks for token presence, not screenshots.

Human smoke:

- Open theme preview screen.
- Confirm hover and selected do not collapse visually.
- Confirm disabled, dirty, warning, error, success, running, paused, and complete states are distinguishable.
- Confirm UI text is readable at desktop density.

## Wave 2 - Backend And Persistence

Can run in parallel after Wave 1 contracts exist.

### Slice 2A - API Provider Runner

Ownership:

- `/desktop/crates/coverpro-runner/**`

Tasks:

- Implement Anthropic, OpenAI, and OpenRouter request/response adapters.
- Implement selected provider/model dispatch.
- Implement repair-loop dispatch using the same provider/model selection.
- Add usage/cost metadata fields when provider responses expose them.
- Implement cancellation boundaries using Tokio tasks and cancellation tokens.
- Keep CLI Claude/Codex support out of MVP.

Automated checks:

- Request-shaping tests using fake providers.
- Response parsing tests using recorded/fake response bodies.
- Cancellation tests with delayed fake provider.
- Concurrency test with several fake jobs completing independently.

Human smoke:

- With real API keys, submit one short job description.
- Confirm provider/model selection is honored.
- Confirm status changes from queued/running to package-ready or error.
- Confirm a provider error is displayed without freezing the app.

### Slice 2B - Storage And Settings

Ownership:

- `/desktop/crates/coverpro-storage/**`

Tasks:

- Persist selected provider/model/job type.
- Persist API keys or key references using a NixOS-appropriate storage strategy.
- Persist model discovery filters.
- Persist output directory.
- Persist lightweight app settings such as temperature.

Automated checks:

- Round-trip settings tests in temp directories.
- Missing/corrupt settings fallback tests.
- Key masking/display contract tests.

Human smoke:

- Enter API key/settings.
- Restart app.
- Confirm selected provider/model/type and output directory persist.
- Confirm secrets are not shown by default.

### Slice 2C - Typst Export Engine

Ownership:

- `/desktop/crates/coverpro-export/**`
- `/desktop/templates/**`

Tasks:

- Embed or provide Typst through the app/Nix environment.
- Port resume and cover-letter templates.
- Port preflight query data structures.
- Port bullet measurement data structures.
- Compile resume and cover-letter PDFs.
- Return structured preflight/export failures.

Automated checks:

- Export field extraction tests from deterministic sample packages.
- Preflight parser tests from recorded Typst metadata.
- Compile smoke with static fixture data.
- Failure parser tests for known Typst errors.

Human smoke:

- Export a static fixture package.
- Confirm two PDFs are produced.
- Confirm oversized content produces a readable preflight failure instead of a silent failure.

## Wave 3 - MVP UI Flow

Can run in parallel by screen ownership after Wave 1 and enough Wave 2 fake backends exist.

### Slice 3A - Input Screen

Ownership:

- `/desktop/crates/coverpro-app/src/screens/input/**`
- Input-related app messages/state only.

Tasks:

- Build paste-focused job description input.
- Build job title/company fields if required by current prompt assembly.
- Build provider picker.
- Build model picker.
- Build job description/resume type picker.
- Build temperature control if runner supports it.
- Build Generate action and disabled states.
- Show missing API key/provider setup errors.
- Defer imports.

Automated checks:

- State transition tests for input edits.
- Generate disabled/enabled tests.
- Provider/model/type selection tests.

Human smoke:

- Paste a real job description.
- Select provider/model/type.
- Confirm Generate becomes available only when required fields are present.
- Start generation and confirm the UI moves to running/results state.

### Slice 3B - Results And Repair Screen

Ownership:

- `/desktop/crates/coverpro-app/src/screens/results/**`
- Result card components.

Tasks:

- Show queued/running/error/package-ready states.
- Show elapsed status and cancellation affordance.
- Render structured generated package preview from `coverpro-core`.
- Expose Accept and Repair actions.
- Keep repair diagnostics collapsed unless blocking.
- Show provider/model/cost metadata when available.
- Preserve `currentDraft` when repair candidates fail validation.

Automated checks:

- State-machine tests for queued/running/package/error.
- Candidate rejection does not overwrite `currentDraft`.
- Accept transitions to export editing state.
- Repair request emits the correct typed command.

Human smoke:

- Generate a package with a real API provider.
- Confirm the package is readable even if writing quality varies.
- Trigger Repair once.
- Confirm the original usable draft remains visible until a valid repaired candidate is accepted.
- Accept a package and move to edit/export view.

### Slice 3C - Export Edit Screen

Ownership:

- `/desktop/crates/coverpro-app/src/screens/export/**`
- Export field components.

Tasks:

- Show editable fields for job title, summary, employer bullets, earlier experience, and cover letter.
- Use flexible text inputs that tolerate variable LLM output length.
- Show character counts as guidance, not hard boxes.
- Show dirty state after edits.
- Show stale Typst fit state after edits.
- Add Check Typst Fit and Generate PDFs actions.
- Show structured preflight failures.

Automated checks:

- Editing any field marks export dirty.
- Fit check clears stale state.
- Export blocked when summary or cover letter is missing.
- Variable-length fields do not panic or truncate data in state.

Human smoke:

- Accept a real generated package.
- Edit at least three resume lines and cover-letter text.
- Run Typst fit check.
- If it fails, confirm failure is readable and fields remain editable.
- Generate PDFs when fit/export permits.

### Slice 3D - Settings Dialog

Ownership:

- `/desktop/crates/coverpro-app/src/screens/settings/**`

Tasks:

- Build settings dialog or route.
- Add provider keys/key status.
- Add provider/model defaults.
- Add output directory.
- Add model discovery refresh controls where supported.
- Keep advanced filters progressively disclosed.

Automated checks:

- Settings update app state.
- Save and reload settings through `coverpro-storage` fake/temp backend.

Human smoke:

- Open settings with `Ctrl+,`.
- Save provider settings.
- Close/reopen settings and confirm values persist.
- Confirm advanced controls are not permanent chrome.

## Wave 4 - Concurrency And Multi-Job UI

Runs after single-job MVP flow is smoke-passing.

### Slice 4A - Multi-Job Input Slots

Ownership:

- `/desktop/crates/coverpro-app/src/screens/input/slots/**`

Tasks:

- Add four job slots.
- Add slot navigator.
- Preserve provider/model/type per run or define shared selection explicitly.
- Generate all non-empty slots.

Automated checks:

- Empty slots are skipped.
- Filled slots create distinct job commands.
- Slot edits do not overwrite other slots.

Human smoke:

- Fill two slots with different job descriptions.
- Generate both.
- Confirm both appear as independent result cards.

### Slice 4B - Concurrent Job Runtime UI

Ownership:

- `/desktop/crates/coverpro-app/src/screens/results/concurrency/**`
- May depend on `coverpro-runner`, but does not edit runner internals.

Tasks:

- Display independent status per job.
- Support cancel per job and cancel all.
- Keep cards independently updated as Tokio tasks complete.
- Do not serialize jobs unless provider limits require it.

Automated checks:

- Fake runner completes jobs out of order and UI state follows correctly.
- Per-job cancel affects only that job.
- Cancel all affects all active jobs.

Human smoke:

- Run two or more jobs concurrently with API provider.
- Confirm they update independently.
- Cancel one while another continues.
- Confirm completed package can still be accepted/exported.

## Wave 5 - Quality Rails And Recovery

Can be split after MVP exists.

### Slice 5A - Lint And Repair Gates

Ownership:

- `/desktop/crates/coverpro-core/src/lint/**`
- `/desktop/crates/coverpro-app/src/screens/results/diagnostics/**`

Tasks:

- Port deterministic lint rules.
- Attach issues to field identities where possible.
- Show lint and repair diagnostics.
- Keep human approval before repair mutates visible draft.

Automated checks:

- Lint fixture tests.
- Field-identity issue tests.
- Repair candidate merge tests.

Human smoke:

- Generate a package that has lint or fit problems.
- Confirm issues are readable.
- Confirm repair requires explicit action.
- Confirm accepted fields are not unexpectedly rewritten by failed repair.

### Slice 5B - Rescue And Run Artifacts

Ownership:

- `/desktop/crates/coverpro-storage/src/artifacts/**`
- `/desktop/crates/coverpro-app/src/screens/results/artifacts/**`

Tasks:

- Write current draft snapshots to a temp or configured artifact directory.
- Add rescue action.
- Add per-run metadata artifact with provider/model/type/timing/cost/status.
- Keep artifacts plaintext/debuggable.

Automated checks:

- Artifact path and content tests in temp directory.
- Rescue writes current visible draft, not rejected candidates.

Human smoke:

- Generate or repair a package.
- Click Rescue.
- Confirm artifact exists and matches visible current draft.

### Slice 5C - Plaintext Clipboard

Ownership:

- `/desktop/crates/coverpro-app/src/clipboard/**`

Tasks:

- Copy full package as plaintext.
- Copy resume section as plaintext.
- Copy cover letter as plaintext.
- Defer rich HTML copy.

Automated checks:

- Text extraction tests from parsed package.

Human smoke:

- Copy full package, resume, and cover letter.
- Paste into a plain editor.
- Confirm content is complete and readable.

## Wave 6 - Theme, Accessibility, And Final Smoke

Runs after MVP and recovery rails exist.

### Slice 6A - Desktop Design Compliance

Ownership:

- `/desktop/crates/coverpro-shadcn/**`
- `/desktop/crates/coverpro-app/src/ui/**`
- `/desktop/docs/theme-smoke.md`

Tasks:

- Audit GTK-semantic token usage.
- Audit spacing tier usage.
- Audit text sizes.
- Audit focus/hover/selected/disabled/dirty/success/warning/error states.
- Remove permanent chrome that belongs behind progressive disclosure.

Automated checks:

- Token usage smoke checks where practical.
- No arbitrary color literals outside the theme adapter, except documented exceptions.

Human smoke:

- Walk input, results, export, and settings.
- Confirm state visibility under normal and error flows.
- Confirm dense desktop layout is scannable.
- Confirm primary surfaces are not crowded by advanced diagnostics.

### Slice 6B - End-To-End Human Smoke

Ownership:

- `/desktop/docs/human-smoke.md`
- No production code ownership.

Tasks:

- Write and run final smoke script.
- Record provider/model/type used.
- Record whether package writing quality was acceptable.
- Record repair count, export result, and any Typst fit failures.

Human smoke script:

- Launch `/desktop` app on NixOS.
- Open settings and confirm API provider is configured.
- Paste a real job description.
- Select provider/model/job type.
- Generate package.
- If output is clearly bad, use Repair once and confirm previous draft remains safe.
- Accept a usable package.
- Edit at least one summary line, two bullets, and cover-letter text.
- Run Typst fit check.
- If fit fails, make a human edit and re-check.
- Generate resume and cover-letter PDFs.
- Open PDFs and confirm they are the intended application package.
- Copy plaintext package and paste it into a text editor.
- Restart app and confirm core settings persist.

Pass criteria:

- Human can turn one real job description into an application package without using the old Tauri UI.
- Variable LLM text does not break the UI layout or destroy the last usable draft.
- Typst failures are understandable and recoverable through editing.
- PDF files are generated from the edited field state.

## Dependency Map

| Wave | Depends On | Enables |
| --- | --- | --- |
| 0 | Existing docs | All implementation |
| 1 | Wave 0 | Backend, storage, UI shell |
| 2 | Wave 1B contracts | Real generation/export/settings |
| 3 | Wave 1 + Wave 2 fakes or implementations | Single-job MVP |
| 4 | Wave 3 | Batch concurrency UX |
| 5 | Wave 3 | Safety/recovery polish |
| 6 | Waves 3-5 | Release-quality smoke |

## Non-Overlapping Ownership Summary

| Area | Primary Owner Slice |
| --- | --- |
| Workspace and app shell | 1A |
| Core types/parsing/lint contracts | 1B, then 5A for lint expansion |
| Theme/component adapter | 1C, then 6A for audit |
| API runner | 2A |
| Settings persistence | 2B |
| Typst export | 2C |
| Input screen | 3A, then 4A for slots |
| Results screen | 3B, then 4B and 5A/5B for extensions |
| Export edit screen | 3C |
| Settings UI | 3D |
| Clipboard | 5C |
| Human smoke docs | 6B |

## Explicit Deferrals

- Tauri/webview compatibility.
- Android/mobile.
- CLI Claude/Codex runners.
- Import queue and repair import.
- Rich HTML clipboard.
- Pixel-perfect PDF fitting from arbitrary LLM output.
- Editing or forking dependency crates in place.

## Notes For Implementers

- Treat model responses as candidates until admitted by `coverpro-core`.
- `currentDraft` is the human-visible, exportable, rescuable package state.
- The UI must allow variable-length generated content to be edited down by a human.
- Typst is the layout authority for PDFs; the GUI should expose its failures clearly rather than pretending every generated package can auto-fit.
- Human smoke is not a formality here. It is the only reliable way to judge whether a non-deterministic package is acceptable for a real job application.
