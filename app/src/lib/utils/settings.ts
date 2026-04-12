import { Store } from '@tauri-apps/plugin-store';
import { getHardwiredKey } from '$lib/config/api-keys';

export interface ApiSettings {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
}

export interface ModelDiscoverySettings {
  openaiExcludedTokens: string[];
  openaiRequireGpt5Family: boolean;
  openrouterManualModels: string[];
  openrouterManualOnly: boolean;
  openrouterDiscoveryMaxResults: number;
}

export const DEFAULT_MODEL_DISCOVERY_SETTINGS: ModelDiscoverySettings = {
  openaiExcludedTokens: ['latest', 'pro', 'codex'],
  openaiRequireGpt5Family: true,
  openrouterManualModels: [
    'openai/gpt-oss-120b:free',
    'moonshotai/kimi-k2-thinking:nitro',
    'qwen/qwen3.6-plus:free',
  ],
  openrouterManualOnly: true,
  openrouterDiscoveryMaxResults: 40,
};

let store: Store | null = null;

/**
 * Get or create the settings store.
 * Store is saved to app data dir as 'settings.json' (encrypted).
 */
async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('settings.json');
  }
  return store;
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Load API keys from encrypted store.
 * Prioritizes hardwired keys (for mobile/personal use), falls back to user-entered keys.
 */
export async function loadApiSettings(): Promise<ApiSettings> {
  const s = await getStore();

  // Get hardwired keys (if configured)
  const hardwiredAnthropic = getHardwiredKey('anthropic');
  const hardwiredOpenai = getHardwiredKey('openai');
  const hardwiredOpenrouter = getHardwiredKey('openrouter');

  // Get user-stored keys (fallback)
  const storedAnthropic = await s.get<string>('anthropic_api_key') || undefined;
  const storedOpenai = await s.get<string>('openai_api_key') || undefined;
  const storedOpenrouter = await s.get<string>('openrouter_api_key') || undefined;

  return {
    // Prioritize hardwired keys, fall back to stored keys
    anthropicApiKey: hardwiredAnthropic || storedAnthropic,
    openaiApiKey: hardwiredOpenai || storedOpenai,
    openrouterApiKey: hardwiredOpenrouter || storedOpenrouter,
  };
}

/**
 * Save an API key to encrypted store.
 */
export async function saveApiKey(provider: 'anthropic' | 'openai' | 'openrouter', key: string): Promise<void> {
  const s = await getStore();
  let keyName: string;
  if (provider === 'anthropic') {
    keyName = 'anthropic_api_key';
  } else if (provider === 'openai') {
    keyName = 'openai_api_key';
  } else {
    keyName = 'openrouter_api_key';
  }
  await s.set(keyName, key);
  await s.save();
}

/**
 * Remove an API key from store.
 */
export async function clearApiKey(provider: 'anthropic' | 'openai' | 'openrouter'): Promise<void> {
  const s = await getStore();
  let keyName: string;
  if (provider === 'anthropic') {
    keyName = 'anthropic_api_key';
  } else if (provider === 'openai') {
    keyName = 'openai_api_key';
  } else {
    keyName = 'openrouter_api_key';
  }
  await s.delete(keyName);
  await s.save();
}

/**
 * Load the saved output directory for PDF exports.
 */
export async function loadOutputDir(): Promise<string> {
  const s = await getStore();
  return (await s.get<string>('output_dir')) || '';
}

/**
 * Save the output directory for PDF exports.
 */
export async function saveOutputDir(dir: string): Promise<void> {
  const s = await getStore();
  await s.set('output_dir', dir);
  await s.save();
}

/**
 * Load model discovery/filter settings for dynamic model catalogs.
 */
export async function loadModelDiscoverySettings(): Promise<ModelDiscoverySettings> {
  const s = await getStore();

  const excludedTokensRaw = await s.get<unknown>('openai_excluded_tokens');
  const requireGpt5Raw = await s.get<boolean>('openai_require_gpt5_family');
  const manualRaw = await s.get<unknown>('openrouter_manual_models');
  const manualOnlyRaw = await s.get<boolean>('openrouter_manual_only');
  const maxResultsRaw = await s.get<number>('openrouter_discovery_max_results');

  const openrouterDiscoveryMaxResults = Number.isFinite(maxResultsRaw) && (maxResultsRaw ?? 0) > 0
    ? Math.min(Math.max(Math.floor(maxResultsRaw as number), 5), 100)
    : DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterDiscoveryMaxResults;

  return {
    openaiExcludedTokens: normalizeList(excludedTokensRaw).length > 0
      ? normalizeList(excludedTokensRaw)
      : DEFAULT_MODEL_DISCOVERY_SETTINGS.openaiExcludedTokens,
    openaiRequireGpt5Family: typeof requireGpt5Raw === 'boolean'
      ? requireGpt5Raw
      : DEFAULT_MODEL_DISCOVERY_SETTINGS.openaiRequireGpt5Family,
    openrouterManualModels: normalizeList(manualRaw).length > 0
      ? normalizeList(manualRaw)
      : DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterManualModels,
    openrouterManualOnly: typeof manualOnlyRaw === 'boolean'
      ? manualOnlyRaw
      : DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterManualOnly,
    openrouterDiscoveryMaxResults,
  };
}

/**
 * Save model discovery/filter settings for dynamic model catalogs.
 */
export async function saveModelDiscoverySettings(settings: ModelDiscoverySettings): Promise<void> {
  const s = await getStore();
  await s.set('openai_excluded_tokens', settings.openaiExcludedTokens.map((token) => token.trim().toLowerCase()).filter(Boolean));
  await s.set('openai_require_gpt5_family', settings.openaiRequireGpt5Family);
  await s.set('openrouter_manual_models', settings.openrouterManualModels.map((id) => id.trim().toLowerCase()).filter(Boolean));
  await s.set('openrouter_manual_only', settings.openrouterManualOnly);
  await s.set('openrouter_discovery_max_results', Math.min(Math.max(Math.floor(settings.openrouterDiscoveryMaxResults), 5), 100));
  await s.save();
}

/**
 * Validate an API key by making a minimal test call.
 */
export async function validateApiKey(
  provider: 'anthropic' | 'openai' | 'openrouter',
  key: string
): Promise<{ valid: boolean; error?: string }> {
  // Basic format check first
  if (provider === 'anthropic' && !key.startsWith('sk-ant-')) {
    return { valid: false, error: 'Anthropic keys should start with sk-ant-' };
  }
  if (provider === 'openai' && !key.startsWith('sk-')) {
    return { valid: false, error: 'OpenAI keys should start with sk-' };
  }
  if (provider === 'openrouter' && !key.startsWith('sk-or-')) {
    return { valid: false, error: 'OpenRouter keys should start with sk-or-' };
  }

  // Test with actual API call
  try {
    const { callLlmApi } = await import('$lib/services/api-client');
    let model: string;
    let keyField: string;

    if (provider === 'anthropic') {
      model = 'claude-opus-4-6';
      keyField = 'anthropicApiKey';
    } else if (provider === 'openai') {
      model = 'gpt-5-nano';
      keyField = 'openaiApiKey';
    } else {
      model = 'openai/gpt-oss-120b:free';
      keyField = 'openrouterApiKey';
    }

    await callLlmApi(
      {
        provider,
        model,
        prompt: 'Say "OK"',
        systemMessage: '',
      },
      { [keyField]: key }
    );

    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }
}
