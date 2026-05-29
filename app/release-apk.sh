#!/usr/bin/env bash
#
# Build a signed Android APK for CoverPro
#
# Usage:
#   nix develop
#   cd app && ./release-apk.sh
#
set -euo pipefail

# Ensure we're in the app/ directory (where src-tauri lives)
if [[ ! -f "src-tauri/tauri.conf.json" ]]; then
  echo "Error: Not in app/ directory (missing src-tauri/tauri.conf.json)"
  echo "Run from: cd app && ./release-apk.sh"
  exit 1
fi

if [[ ! -d "src-tauri/gen/android" ]]; then
  echo "Error: No Android target (missing src-tauri/gen/android)"
  echo "Run: bun run tauri android init"
  exit 1
fi

echo "==> Building CoverPro APK"

# Android SDK/NDK paths
ANDROID_SDK="$HOME/.local/share/android-sdk"
NDK_VERSION="27.2.12479018"
NDK_PATH="$ANDROID_SDK/ndk/$NDK_VERSION"

# Verify NDK exists
if [[ ! -d "$NDK_PATH" ]]; then
  echo "Error: NDK not found at $NDK_PATH"
  echo "Install via Android SDK Manager: sdkmanager 'ndk;27.2.12479018'"
  exit 1
fi

# NixOS fix: Android SDK scripts use #!/bin/bash which doesn't exist on NixOS
if [[ ! -f "/bin/bash" ]]; then
  echo "==> Patching Android SDK shebangs for NixOS..."

  # NDK clang wrappers
  for f in "$NDK_PATH/toolchains/llvm/prebuilt/linux-x86_64/bin/"*-clang \
           "$NDK_PATH/toolchains/llvm/prebuilt/linux-x86_64/bin/"*-clang++; do
    if head -1 "$f" 2>/dev/null | grep -q '^#!/bin/bash$'; then
      sed -i '1s|^#!/bin/bash$|#!/usr/bin/env bash|' "$f"
    fi
  done

  # Build-tools (apksigner, d8, etc.)
  for f in "$ANDROID_SDK/build-tools/"*/apksigner \
           "$ANDROID_SDK/build-tools/"*/d8; do
    if [[ -f "$f" ]] && head -1 "$f" 2>/dev/null | grep -q '^#!/bin/bash$'; then
      sed -i '1s|^#!/bin/bash$|#!/usr/bin/env bash|' "$f"
    fi
  done
fi

# Set Android environment
export ANDROID_HOME="$ANDROID_SDK"
export NDK_HOME="$NDK_PATH"

# Clean frontend and Android build caches
echo "==> Clearing caches..."
rm -rf .svelte-kit build node_modules/.vite src-tauri/gen/android/app/build src-tauri/gen/android/.gradle
# Force Cargo to re-embed frontend assets
rm -rf src-tauri/target/aarch64-linux-android/release/build/

# Build frontend
echo "==> Building frontend..."
bun run build

# Build Android APK
echo "==> Building Android APK..."
bun run tauri android build

# Sign APK
UNSIGNED_APK="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"

if [[ ! -f "$UNSIGNED_APK" ]]; then
  echo "Error: Unsigned APK not found at $UNSIGNED_APK"
  exit 1
fi

if [[ ! -f "debug.keystore" ]]; then
  echo "==> Creating debug keystore..."
  keytool -genkey -v -keystore debug.keystore -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass android -keypass android \
    -dname "CN=Debug,O=Debug,C=US"
fi

# Find latest build-tools version
BUILD_TOOLS=$(ls -1 "$ANDROID_SDK/build-tools/" | sort -V | tail -1)
if [[ -z "$BUILD_TOOLS" ]]; then
  echo "Error: No build-tools found in $ANDROID_SDK/build-tools/"
  exit 1
fi

echo "==> Signing APK..."
"$ANDROID_SDK/build-tools/$BUILD_TOOLS/apksigner" sign \
  --ks debug.keystore --ks-pass pass:android \
  --out coverpro.apk \
  "$UNSIGNED_APK"

SYNCTHING_DIR="$HOME/syncthing"
if [[ -d "$SYNCTHING_DIR" ]]; then
  cp coverpro.apk "$SYNCTHING_DIR/coverpro.apk"
  echo "==> Copied to $SYNCTHING_DIR/coverpro.apk"
else
  echo "Warning: Syncthing directory not found at $SYNCTHING_DIR; skipping copy"
fi

echo "==> Done: $(pwd)/coverpro.apk"
