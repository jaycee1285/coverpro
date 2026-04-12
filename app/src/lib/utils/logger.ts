/**
 * Simple file logger for debugging API calls.
 * Logs are written to /tmp/coverpro-debug.log
 */

let logBuffer: string[] = [];
let writePromise: Promise<void> | null = null;

async function writeToFile() {
  if (logBuffer.length === 0) return;

  const lines = logBuffer.splice(0, logBuffer.length);
  const content = lines.join('\n') + '\n';

  try {
    // Check if we're in Tauri environment
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('append_to_file', {
        path: '/tmp/coverpro-debug.log',
        content
      });
    }
  } catch (err) {
    console.error('Failed to write log:', err);
  }

  writePromise = null;
}

function scheduleWrite() {
  if (!writePromise) {
    writePromise = new Promise((resolve) => {
      setTimeout(async () => {
        await writeToFile();
        resolve();
      }, 100);
    });
  }
}

export function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;

  // Also log to console
  console.log(line);

  // Add to buffer
  logBuffer.push(line);
  scheduleWrite();
}

export function logError(message: string, error?: unknown) {
  const timestamp = new Date().toISOString();
  const errorStr = error instanceof Error ? error.message : String(error);
  const line = `[${timestamp}] ERROR: ${message} - ${errorStr}`;

  console.error(line);
  logBuffer.push(line);
  scheduleWrite();
}

export function logObject(label: string, obj: unknown) {
  const timestamp = new Date().toISOString();
  const json = JSON.stringify(obj, null, 2);
  const line = `[${timestamp}] ${label}:\n${json}`;

  console.log(line);
  logBuffer.push(line);
  scheduleWrite();
}
