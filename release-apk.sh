#!/usr/bin/env bash
#
# Build a signed Android APK for CoverPro
#
# Usage:
#   nix develop
#   ./release-apk.sh              # Run from project root
#   ./release-apk.sh /path/to/repo  # Or specify path
#
set -euo pipefail

REPO_PATH="${1:-.}"
cd "$REPO_PATH"

REPO="coverpro"

# Android SDK/NDK paths
ANDROID_SDK="$HOME/.local/share/android-sdk"
NDK_VERSION="25.1.8937393"
NDK_PATH="$ANDROID_SDK/ndk/$NDK_VERSION"

# Verify this looks like a Tauri project
if [[ ! -f "app/src-tauri/tauri.conf.json" ]]; then
  echo "Error: Not a Tauri project (missing app/src-tauri/tauri.conf.json)"
  exit 1
fi

if [[ ! -d "app/src-tauri/gen/android" ]]; then
  echo "Error: No Android target (missing app/src-tauri/gen/android)"
  echo "Run: cd app && bun run tauri:android:init"
  exit 1
fi

echo "==> Building $REPO APK"

# Verify NDK exists
if [[ ! -d "$NDK_PATH" ]]; then
  echo "Error: NDK not found at $NDK_PATH"
  echo "Install with: curl -LO https://dl.google.com/android/repository/android-ndk-r25b-linux.zip"
  echo "             unzip android-ndk-r25b-linux.zip -d $ANDROID_SDK/ndk/"
  echo "             mv $ANDROID_SDK/ndk/android-ndk-r25b $NDK_PATH"
  exit 1
fi

# NixOS fix: Android SDK scripts use #!/bin/bash which doesn't exist on NixOS
# Patch them to use #!/usr/bin/env bash instead
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
cd app
rm -rf .svelte-kit build node_modules/.vite src-tauri/gen/android/app/build src-tauri/gen/android/.gradle
# Force Cargo to re-embed frontend assets (generate_context! doesn't track build/ changes)
rm -rf src-tauri/target/aarch64-linux-android/release/build/

# Build frontend (inside nix shell for proper environment)
nix develop ../ --command bun run build

# Build Android APK (inside nix shell for rust + cargo)
nix develop ../ --command bun run tauri:android

# Find the unsigned APK (Gradle naming is inconsistent)
UNSIGNED_APK="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
if [[ ! -f "$UNSIGNED_APK" ]]; then
  UNSIGNED_APK="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
fi

if [[ ! -f "$UNSIGNED_APK" ]]; then
  echo "Error: No APK found in src-tauri/gen/android/app/build/outputs/apk/universal/release/"
  ls -la src-tauri/gen/android/app/build/outputs/apk/universal/release/ || true
  exit 1
fi

echo "==> Found unsigned APK: $UNSIGNED_APK"

# Move back to repo root for keystore
cd ..

if [[ ! -f "debug.keystore" ]]; then
  echo "Warning: No debug.keystore found, creating one..."
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

"$ANDROID_SDK/build-tools/$BUILD_TOOLS/apksigner" sign \
  --ks debug.keystore --ks-pass pass:android \
  --out "$REPO.apk" \
  "app/$UNSIGNED_APK"

echo "==> Done: $(pwd)/$REPO.apk"
