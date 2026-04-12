use serde::Serialize;
use std::collections::HashMap;

#[cfg(not(target_os = "android"))]
use notify::{Event, RecursiveMode, Watcher};
#[cfg(not(target_os = "android"))]
use std::path::{Path, PathBuf};
#[cfg(not(target_os = "android"))]
use std::sync::mpsc;
#[cfg(not(target_os = "android"))]
use std::time::Duration;
#[cfg(not(target_os = "android"))]
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Debug)]
pub struct GtkTheme {
    pub colors: HashMap<String, String>,
    pub prefer_dark: bool,
}

/// On Android, return empty theme (CSS defaults / prefers-color-scheme handle it)
#[cfg(target_os = "android")]
pub fn parse_gtk_theme() -> GtkTheme {
    GtkTheme {
        colors: HashMap::new(),
        prefer_dark: false,
    }
}

#[cfg(target_os = "android")]
pub fn watch_gtk_theme(_app: tauri::AppHandle) {
    // No GTK on Android — theme handled by CSS prefers-color-scheme
}

// === Desktop-only GTK theme parsing ===

#[cfg(not(target_os = "android"))]
/// Directory containing user GTK4 config
fn gtk4_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|c| c.join("gtk-4.0"))
}

#[cfg(not(target_os = "android"))]
/// Parse `settings.ini` for `gtk-application-prefer-dark-theme`
fn read_prefer_dark(config_dir: &Path) -> bool {
    let ini_path = config_dir.join("settings.ini");
    let content = match std::fs::read_to_string(&ini_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("gtk-application-prefer-dark-theme=") {
            return val.trim().eq_ignore_ascii_case("true") || val.trim() == "1";
        }
    }
    false
}

#[cfg(not(target_os = "android"))]
/// Read `gtk.css`, follow `@import url("...")`, parse `@define-color` declarations
fn read_gtk_colors(config_dir: &Path) -> HashMap<String, String> {
    let css_path = config_dir.join("gtk.css");
    let content = match std::fs::read_to_string(&css_path) {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };

    let mut colors = HashMap::new();

    // Parse inline @define-color from user gtk.css
    parse_define_colors(&content, &mut colors);

    // Follow @import url("...") directives
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(import_path) = extract_import_path(trimmed) {
            if let Ok(imported) = std::fs::read_to_string(&import_path) {
                parse_define_colors(&imported, &mut colors);
            }
        }
    }

    colors
}

#[cfg(not(target_os = "android"))]
/// Extract path from `@import url("...");`
fn extract_import_path(line: &str) -> Option<String> {
    let line = line.trim();
    if !line.starts_with("@import") {
        return None;
    }
    // Match: @import url("path"); or @import url('path');
    if let Some(start) = line.find("url(") {
        let rest = &line[start + 4..];
        let (quote, rest) = if rest.starts_with('"') {
            ('"', &rest[1..])
        } else if rest.starts_with('\'') {
            ('\'', &rest[1..])
        } else {
            // url(path) without quotes
            if let Some(end) = rest.find(')') {
                return Some(rest[..end].trim().to_string());
            }
            return None;
        };
        if let Some(end) = rest.find(quote) {
            return Some(rest[..end].to_string());
        }
    }
    None
}

#[cfg(not(target_os = "android"))]
/// Parse `@define-color name value;` lines into the map
fn parse_define_colors(css: &str, colors: &mut HashMap<String, String>) {
    for line in css.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("@define-color") {
            let rest = rest.trim();
            // Format: name value;
            if let Some(space_pos) = rest.find(|c: char| c.is_whitespace()) {
                let name = rest[..space_pos].trim();
                let value = rest[space_pos..].trim().trim_end_matches(';').trim();
                if !name.is_empty() && !value.is_empty() {
                    colors.insert(name.to_string(), value.to_string());
                }
            }
        }
    }
}

#[cfg(not(target_os = "android"))]
/// Parse GTK4 theme from config dir
pub fn parse_gtk_theme() -> GtkTheme {
    match gtk4_config_dir() {
        Some(dir) => GtkTheme {
            colors: read_gtk_colors(&dir),
            prefer_dark: read_prefer_dark(&dir),
        },
        None => GtkTheme {
            colors: HashMap::new(),
            prefer_dark: false,
        },
    }
}

#[cfg(not(target_os = "android"))]
/// Watch `~/.config/gtk-4.0/` for changes, emit Tauri event on change
pub fn watch_gtk_theme(app: AppHandle) {
    let config_dir = match gtk4_config_dir() {
        Some(d) => d,
        None => return,
    };

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();

        let mut watcher = match notify::recommended_watcher(move |res: Result<Event, _>| {
            if let Ok(event) = res {
                if event.kind.is_modify() || event.kind.is_create() {
                    let _ = tx.send(());
                }
            }
        }) {
            Ok(w) => w,
            Err(_) => return,
        };

        if watcher.watch(&config_dir, RecursiveMode::NonRecursive).is_err() {
            return;
        }

        // Also watch the imported theme CSS if it's outside config_dir
        let imported_path = find_imported_theme_path(&config_dir);
        if let Some(ref path) = imported_path {
            let _ = watcher.watch(path, RecursiveMode::NonRecursive);
        }

        // Debounce: wait for changes, re-parse, emit
        loop {
            if rx.recv().is_err() {
                break;
            }
            // Debounce: drain any rapid successive events
            std::thread::sleep(Duration::from_millis(200));
            while rx.try_recv().is_ok() {}

            let theme = parse_gtk_theme();
            let _ = app.emit("gtk-theme-changed", &theme);
        }
    });
}

#[cfg(not(target_os = "android"))]
/// Find the directory of the imported theme CSS (for watching)
fn find_imported_theme_path(config_dir: &Path) -> Option<PathBuf> {
    let css_path = config_dir.join("gtk.css");
    let content = std::fs::read_to_string(&css_path).ok()?;
    for line in content.lines() {
        if let Some(path_str) = extract_import_path(line.trim()) {
            let path = PathBuf::from(&path_str);
            return path.parent().map(|p| p.to_path_buf());
        }
    }
    None
}
