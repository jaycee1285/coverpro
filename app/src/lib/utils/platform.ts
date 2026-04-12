import type { Platform } from '$lib/types';

let cachedPlatform: Platform | null = null;

/**
 * Detect the current platform (desktop, android, ios).
 * Result is cached for performance.
 */
export async function detectPlatform(): Promise<Platform> {
  if (cachedPlatform) return cachedPlatform;

  try {
    // Use Tauri's platform detection
    const { platform } = await import('@tauri-apps/plugin-os');
    const p = await platform();

    if (p === 'android') {
      cachedPlatform = 'android';
    } else if (p === 'ios') {
      cachedPlatform = 'ios';
    } else {
      cachedPlatform = 'desktop';
    }
  } catch (e) {
    // Fallback for browser/dev mode
    cachedPlatform = 'desktop';
  }

  return cachedPlatform;
}

/**
 * Check if current platform is desktop (Linux/macOS/Windows).
 */
export function isDesktop(platform: Platform): boolean {
  return platform === 'desktop';
}

/**
 * Check if current platform is mobile (Android/iOS).
 */
export function isMobile(platform: Platform): boolean {
  return platform === 'android' || platform === 'ios';
}
