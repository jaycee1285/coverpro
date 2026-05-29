# CoverPro UI Functionality And Rust GUI Migration Plan

Date: 2026-04-26

## Purpose

This document records the current Tauri/Svelte UI functionality, compares the local `shadcn-rs` egui and iced component sets, recommends a Rust graphics/UI library for a no-webview NixOS desktop version, and prepares the structure for a `/desktop` monorepo taskboard.

## Current UI Functionality

### App Shell

- Single-window app with three primary views: input, results, and export.
- Floating settings button is available from all views.
- Bottom-left model/backend status display shows whether the active backend is an agent CLI or an API provider.
- Settings, keyboard shortcuts, queue import, repair import, Tier 3 role-fit warning, API key warning, and Typst preflight failures are all modal/drawer surfaces.
- Keyboard shortcuts:
  - `Ctrl+G`: generate from input view.
  - `Ctrl+K`: cancel the first running job.
  - `Ctrl+J`: cancel all running jobs.
  - `Ctrl+P`: export PDFs from export view.
  - `Ctrl+R`: return from export to results.
  - `Ctrl+I`: return from export to input.
  - `Ctrl+,`: open or close settings.
  - `Ctrl+H`: open or close shortcut help.
  - `Ctrl+Left` / `Ctrl+Right`: move between job input slots.
  - `Ctrl+M`: focus resume mode dropdown.
  - `Ctrl/Cmd+Shift+M`: focus model picker.
  - `Ctrl/Cmd+Shift+B`: focus backend picker.

### Input View

- Header includes app title, LLM temperature numeric input, pipeline toggle, model picker, backend picker, Import, Repair, and Generate controls.
- Backend picker supports `claude`, `codex`, `anthropic-api`, `openai-api`, and `openrouter-api`.
- API backends are gated by configured provider keys.
- Switching backend uses a confirmation banner before changing the active provider.
- Model lists can be discovered dynamically and refreshed.
- Four job slots are maintained in app state.
- Only one slot is shown at a time with previous/next navigation and a `1 / 4` counter.
- Each job slot has job title, company, resume mode, and job description inputs.
- Generate collects all slots with non-empty job descriptions.
- Before generation, job descriptions are classified and a Tier 3 warning modal can let the user deselect poor-fit jobs.
- Import drawer accepts `.html`, `.htm`, `.md`, and `.markdown` files.
- Import supports embedded `coverpro-batch` JSON, embedded `job-data` JSON, and markdown sections with job metadata.
- Imported jobs are paged in batches of four and can be loaded into the four slots.
- Repair import accepts a saved markdown package and selected resume style, then loads it into repair/export state.

### Results View

- Header contains Back, per-job status indicators, elapsed timers, per-job cancel buttons while running, and Cancel All while any job is active.
- Results are displayed as a single-column list, one output card per job.
- Each result has a checkbox controlling whether that job is carried back into input slots when returning to input.
- Job statuses include `pending`, `running`, `linting`, `fixing`, `paused`, `done`, `error`, and `cancelled`.
- A completion banner reports whether all packages completed, completed with errors, or were cancelled.
- Each output card provides actions for Redo, Pause, Repair, Accept, copy All, copy Resume, copy Cover, Rescue, and PDF export when applicable.
- Live runner detail is shown through `statusDetail`, `lastMutation`, transient notes, rescue status, rejected candidate debug details, and total cost.
- Markdown packages are parsed into a structured preview rather than shown as raw markdown.
- Resume sections show headings, bullets, per-bullet character counts, and employer-specific visual borders.
- Cover letter sections render paragraphs.
- Copy actions write both HTML and plain text to the clipboard when supported.
- Pause/repair checkpoints expose lint issues, warning counts, Typst document fit failures, bullet width failures, page count, measured height, and candidate debug text.
- Rescue writes the currently visible draft to `/tmp/coverpro/rescue`.
- Final or visible draft output can be opened in Export.

### Export View

