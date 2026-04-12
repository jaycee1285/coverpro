# StackBuild - CoverPro

## Dev Stack
- **Frontend:** SvelteKit 2.9.0 + Svelte 5 + TypeScript 5.6.2
- **Backend:** Tauri v2 (Rust)
- **Package Manager:** Bun (frontend), Cargo (backend)
- **Build Tool:** Vite 6.0.3
- **CSS:** Tailwind CSS v4 + PostCSS

## Target
- **Desktop** (Linux — GTK4/WebKitGTK 4.1)

## Additional Key Libraries (UI)
- Skeleton UI v4 (@skeletonlabs/skeleton-svelte)
- Tailwind CSS v4 with Typography plugin
- Lucide icons via unplugin-icons + @iconify/svelte
- Marked 17.0.1 (markdown rendering)
- @fontsource/mulish (typography)
- Runtime GTK4 theme integration (CSS variable override)

## Key Features
Desktop app that processes 4 job descriptions per run, invoking Claude Code CLI in background to generate resume + cover letter packages. Outputs rendered in-app with Markdown display and HTML copy for Google Docs paste fidelity.

- Unlike generic AI writing tools — enforces per-employer fact scoping, cross-employer bleed detection, and similarity checking against source bullet variants
- Multi-agent pipeline mode: Sonnet (bullets) → Opus (critique) → Opus (cover letter)
- Linter with repair loop: character limits, FD metric verification, filler phrase detection, cover letter word count/sentence caps
- Per-job elapsed timer, cancel buttons, keyboard shortcuts (Ctrl+G generate, Ctrl+K kill, Ctrl+J kill all)
- Output dump to `/tmp/coverpro/` for review

---

## Building Instructions

### Nix develop?
Yes — `flake.nix` with full Rust + Bun + GTK/WebKitGTK dev environment.
```bash
nix develop                    # Enter dev shell (or auto via direnv)
```

### Dev server?
```bash
cd app && bun install
cd app && bun run dev          # Vite only at localhost:1420 (faster UI iteration)
```

### Tauri dev server?
```bash
cd app && bun run tauri dev    # Full Tauri app with hot reload
```

---

## Android Build
N/A — desktop Linux only. No Android configuration.

### APK signing reference (from SPRedux)
N/A for this project.

## Desktop Build
```bash
cd app && bun run tauri build --no-bundle    # Production binary
```
Binary output: `app/src-tauri/target/release/coverpro`

- **Release script?** Yes — `release.sh` at repo root
  - Builds frontend + Rust binary
  - Creates versioned tarball: `coverpro-v{VERSION}-linux-x86_64.tar.xz`
  - Uploads to GitHub releases via `gh release`
  - Commits frontend build to git for Nix flake tracking
- Also: `build.sh` for simpler manual builds (no GitHub upload)
- **Last build:** 2026-02-05

## Web Build
N/A — desktop application only.
