import type { LlmBackend } from '$lib/types';

export interface ModelOption {
  id: string;       // Value passed to CLI (e.g., 'haiku', 'gpt-5-codex')
  label: string;    // Display name in dropdown
  tier: 'cheap' | 'default' | 'strong';
}

// Hardcoded model options per backend, ordered cheap → strong.
// These are the CLI-level identifiers each agent accepts.
export const MODEL_OPTIONS: Record<LlmBackend, ModelOption[]> = {
  claude: [
    { id: 'haiku', label: 'Haiku', tier: 'cheap' },
    { id: 'sonnet', label: 'Sonnet', tier: 'default' },
    { id: 'opus', label: 'Opus', tier: 'strong' },
  ],
  codex: [
    { id: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini', tier: 'cheap' },
    { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', tier: 'default' },
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', tier: 'strong' },
  ],
  'anthropic-api': [
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', tier: 'cheap' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tier: 'default' },
    { id: 'claude-opus-4-6', label: 'Opus 4.6', tier: 'strong' },
  ],
  'openai-api': [
    { id: 'gpt-5-nano', label: 'GPT-5 Nano', tier: 'cheap' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', tier: 'default' },
    { id: 'gpt-5.2', label: 'GPT-5.2', tier: 'strong' },
  ],
  'openrouter-api': [
    { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B Free', tier: 'cheap' },
    { id: 'qwen/qwen3.6-plus:free', label: 'Qwen 3.6 Plus Free', tier: 'default' },
    { id: 'moonshotai/kimi-k2-thinking:nitro', label: 'Kimi K2 Thinking', tier: 'strong' },
  ],
};

export function getDefaultModel(backend: LlmBackend): string {
  const options = MODEL_OPTIONS[backend];
  return options.find(m => m.tier === 'default')?.id ?? options[0].id;
}

export function getCheapModel(backend: LlmBackend): string {
  const options = MODEL_OPTIONS[backend];
  return options.find(m => m.tier === 'cheap')?.id ?? options[0].id;
}

export function getStrongModel(backend: LlmBackend): string {
  const options = MODEL_OPTIONS[backend];
  return options.find(m => m.tier === 'strong')?.id ?? options[options.length - 1].id;
}

export function getModelTier(
  backend: LlmBackend,
  modelId: string | null | undefined,
): ModelOption['tier'] | null {
  if (!modelId) return null;
  return MODEL_OPTIONS[backend].find((m) => m.id === modelId)?.tier ?? null;
}

export function getModelForTier(backend: LlmBackend, tier: ModelOption['tier']): string {
  if (tier === 'cheap') return getCheapModel(backend);
  if (tier === 'strong') return getStrongModel(backend);
  return getDefaultModel(backend);
}