- Export view edits parsed fields before PDF generation.
- Header includes return to input, return to results, Check Typst Fit, and Generate PDFs.
- Editable fields include job title, summary, employer-specific resume bullets, earlier experience, and cover letter text.
- Character counts are shown for the summary and bullet fields, with out-of-range highlighting.
- Optional employer sections render only when present in the parsed package.
- Check Typst Fit runs a preflight without exporting PDFs.
- Fit diagnostics show pass/fail/stale state, page count, measured height, document-level failures, bullet-width failures, and successful check status.
- Generate PDFs runs export and reports the output directory on success.
- Failed export shows the failing stage, inline diagnostic detail, optional measured sections, and a modal for Typst preflight failures.
- Export is blocked unless the parsed package contains a summary and a non-empty WAR cover letter.

### Settings

- Settings include backend and model pickers with live model refresh.
- Model discovery filters include OpenAI excluded tokens, OpenAI GPT-5-family-only toggle, OpenRouter manual model IDs, OpenRouter manual-only toggle, and OpenRouter max results.
- Resume mode can be changed globally.
- Mobile storage section checks file access, allows output directory edits, and opens a directory picker.
- API key section supports Anthropic, OpenAI, and OpenRouter keys.
- API keys can be shown/hidden, pasted from clipboard, saved, cleared, and validated.
- Hardwired keys are masked when present.
- Desktop exposes CLI and API backends; mobile exposes API backends only.

### Native/Tauri Backend Capabilities Used By UI

- Runs `claude` or `codex` CLI processes asynchronously.
- Maps model tiers between Claude and Codex fallbacks.
- Detects rate-limit and capacity errors and falls back between Claude and Codex when appropriate.
- Tracks and kills individual or all spawned processes.
- Reads, writes, and appends files.
- Checks Android storage permission and computes platform default output directory.
- Embeds Typst resume and cover letter templates at compile time.
- Runs `typst query` for resume preflight metrics.
- Runs `typst query` for bullet-width measurement.
- Runs `typst compile` for resume and cover letter PDF output.
- Registers Tauri store, clipboard, HTTP, dialog, and opener plugins.

## shadcn-rs Repository Findings

The local `shadcn-rs` checkout is a Rust workspace with two UI component crates:

- `egui-shadcn`: shadcn-style components for `egui`.
- `iced-shadcn`: shadcn-style components for `iced`.

Both READMEs warn that APIs are unstable and should be pinned exactly.

### egui-shadcn Surface

- Current README install example uses `egui-shadcn = "0.3.1"` and `egui = "0.33"`.
- Provides a mature list of form, layout, overlay, typography, and navigation components.
- Public modules include accordion, alert, alert dialog, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, combobox, command, context menu, data table, date picker, dialog, drawer, dropdown menu, empty, field, form, hover card, input, input OTP, kbd, label, menubar, navigation menu, pagination, popover, progress, radio, resizable, scroll area, select, sheet, sidebar, skeleton, slider, spinner, switch, table, tabs, textarea, toast, toggle group, tooltip, and typography.
- Depends on `egui = "0.33"` and uses `eframe = "0.33"` in examples.
- Optional plot feature uses `egui_plot`.

### iced-shadcn Surface

- Current README says the crate is under active development and its public API, theming model, and component set are not stable.
- The actual crate contains a broad component surface, including controls needed by CoverPro: input, textarea, select, checkbox, switch, slider, tabs, table, data table, scroll area, dialog, drawer, dropdown menu, popover, tooltip, progress, spinner, toast, resizable, sidebar, file drop zone, code block, prompt input, conversation, tree view, image cropper, and more.
- Depends on `iced = "0.14"` with `advanced`, `canvas`, `highlighter`, `image`, `tokio`, `tiny-skia`, and `lazy` features.
- Uses `lucide-icons` with iced support.
- Has optional `rfd`, `web-colors`, and `wry` features. The `wry` feature is specifically optional for web preview and should not be enabled for the no-webview desktop app.
- Has native-friendly features that map well to CoverPro, especially file drop, image/canvas support, highlighter/code block, async `tokio`, and a retained update model.

## Recommendation

Use `iced` with selected, pinned `iced-shadcn` components for the `/desktop` no-webview Rust GUI.

Rationale:

