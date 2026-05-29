{
  description = "CoverPro - JD Package Runner (Tauri + Svelte) — migrated";

  # To activate:
  #   cp flake.nix flake.nix.bak && cp flake.nix.proposed flake.nix
  #   nix flake update config
  #   nix develop -c bun install   # then your usual workflow
  # To revert:
  #   cp flake.nix.bak flake.nix && rm flake.nix.bak

  inputs = {
    config.url = "github:jaycee1285/config";
    nixpkgs.follows = "config/nixpkgs";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, config, rust-overlay }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

      nixpkgsFor = forAllSystems (system: import nixpkgs {
        inherit system;
        overlays = [ (import rust-overlay) ];
      });
    in {
      homeManagerModules.default = import ./nix/hm-module.nix;

      packages = forAllSystems (system:
        let
          pkgs = nixpkgsFor.${system};
          libs = config.lib.runtimeLibs pkgs;
          runtimeLibs = libs.tauri;

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
            cargoHash = "";

            buildFeatures = [ "custom-protocol" ];

            nativeBuildInputs = with pkgs; [
              pkg-config wrapGAppsHook3 makeWrapper
            ];

            # libs.tauri + build-time extras (librsvg, atk, harfbuzz used by wrapGAppsHook3)
            buildInputs = libs.tauri ++ (with pkgs; [
              librsvg atk harfbuzz
            ]);

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
                --prefix LD_LIBRARY_PATH : "${pkgs.lib.makeLibraryPath runtimeLibs}"
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

      libs.declared = {
        categories = [ "tauri" ];
        local = [ "librsvg" "atk" "harfbuzz" "typst" ];
      };

      overlays.default = final: prev: {
        coverpro = self.packages.${prev.stdenv.hostPlatform.system}.default;
      };

      devShells = forAllSystems (system:
        let
          pkgs = nixpkgsFor.${system};
          libs = config.lib.runtimeLibs pkgs;
          tauriLibs = libs.tauri;
          androidSdkPath = "$HOME/.local/share/android-sdk";
          ndkVersion = "27.2.12479018";

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
            buildInputs = tauriLibs ++ (with pkgs; [
              librsvg atk harfbuzz wayland-protocols
            ]);

            nativeBuildInputs = with pkgs; [
              pkg-config gobject-introspection wrapGAppsHook3
            ];

            packages = with pkgs; [
              nodejs_22 bun rustToolchain cargo-tauri typst jdk17 patchelf
            ];

            PKG_CONFIG_PATH = pkgs.lib.makeSearchPath "lib/pkgconfig" [
              pkgs.glib.dev pkgs.gtk3.dev pkgs.webkitgtk_4_1.dev
              pkgs.libsoup_3.dev pkgs.cairo.dev pkgs.pango.dev
              pkgs.gdk-pixbuf.dev pkgs.atk.dev pkgs.harfbuzz.dev
              pkgs.openssl.dev pkgs.dbus.dev pkgs.wayland.dev
              pkgs.libxkbcommon.dev
            ];

            shellHook = ''
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath tauriLibs}:$LD_LIBRARY_PATH"
              export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"
              export WEBKIT_DISABLE_COMPOSITING_MODE=1
              export XDG_DATA_DIRS="${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:$XDG_DATA_DIRS"
              export RUST_BACKTRACE=1
              export TYPST_FONT_PATHS="/etc/profiles/per-user/$USER/share/fonts:$HOME/.local/share/fonts:/run/current-system/sw/share/fonts"
              export JAVA_HOME="${pkgs.jdk17}"

              if [ -d "${androidSdkPath}" ]; then
                export ANDROID_HOME="${androidSdkPath}"
                export ANDROID_SDK_ROOT="${androidSdkPath}"
                export NDK_HOME="${androidSdkPath}/ndk/${ndkVersion}"
                export PATH="${androidSdkPath}/platform-tools:${androidSdkPath}/cmdline-tools/latest/bin:$PATH"
                export LD_LIBRARY_PATH="${androidSdkPath}/ndk/${ndkVersion}/toolchains/llvm/prebuilt/linux-x86_64/lib64:$LD_LIBRARY_PATH"
                ANDROID_STATUS="found at ${androidSdkPath}"
              else
                ANDROID_STATUS="not found (install SDK to ${androidSdkPath})"
              fi

              echo "CoverPro dev environment loaded (migrated to config-canary shared libs)"
              echo "  Rust: $(rustc --version)"
              echo "  Bun:  $(bun --version)"
              echo "  Android SDK: $ANDROID_STATUS"
            '';
          };
        });
    };
}
