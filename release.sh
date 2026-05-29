#!/usr/bin/env bash
set -euo pipefail

# Re-exec inside nix dev shell if PKG_CONFIG_PATH is missing
if [[ -z "${PKG_CONFIG_PATH:-}" ]]; then
  exec nix develop --command "$0" "$@"
fi

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$REPO_ROOT/app"
TAURI_CONF="$APP_DIR/src-tauri/tauri.conf.json"

VERSION=$(grep -oP '"version"\s*:\s*"\K[^"]+' "$TAURI_CONF" | head -1)
TAG="v${VERSION}"
APP_NAME="coverpro"
ARCH="$(uname -m)"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
TARBALL="${APP_NAME}-${TAG}-${PLATFORM}-${ARCH}.tar.xz"
REPO="jaycee1285/coverpro"
ASSET_URL="https://github.com/${REPO}/releases/download/${TAG}/${TARBALL}"

echo "==> Building ${APP_NAME} ${TAG} (${PLATFORM}/${ARCH})"

cd "$APP_DIR"
bun install

# === NUCLEAR CACHE CLEARING ===
# Tauri's asset embedding is notoriously aggressive about caching.
# Multiple cache layers can cause stale CSS/JS to be embedded:
#
# 1. Vite cache (node_modules/.vite) - may serve stale transforms
# 2. Frontend build dir (build/) - previous build artifacts
# 3. Tauri build script output (target/release/build/coverpro-*) - embedded assets
# 4. Compiled coverpro crate - links against stale build script output
#
# The symptom: "content loads but no CSS" or "debug works, release doesn't"
# Debug builds use target/debug/build/coverpro-* (separate cache), which is
# why debug can work while release shows stale assets.
#
# We nuke ALL of these to guarantee fresh embedding.
echo "==> Nuking all caches to force fresh frontend embedding"
rm -rf node_modules/.vite
rm -rf .svelte-kit
rm -rf build
rm -rf src-tauri/target/release/build/coverpro-*
rm -rf src-tauri/target/release/coverpro src-tauri/target/release/coverpro.d

# Rebuild frontend explicitly (don't rely on tauri's beforeBuildCommand)
echo "==> Building frontend"
bun run build

# Now build Tauri using tauri-cli (not cargo directly)
# tauri build handles asset embedding correctly; cargo build alone does not
echo "==> Building Tauri release binary"
bun run tauri build --no-bundle

BINARY="$APP_DIR/src-tauri/target/release/${APP_NAME}"
if [[ ! -f "$BINARY" ]]; then
  echo "ERROR: Binary not found at ${BINARY}"
  exit 1
fi

# Track frontend build in git so `nix build` / home-manager picks it up.
# The flake.nix package embeds app/build/ at Nix eval time; gitignored
# files are excluded from the flake source tree.
echo "==> Tracking frontend build in git for Nix package"
git -C "$REPO_ROOT" add -f app/build/

STAGING=$(mktemp -d)
trap "rm -rf $STAGING" EXIT

cp "$BINARY" "$STAGING/"

install -d "$STAGING/share/applications" "$STAGING/share/icons"
install -m644 "$REPO_ROOT/packaging/linux/coverpro.desktop" \
  "$STAGING/share/applications/coverpro.desktop"
cp -r "$REPO_ROOT/icons/linux/hicolor" "$STAGING/share/icons/"

# === STRIP NIX STORE PATHS ===
# Building inside `nix develop` bakes this machine's /nix/store paths into
# the binary's RPATH and ELF interpreter. Those paths are unique per machine
# (different hashes for glibc, gtk, etc.), so the binary won't start on any
# other NixOS system.
#
# Fix: strip all Nix-specific paths. The receiving machine's autoPatchelfHook
# (in config/tauri.nix) will set the correct RPATH and interpreter for its
# own store paths at install time.
echo "==> Stripping Nix store paths for cross-machine portability"
patchelf --remove-rpath "$STAGING/${APP_NAME}"
patchelf --set-interpreter /lib64/ld-linux-x86-64.so.2 "$STAGING/${APP_NAME}"

echo "==> Creating ${TARBALL}"
tar -cJf "$REPO_ROOT/$TARBALL" -C "$STAGING" "${APP_NAME}" share

echo "==> Uploading to GitHub release ${TAG}"
if gh release view "$TAG" --repo "$REPO" &>/dev/null; then
  gh release upload "$TAG" "$REPO_ROOT/$TARBALL" --repo "$REPO" --clobber
else
  gh release create "$TAG" "$REPO_ROOT/$TARBALL" \
    --repo "$REPO" \
    --title "${APP_NAME} ${TAG}" \
    --notes "${APP_NAME} ${TAG}" \
    --latest
fi

echo "==> Release asset: ${ASSET_URL}"
echo "==> SHA-256 for Nix flake input:"
PREFETCH_JSON=$(nix store prefetch-file --json --hash-type sha256 "$ASSET_URL")
echo "$PREFETCH_JSON" | grep -oP '"hash"\s*:\s*"\K[^"]+'
PREFETCH_PATH=$(echo "$PREFETCH_JSON" | grep -oP '"storePath"\s*:\s*"\K[^"]+')
if [[ -n "$PREFETCH_PATH" ]]; then
  nix store delete "$PREFETCH_PATH" 2>/dev/null || true
fi

echo ""
echo "==> Done! https://github.com/${REPO}/releases/tag/${TAG}"
echo ""
echo "    Tarball uploaded for non-NixOS systems."
echo "    For NixOS: commit the staged build/ changes, then rebuild home-manager."
echo "      git commit -m 'Update frontend build for nix package'"
echo "      home-manager switch --flake ."
echo ""
echo "    NOTE: The raw binary requires GTK env vars. On NixOS, either:"
echo "      - Use home-manager install (has wrapper with correct env)"
echo "      - Or run: nix develop --command ./app/src-tauri/target/release/coverpro"