- CoverPro is a stateful workflow application, not a graphics-heavy editor. It needs forms, long text areas, model/backend pickers, async job execution, cancellable tasks, modal/drawer surfaces, progress/status rows, scrollable structured output, diagnostics, file import/export, and settings persistence.
- `iced`'s retained architecture fits this workflow better than immediate-mode `egui`: the app has explicit state machines for job slots, running jobs, repair checkpoints, settings, export fields, and modal visibility.
- The current UI already resembles an Elm-style update/view application. Porting Svelte store state and event handlers to an `iced` `Message`/`update`/`view` structure should be straightforward.
- `iced` includes first-class async command/task patterns, useful for CLI runs, API calls, Typst preflight, PDF export, model discovery, file dialogs, and cancellation.
- `iced-shadcn` has direct coverage for the controls CoverPro needs: button, input, textarea, select/combobox, checkbox, switch, slider, dialog, drawer/sheet, scroll area, progress/spinner, table/data table, tabs, toast, file drop zone, and typography.
- The no-webview NixOS goal is better served by an `iced`/`wgpu` native window than Tauri plus WebKit/WebView dependencies.

The main caveat is API stability. Pin exact `iced`, `iced-shadcn`, and `shadcn-rs` revisions, vendor or workspace the component crate if needed, and expect a small compatibility layer around shadcn components so future churn stays localized.

`egui` remains a credible fallback if the immediate goal is fastest possible native port with a mature ecosystem. It is especially attractive for developer tools and dense debug UIs. For this app, though, the retained state model, async workflow, and form-heavy surface make `iced` the better target.

## MVP Flow Requirements

The first Rust GUI milestone must preserve this core flow:

1. Paste a job description.
2. Select an API provider, model, and job description/resume type.
3. Generate the output.
4. Accept the output or send it back out for repairs.
5. Open an editing view for individual resume lines and cover-letter content.
6. Generate the Typst-based PDF copies from the edited fields.

Initial scope decisions:

- API providers are required in the first run-through. CLI backends can come later.
- Batch concurrency should be standard async execution over Tokio, not a deferred feature.
- Clipboard copy can start as plaintext.
- Job imports are not required for the first milestone.
- Typst should be embedded/provided by the desktop app environment rather than relying on an unmanaged system `PATH`.
- Dependencies should be pinned. Do not edit or fork dependency crates throughout the project; isolate any UI glue in the app or adapter crate.

## Design Rules For `/desktop`

The Rust GUI should follow the design rules in `/home/john/repos/digtwin/design-basics.md`, adapted to an `iced` + `iced-shadcn` native desktop app.

### Theme And Color

- Treat this as a desktop GUI target, not a web target.
- Start from proven theme sources instead of manually selected brand colors.
- Use GTK-style variable semantics as the desktop source of truth, even though the implementation is `iced`.
- Derive the GTK-style palette from the same Base16 ecosystem used elsewhere, with `~/.local/share/themes`, `~/repos/base16changer`, and `~/.config/gtk-4.0/gtk.css` as references.
- Map GTK-style variables into the `iced-shadcn` theme adapter in `coverpro-shadcn`.
- Keep state colors explicit and testable: default, hover, active, selected, focus, disabled, dirty, destructive, success, warning, running, paused, failed, and complete.
- Hover and selected states must remain visually distinct.
- Surface distinctions must remain legible between input/editor, results, export editor, modal/dialog, status row, settings, and diagnostics.
- Syntax or code-like output should use theme-aligned syntax colors if highlighted output is introduced later.

### Typography

- Use one pairing across the desktop app.
- Prefer `Spline Sans Mono` for titlebars, headings, button text, status labels, keyboard hints, and strong labels.
- Prefer `Spline Sans` for body text, forms, menus, diagnostics, and long readable content.
- Monospace should signal structure and emphasis; it should not be used for long job descriptions, generated cover-letter paragraphs, or dense settings copy.
- Minimum text sizes: 16px equivalent for menu items, 13px equivalent for other UI text.

### Spacing And Density

