import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface GtkTheme {
  colors: Record<string, string>;
  prefer_dark: boolean;
}

// Vars that use rgb(var(...) / alpha) in component CSS — must be set as "R G B" triplets
const TRIPLET_VARS = new Set([
  '--color-success-500',
  '--color-warning-500',
  '--color-error-500',
]);

// GTK color name → CSS variable, with fallback chains
const COLOR_MAP: [string, string[]][] = [
  ['--bg-primary',        ['window_bg_color']],
  ['--bg-secondary',      ['headerbar_backdrop_color', 'shade_color', 'window_bg_color']],
  ['--bg-card',           ['card_bg_color', 'view_bg_color', 'window_bg_color']],
  ['--bg-input',          ['view_bg_color', 'window_bg_color']],
  ['--bg-hover',          ['shade_color', 'headerbar_backdrop_color']],
  ['--bg-active',         ['accent_bg_color']],
  ['--text-primary',      ['window_fg_color']],
  ['--text-secondary',    ['sidebar_fg_color', 'view_fg_color', 'window_fg_color']],
  ['--text-muted',        ['headerbar_fg_color', 'window_fg_color']],
  ['--border-color',      ['headerbar_border_color', 'borders', 'shade_color']],
  ['--accent-color',      ['accent_color']],
  ['--accent-hover',      ['accent_bg_color', 'accent_color']],
  ['--color-success-500', ['success_color']],
  ['--color-warning-500', ['warning_color']],
  ['--color-error-500',   ['error_color']],
];

/** Convert "#rrggbb" or "rgb(r, g, b)" to "R G B" triplet string */
function toTriplet(color: string): string | null {
  // Hex: #rgb or #rrggbb
  const hex = color.trim();
  if (hex.startsWith('#')) {
    const h = hex.slice(1);
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return `${r} ${g} ${b}`;
    }
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `${r} ${g} ${b}`;
    }
  }
  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return `${rgbMatch[1]} ${rgbMatch[2]} ${rgbMatch[3]}`;
  }
  return null;
}

function applyTheme(theme: GtkTheme) {
  const root = document.documentElement;
  for (const [cssVar, gtkNames] of COLOR_MAP) {
    for (const name of gtkNames) {
      const value = theme.colors[name];
      if (value) {
        if (TRIPLET_VARS.has(cssVar)) {
          const triplet = toTriplet(value);
          if (triplet) root.style.setProperty(cssVar, triplet);
        } else {
          root.style.setProperty(cssVar, value);
        }
        break;
      }
    }
  }
}

export async function initTheme() {
  try {
    const theme = await invoke<GtkTheme>('get_gtk_colors');
    applyTheme(theme);
  } catch {
    // Not in Tauri (e.g. vite dev without tauri) — keep CSS defaults
  }
}

export async function listenForThemeChanges() {
  try {
    await listen<GtkTheme>('gtk-theme-changed', (event) => {
      applyTheme(event.payload);
    });
  } catch {
    // Not in Tauri
  }
}
