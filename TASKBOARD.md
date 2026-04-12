# TASKBOARD

Date: 2026-04-08
Status: active board aligned to shipped safety rails plus model/settings UX cleanup and OpenRouter manual-model control

## Session Progress

### Completed This Session

- Human smoke sign-off recorded in `Smoke-Human-04-08.md`.
- Removed OpenCode as a backend across UI/backend bridge paths to reduce broken-state surface area.
- Reworked OpenRouter selection to be manual-model-ID first, with a persisted manual-only toggle.
- Removed hardcoded injected OpenRouter smoke models from discovery flow.
- Stopped OpenRouter dynamic results from silently re-merging stale fallback entries when fresh/manual options exist.
- Fixed stale input-header model picker state by adding a settings-to-input catalog refresh signal, so runner-bound selected model stays in sync.
- Centralized settings entry to one always-visible floating gear plus keyboard shortcut, and removed duplicate settings open path in input header.
- Confirmed the old Rust unreachable fallback arm after OpenCode removal is cleaned up.

- Mandatory human-gated repair now blocks every repair call until explicit user action.
- Scoped field repair now keeps passing bullets stable while only failed fields change across iterations.
- Initial package admission hardening now rejects malformed candidate packages instead of letting bad follow-up output overwrite the visible draft.
- `currentDraft` is now explicit in runner/UI state, with rejected-candidate debug visibility instead of silent overwrite risk.
- Structured output for `content` and `pmm` is now live and materially improved first-pass package quality.
- Cover-letter export editing now uses one editable block instead of paragraph objects, while remaining compatible with PDF export.
- Inline OpenRouter cost is now visible on package cards, so live model comparisons do not require external bookkeeping.
- Scoped bullet repair now uses a smaller bullet-local prompt when failures are localizable, with broader repair as fallback for structural/count errors.
- Separate workstreams for safety/admission and Typst preflight are now merged into the main repo closeout state for planning purposes.
- Typst-backed resume measurement now reports real page and section heights instead of relying only on proxy character budgets.
- Typst preflight now emits machine-readable failure metadata, and the export UI surfaces it in a blocking readable modal instead of an ephemeral toast.
- Export success now reads the real Tauri camelCase payload instead of falsely reporting failure on a successful write.
- Results/paused checkpoints and export fit checks now both run doc-wide Typst preflight plus Typst bullet-width measurement.
- A repo-local `app/scripts/debug-export.mjs` path now exists to run rescued packages through preflight, resume compile, and cover-letter compile outside the UI.

### Next Up

- Run one more explicit stale-model regression smoke: save OpenRouter manual IDs in settings, confirm input picker updates instantly, then run generate and verify runner uses updated selected model.
- Optional cleanup migration: clear deprecated `openrouter_preferred_providers`, `openrouter_pinned_models`, and `openrouter_max_results` keys from old settings stores.
- Smoke two fresh packages through results and export to verify the unified Typst gates and export success-path UI.
- Create a shared budget manifest per field class so runner, linter, and Typst preflight use the same contract.
- Persist durable run telemetry and human writing scores instead of relying only on inline session visibility.

## Review Notes

This board is based on the current architecture described in:

- `traverse/generation-runner.md`
- `traverse/lint-gate.md`
- `traverse/app-shell.md`
- `traverse/app-store.md`
- `traverse/export-and-parse-boundary.md`
- `traverse/tauri-command-bridge.md`
- `traverse/resume-knowledge-base.md`

And on the current implementation seams in:

- `app/src/lib/services/runner.ts`
- `app/src/lib/utils/linter.ts`
- `app/src/routes/+page.svelte`
- `app/src/lib/components/SimpleOutput.svelte`
- `app/src-tauri/src/lib.rs`
- `app/src-tauri/templates/resume.typ`
- `app/test/test-linter.ts`

## What The Review Changed

- Human smoke tests are live job applications, so autonomous repair is currently the wrong default. The runner has to stop and require a user decision before any repair call mutates the draft again.
- The next hard architectural boundary is draft admission. A model response is a candidate, not state. It must validate into an allowed package shape before it can mutate the visible draft.
- The visible draft should be treated as `currentDraft`: last-known-good, user-readable, exportable, rescueable, and protected from malformed follow-up output.
- After the minimum safety rails are in place, the highest product leverage is better structured output framing so first-pass packages are usable more often.
- Human-gated repair is also an observability feature. It exposes repair churn, latency, and cost in a form a human can grade without external bookkeeping.
- Cost telemetry is not just analytics. A compact per-run summary is part of the operator workflow for comparing models under time/cost/patience constraints.
- The lint contract remains a major leverage point after draft admission, because `linter.ts` still returns one flat `valid/errors` result and `runner.ts` still repairs the whole document.
- The UI already has pause/accept checkpoint machinery, so the first shift is not inventing a new concept. It is turning the existing pause model into a mandatory repair gate, then later shrinking the gate from whole-document review to field-scoped review.
- Typst is now acting as the real layout authority at both the paused/results gate and export fit checks, with bullet-width and doc-wide checks exposed in both places. The next leverage is turning those measurements into a shared budget contract instead of parallel heuristics.
- Successful export can no longer be inferred from UI banners alone; the repo now also has a direct rescued-package export probe because UI interpretation bugs are part of the real blast radius.
- Smoke on the safety path is inherently probabilistic because model behavior, provider behavior, and job-description inputs are not deterministic. Success criteria should be framed around reducing ugly failure runs and preserving usable drafts, not pretending the path is exhaustively proven.