- Use a desktop base unit of 8px.
- Snap alignment and final measurements to 4-based values.
- Use named spacing tiers instead of arbitrary gaps:
  - `space-1`: 8px, tight related elements.
  - `space-2`: 16px, default intra-group spacing.
  - `space-3`: 24px, component padding and stacked control groups.
  - `space-5`: 40px, separation between panels or major sections.
  - `space-8`: 64px, route-level separation when needed.
- Button heights should generally land in the 24px to 40px range depending on density and importance.
- Panel, card, modal, and editor padding should usually start at `space-2` or `space-3`.
- Avoid decorative spacing. Increase spacing to communicate hierarchy, not to add empty air.

### Layout And Interaction

- Optimize for desktop and keyboard-heavy use, not a mobile clone.
- Keep the first screen focused on the required work: paste job description, choose provider/model/type, generate.
- Put daily actions in a compact command/header area plus shortcuts: generate, cancel, repair, accept, edit, export, settings, and help.
- Use progressive disclosure for secondary features: model discovery filters, API key management, diagnostics, Typst preflight details, and advanced repair/debug output.
- Every primary work surface should be maximizable by collapsing adjacent panes or leaving secondary regions out of the default MVP screen.
- Preserve conventional shortcut language such as `Ctrl+G`, `Ctrl+P`, `Ctrl+,`, and `Ctrl+H`.
- Avoid modal-editor interaction models.
- State must always be visible: selected provider/model/type, dirty export edits, active generation, repair-needed output, failed preflight, export success, and saved settings.

### MVP Screen Implications

- Input can be a dense work surface, not a marketing page.
- Results should prioritize scan speed: job status, current authority/user action, output preview, and next action should be visible without reading debug text.
- Repair diagnostics should be collapsed by default unless they block the next action.
- Export editing should read as an editor surface with clear dirty state and visible Typst fit/export state.
- Settings should remain a dialog or secondary route, not permanent chrome.

## Proposed `/desktop` Monorepo Shape

```text
/desktop
  Cargo.toml
  flake.nix
  flake.lock
  crates/
    coverpro-app/          # iced application shell and UI state machine
    coverpro-core/         # shared package parsing, linting contracts, resume modes, model catalog types
    coverpro-runner/       # CLI/API execution, cancellation, fallback policy, cost accounting
    coverpro-export/       # Typst templates, preflight, bullet measurement, PDF export
    coverpro-storage/      # settings, key storage abstraction, output paths
    coverpro-shadcn/       # pinned adapter/re-export layer around iced-shadcn
  assets/
    icons/
    fonts/
  templates/
    resume.typ
    cover-letter.typ
  docs/
    ui-functionality.md
    migration-notes.md
    decisions/
  TASKBOARD.md
```

## Taskboard Preparation

### Phase 0: Decisions And Constraints

- [x] Confirm desktop-only NixOS scope for first milestone.
- [x] Keep `/desktop` inside this repo for now because this repo contains the active reference material.
- [x] Pin `iced`, `iced-shadcn`, `lucide-icons`, Typst runtime expectations, and Rust toolchain.
- [x] Use pinned dependency revisions rather than editing dependency crates in-place.
- [x] Define non-goals for first Rust GUI version: Android, Tauri webview, rich clipboard, job imports, browser APIs, and mobile storage permission flows.
- [x] Apply `/home/john/repos/digtwin/design-basics.md` rules for native desktop design.

### Phase 1: Workspace Scaffold

- [ ] Create `/desktop` Cargo workspace and Nix flake.
- [ ] Add `coverpro-app` with a minimal native `iced` window.
- [ ] Add `coverpro-shadcn` adapter crate with pinned shadcn component wrappers.
- [ ] Add GTK-semantic theme tokens mapped into `iced-shadcn`.
- [ ] Add Spline Sans Mono/Spline Sans app font assets or document Nix-provided font dependency.
- [ ] Add CI/build commands for `nix build`, `cargo check`, and `cargo test`.

### Phase 2: Core Extraction

- [ ] Move resume modes, model catalog types, package parsing, markdown-to-package structure, lint field keys, and validation into `coverpro-core`.
- [ ] Port runner contracts and result types without UI dependencies.
- [ ] Port PDF export fields and preflight result types.
- [ ] Add tests for package parsing, lint validation, and export field extraction.

