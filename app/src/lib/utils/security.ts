import { Store } from '@tauri-apps/plugin-store';

const CORRECT_PIN = '11411';
const LOCKOUT_DELAY_MS = 5000; // 5 seconds after 2 failed attempts

interface SecurityState {
  unlocked: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
}

let state: SecurityState = {
  unlocked: false,
  failedAttempts: 0,
  lockedUntil: null,
};

let store: Store | null = null;

/**
 * Get or create the security store.
 */
async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('security.json');
  }
  return store;
}

/**
 * Initialize security state.
 * Loads the stored PIN hash if it exists.
 */
export async function initSecurity(): Promise<void> {
  // In a real implementation, you might load a hashed PIN from the store
  // For now, we just reset the state
  state = {
    unlocked: false,
    failedAttempts: 0,
    lockedUntil: null,
  };
}

/**
 * Check if the app is currently locked due to failed attempts.
 */
export function isLocked(): boolean {
  if (state.lockedUntil === null) return false;

  const now = Date.now();
  if (now < state.lockedUntil) {
    return true;
  }

  // Lockout period expired, reset
  state.lockedUntil = null;
  state.failedAttempts = 0;
  return false;
}

/**
 * Get remaining lockout time in milliseconds.
 * Returns 0 if not locked.
 */
export function getRemainingLockoutTime(): number {
  if (state.lockedUntil === null) return 0;

  const remaining = state.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Verify a PIN attempt.
 * Returns true if correct, false if incorrect.
 * Implements 5-second lockout after 2 failed attempts.
 */
export function verifyPin(pin: string): boolean {
  // Check if currently locked
  if (isLocked()) {
    return false;
  }

  // Verify PIN
  if (pin === CORRECT_PIN) {
    state.unlocked = true;
    state.failedAttempts = 0;
    state.lockedUntil = null;
    return true;
  }

  // Incorrect PIN
  state.failedAttempts++;

  // Lock after 2 failed attempts
  if (state.failedAttempts >= 2) {
    state.lockedUntil = Date.now() + LOCKOUT_DELAY_MS;
  }

  return false;
}

/**
 * Check if the app is currently unlocked.
 */
export function isUnlocked(): boolean {
  return state.unlocked;
}

/**
 * Lock the app (clear unlocked state).
 */
export function lock(): void {
  state.unlocked = false;
}

/**
 * Get the number of failed attempts.
 */
export function getFailedAttempts(): number {
  return state.failedAttempts;
}

/**
 * Update the PIN (for future enhancement).
 */
export async function updatePin(oldPin: string, newPin: string): Promise<boolean> {
  if (oldPin !== CORRECT_PIN) {
    return false;
  }

  // In a real implementation, you would hash and store the new PIN
  // For now, this would require editing the source code
  console.warn('PIN update not yet implemented - edit CORRECT_PIN in security.ts');

  return false;
}
