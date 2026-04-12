{
  description = "CoverPro - JD Package Runner (Tauri + Svelte)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, rust-overlay }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

      nixpkgsFor = forAllSystems (system: import nixpkgs {
        inherit system;
        overlays = [ (import rust-overlay) ];
      });

      # Shared dependencies for Tauri
      tauriDeps = pkgs: with pkgs; [
        pkg-config
        openssl
        openssl.dev
        webkitgtk_4_1
        gtk3
        glib
        glib-networking
        libsoup_3
        cairo
        pango
        gdk-pixbuf
        atk
        harfbuzz
        librsvg
        dbus
        wayland
        wayland-protocols
        libxkbcommon
        xorg.libX11
        xorg.libXcursor
        xorg.libXrandr
        xorg.libXi
        xorg.libxcb
      ];

      runtimeLibs = pkgs: with pkgs; [
        webkitgtk_4_1
        gtk3
        glib
        glib-networking
        libsoup_3
        cairo
        pango
        gdk-pixbuf
        openssl
        dbus
        wayland
        libxkbcommon
        xorg.libX11
        xorg.libXcursor
        xorg.libXrandr
        xorg.libXi
      ];

    in {
      # Home Manager module
      homeManagerModules.default = import ./nix/hm-module.nix;

      # Packages - frontend must be pre-built and tracked in git
      # Run: cd app && bun install && bun run build && git add -f build/
      packages = forAllSystems (system:
        let
          pkgs = nixpkgsFor.${system};

          # Source including tracked build directory
          appSrc = pkgs.lib.cleanSourceWith {
            src = ./app;
            filter = path: type:
              let baseName = baseNameOf path; in
              baseName != "node_modules" &&
              baseName != ".svelte-kit" &&
              baseName != "target";
          };

        in {
          default = pkgs.rustPlatform.buildRustPackage {
            pname = "coverpro";
            version = "0.1.0";

            src = "${appSrc}/src-tauri";

            cargoLock = {
              lockFile = "${appSrc}/src-tauri/Cargo.lock";
            };

            # Tauri serves embedded frontend assets only with custom-protocol
            # (tauri build adds this automatically, cargo build does not)
            buildFeatures = [ "custom-protocol" ];

            nativeBuildInputs = with pkgs; [
              pkg-config
              wrapGAppsHook3
              makeWrapper
            ];

            buildInputs = with pkgs; [
              openssl
              webkitgtk_4_1
              gtk3
              glib
              glib-networking
              libsoup_3
              cairo
              pango
              gdk-pixbuf
              atk
              harfbuzz
              librsvg
              dbus
              wayland
              libxkbcommon
            ];

            # Copy frontend build before Rust build
            preBuild = ''
              mkdir -p ../build
              if [ -d "${appSrc}/build" ]; then
                cp -r ${appSrc}/build/* ../build/
              else
                echo "ERROR: Frontend not built or not tracked in git."
                echo "Run: cd app && bun install && bun run build && git add -f build/"
                exit 1
              fi
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p $out/bin
              cp target/*/release/coverpro $out/bin/

              install -Dm644 ${./packaging/linux/coverpro.desktop} \
                $out/share/applications/coverpro.desktop
              substituteInPlace $out/share/applications/coverpro.desktop \
                --replace-fail "Exec=coverpro" "Exec=$out/bin/coverpro"

              mkdir -p $out/share/icons
              cp -r ${./icons/linux/hicolor} $out/share/icons/

              runHook postInstall
            '';

            preFixup = ''
              gappsWrapperArgs+=(
                --set GIO_MODULE_DIR "${pkgs.glib-networking}/lib/gio/modules"
                --set WEBKIT_DISABLE_COMPOSITING_MODE 1
                --prefix LD_LIBRARY_PATH : "${pkgs.lib.makeLibraryPath (runtimeLibs pkgs)}"
                --prefix XDG_DATA_DIRS : "${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}"
                --prefix PATH : "${pkgs.typst}/bin"
                --run 'export TYPST_FONT_PATHS="/etc/profiles/per-user/$USER/share/fonts:$HOME/.local/share/fonts:/run/current-system/sw/share/fonts"'
              )
            '';

            meta = with pkgs.lib; {
              description = "Resume/cover letter package generator using Claude Code";
              license = licenses.mit;
              platforms = platforms.linux;
              mainProgram = "coverpro";
            };
          };

          coverpro = self.packages.${system}.default;
        });

      # Overlay for use in other flakes
      overlays.default = final: prev: {
        coverpro = self.packages.${prev.stdenv.hostPlatform.system}.default;
      };

      # Dev shells
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgsFor.${system};
          # Android SDK setup (uses writable SDK at ~/.local/share/android-sdk)
          androidSdkPath = "$HOME/.local/share/android-sdk";
          ndkVersion = "25.1.8937393";

          rustToolchain = pkgs.rust-bin.stable.latest.default.override {
            extensions = [ "rust-src" "rust-analyzer" ];
            targets = [
              "x86_64-unknown-linux-gnu"
              "aarch64-linux-android"
              "armv7-linux-androideabi"
              "i686-linux-android"
              "x86_64-linux-android"
            ];
          };
        in {
          default = pkgs.mkShell {
            buildInputs = tauriDeps pkgs;

            nativeBuildInputs = with pkgs; [
              pkg-config
              gobject-introspection
              wrapGAppsHook3
            ];

            packages = with pkgs; [
              nodejs_22
              bun
              rustToolchain
              cargo-tauri
              typst
              jdk17
              patchelf  # release.sh strips Nix store paths for cross-machine portability
            ];

            PKG_CONFIG_PATH = pkgs.lib.makeSearchPath "lib/pkgconfig" [
              pkgs.glib.dev
              pkgs.gtk3.dev
              pkgs.webkitgtk_4_1.dev
              pkgs.libsoup_3.dev
              pkgs.cairo.dev
              pkgs.pango.dev
              pkgs.gdk-pixbuf.dev
              pkgs.atk.dev
              pkgs.harfbuzz.dev
              pkgs.openssl.dev
              pkgs.dbus.dev
              pkgs.wayland.dev
              pkgs.libxkbcommon.dev
            ];

            shellHook = ''
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath (runtimeLibs pkgs)}:$LD_LIBRARY_PATH"
              export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"
              export WEBKIT_DISABLE_COMPOSITING_MODE=1
              export XDG_DATA_DIRS="${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:$XDG_DATA_DIRS"
              export RUST_BACKTRACE=1
              export TYPST_FONT_PATHS="/etc/profiles/per-user/$USER/share/fonts:$HOME/.local/share/fonts:/run/current-system/sw/share/fonts"

              # Java for Android builds
              export JAVA_HOME="${pkgs.jdk17}"

              # Android SDK setup
              if [ -d "${androidSdkPath}" ]; then
                export ANDROID_HOME="${androidSdkPath}"
                export ANDROID_SDK_ROOT="${androidSdkPath}"
                export NDK_HOME="${androidSdkPath}/ndk/${ndkVersion}"
                export PATH="${androidSdkPath}/platform-tools:${androidSdkPath}/cmdline-tools/latest/bin:$PATH"
                export LD_LIBRARY_PATH="${androidSdkPath}/ndk/${ndkVersion}/toolchains/llvm/prebuilt/linux-x86_64/lib64:$LD_LIBRARY_PATH"

                # NixOS fix: patch #!/bin/bash shebangs in Android SDK scripts
                if [ ! -f "/bin/bash" ]; then
                  if [ -d "$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin" ]; then
                    for f in "$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/"*-clang \
                             "$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/"*-clang++; do
                      if head -1 "$f" 2>/dev/null | grep -q '^#!/bin/bash$'; then
                        sed -i '1s|^#!/bin/bash$|#!/usr/bin/env bash|' "$f" 2>/dev/null || true
                      fi
                    done
                  fi
                  for f in "${androidSdkPath}/build-tools/"*/apksigner \
                           "${androidSdkPath}/build-tools/"*/d8; do
                    if [ -f "$f" ] && head -1 "$f" 2>/dev/null | grep -q '^#!/bin/bash$'; then
                      sed -i '1s|^#!/bin/bash$|#!/usr/bin/env bash|' "$f" 2>/dev/null || true
                    fi
                  done
                fi

                ANDROID_STATUS="found at ${androidSdkPath}"
              else
                ANDROID_STATUS="not found (install SDK to ${androidSdkPath})"
              fi

              echo "CoverPro dev environment loaded"
              echo "  Rust: $(rustc --version)"
              echo "  Bun:  $(bun --version)"
              echo "  Android SDK: $ANDROID_STATUS"
              echo ""
              echo "Dev:     cd app && bun install && bun run tauri dev"
              echo "Build:   ./build.sh  (or: cd app && bun run build && nix build)"
              echo "Android: cd app && bun run tauri android build"
            '';
          };
        });
    };
}