### Phase 3: Native Backend

- [ ] Implement API provider clients first: Anthropic, OpenAI, and OpenRouter.
- [ ] Implement model discovery and filtering for API providers.
- [ ] Implement concurrent Tokio job execution for multiple submitted jobs.
- [ ] Implement cancellation and task/process tracking.
- [ ] Implement repair loop dispatch through the selected API provider/model.
- [ ] Defer CLI runner support for Claude and Codex until after the API-first flow works.
- [ ] Implement settings persistence and key storage suitable for NixOS desktop.

### Phase 4: Input UI

- [ ] Build app shell with global settings button and backend/model status display.
- [ ] Build job-description input for the first API-backed flow.
- [ ] Build four-slot input state and slot navigator after the single-job flow is stable.
- [ ] Build job title, company, resume mode, and job description controls.
- [ ] Build backend/model pickers and backend switch confirmation.
- [ ] Build temperature input and pipeline toggle.
- [ ] Defer import drawer for HTML/markdown job batches.
- [ ] Defer repair import flow for markdown packages.
- [ ] Build Tier 3 warning modal.
- [ ] Apply desktop spacing tiers, focus states, hover states, selected states, disabled states, and visible active provider/model/type state.

### Phase 5: Results UI

- [ ] Build results state machine for pending/running/linting/fixing/paused/done/error/cancelled.
- [ ] Build status row with timers, per-job cancel, and cancel all.
- [ ] Build output cards with Repair, Accept, plaintext Copy, and PDF actions for MVP.
- [ ] Add Redo, Pause, and Rescue after the accept/repair loop is stable.
- [ ] Build structured package rendering with bullets, character counts, cover-letter paragraphs, and employer accents.
- [ ] Build repair checkpoint diagnostics for lint, Typst preflight, bullet-width checks, rejected candidate debug, rescue status, and cost.
- [ ] Build keep-on-back behavior for selected results.
- [ ] Keep diagnostics progressively disclosed unless they block repair, acceptance, or export.

### Phase 6: Export UI

- [ ] Build export field editor for title, summary, employer bullets, earlier experience, and cover letter.
- [ ] Build character counts and out-of-range states.
- [ ] Build Check Typst Fit action and diagnostics.
- [ ] Build Generate PDFs action and success/failure reporting.
- [ ] Build preflight failure modal and measured section details.
- [ ] Preserve export blocking rules for missing summary or cover letter.
- [ ] Show dirty state for edited fields and stale Typst fit checks.

### Phase 7: Verification And Migration

- [ ] Compare Svelte and iced flows using sample markdown packages.
- [ ] Verify native plaintext clipboard behavior.
- [ ] Verify Typst preflight and export on NixOS.
- [ ] Verify concurrent Tokio generation and repair jobs.
- [ ] Verify API cancellation behavior where provider/client support allows it.
- [ ] Verify settings/key persistence paths under NixOS.
- [ ] Verify theme smoke states: hover, focus, selected, disabled, dirty, warning, error, success, running, paused, complete.
- [ ] Verify spacing and typography against `/home/john/repos/digtwin/design-basics.md`.
- [ ] Write human smoke-test script for paste JD, select provider/model/type, generate, accept/repair, edit fields, export Typst PDFs, and settings.

## Resolved Decisions

- API providers must be supported in the first run-through.
- Batch concurrency is expected and should be handled as standard Tokio async work.
- Clipboard copy can be plaintext for the first milestone.
- Imports are not required for the first milestone.
- The required maintained flow is paste job description, select API provider/model/job description type, generate, accept or repair, edit individual lines, and generate Typst copies.
- Typst should be embedded/provided by the app environment.
- Dependencies should be pinned; do not edit dependency crates throughout this project.
- `/desktop` should live inside this repo for now because this repo has the reference material.
- The Rust GUI should incorporate `/home/john/repos/digtwin/design-basics.md`: GTK-semantic desktop theming, Base16-derived theme origin, Spline font pairing, 8px desktop base unit with Fibonacci-style spacing tiers, explicit state visibility, conventional shortcuts, and progressive disclosure.