## Architecture Contracts

### Current Draft Contract

- `currentDraft` is the last admitted valid package, not just the latest model text.
- `currentDraft` is the only draft the UI should render, export, rescue, or treat as editable application state.
- Once admitted, `currentDraft` cannot be overwritten by malformed, partial, or schema-invalid follow-up output.

### Candidate Admission Contract

- Every model response is first treated as a `candidateDraft`.
- A `candidateDraft` may mutate `currentDraft` only if it passes package validation against an allowed CoverPro response shape.
- Rejected candidates stay outside user-visible state and are surfaced only as errors/debug info.

### Field Repair Contract

- Lint failures are attached to field identities, not just the whole document.
- Repair loops may only mutate fields that failed validation.
- Passed fields remain locked by merge policy, even if the model returns a broader rewrite.
- Cover letter is just another lockable field/block and can remain untouched while resume sections repair.

### Shape Contract Direction

- The long-term parser/admission model should support a bounded set of valid package shapes, not one rigid form and not open-ended markdown.
- Use an `anyOf`-style mindset for optional or mutually exclusive sections so the parser can admit legitimate variation while rejecting garbage.
- Resume-type configs should eventually move out of `runner.ts` into structured JSON keyed by resume mode and section, so generation, parsing, and repair share the same contract surface.

## Recommended Sequence

| Priority | Task                                                                                                       | Why it matters                                                                                                                              | Ease | Impact | Dependencies                     | Deliverable / done state                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---: | -----: | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Smoke unified Typst gates on two fresh packages**                                                        | The gating logic is now wired into both results and export, but this session ended before human smoke confirmed the real workflow.        |    2 |      5 | gate unification landed           | Two fresh packages show coherent paused/export diagnostics and truthful export success/failure banners.                             |
| 2        | **Create a budget manifest per field class**                                                               | A single manifest should become the contract shared by runner, linter, and Typst once both proxy and measured budgets are known.          |    3 |      4 | unified gate smoke                | JSON or YAML manifest with `max_lines`, `target_chars`, `warning_band`, and `repair_band` by field type.                          |
| 3        | **Persist run telemetry and human quality scores to a durable log**                                        | Inline cost visibility is good enough for live use; durable logging turns repeated smoke into comparable records.                         |    4 |      4 | Inline cost visibility landed     | Log or markdown artifact per run with model, elapsed time, repair count, token/cost telemetry, admission failures, and human writing rating. |

## Suggested Implementation Batches

1. Smoke unified Typst gates on two fresh packages
2. Shared budget manifest across runner, linter, and Typst
3. Durable run logging with human writing scores

## Human Smoke Notes

- Safety-path smoke is harder than it looks because model selection, provider behavior, and job-description inputs are not deterministic.
- The goal is not a fake sense of exhaustive proof. The goal is to reduce the ugly 10 percent of runs that destroy trust, patience, or usable drafts.
- Human smoke on admission safety should focus on whether bad runs preserve `currentDraft`, expose enough debug context to understand what happened, and keep the app usable without extra bookkeeping.
- Human smoke on telemetry should focus on whether inline cost keeps model comparisons cheap enough to do in real time.
- Cover-letter smoke can now stay focused on writing quality and editability, while Typst preflight handles layout risk as a readable blocking export step.

## Notes For The Next Agent

- `traverse/generation-runner.md` is the first authority doc to update because the orchestration contract is changing before the lint contract does.
- `app/src/routes/+page.svelte` already contains paused-draft, accepted-draft, and rescue snapshot workflow state; reuse that before inventing new interaction state.
- `currentDraft` should be treated as the durable interaction surface. Model responses are candidates until admitted.
- The immediate product target is not abstract robustness. It is a trustworthy daily workflow: preserve usable drafts, improve first-pass package quality, and make model runs legible enough to compare quickly.
- The parser/admission layer should evolve toward bounded valid package variants, not a single rigid shape and not arbitrary markdown recovery.
- API backends should surface real usage and cost in the UI when providers return it; the compact run summary is part of the operator workflow, and durable run logs should mirror that same telemetry plus human quality scoring.
- `app/src-tauri/templates/resume.typ` and the export bridge now own real measured layout feedback and machine-readable preflight failure metadata, but `runner.ts` now also gates on that preflight instead of ignoring it.
- `app/scripts/debug-export.mjs` is the direct rescued-package probe when UI truth is suspect.
- The next unresolved cross-cutting contract is the budget manifest: runner, linter, and Typst now need one shared field-budget source instead of parallel assumptions.
