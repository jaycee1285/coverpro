import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { MODEL_OPTIONS, type ModelOption } from '$lib/config/models';
import type { LlmBackend } from '$lib/types';
import { DEFAULT_MODEL_DISCOVERY_SETTINGS, type ApiSettings, type ModelDiscoverySettings } from '$lib/utils/settings';

type ApiBackend = 'anthropic-api' | 'openai-api' | 'openrouter-api';

interface CacheEntry {
  options: ModelOption[];
  fetchedAt: number;
  settingsKey: string;
}

interface AnthropicModel {
  id: string;
  display_name?: string;
  created_at?: string;
}

interface OpenAIModel {
  id: string;
  created?: number;
}

interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  created?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
  };
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const modelCache = new Map<ApiBackend, CacheEntry>();

const ANTHROPIC_MODEL_LIMIT = 3;
const ANTHROPIC_TARGETS: Array<{ family: 'haiku' | 'sonnet' | 'opus'; version: string; tier: ModelOption['tier'] }> = [
  { family: 'haiku', version: '4-5', tier: 'cheap' },
  { family: 'sonnet', version: '4-6', tier: 'default' },
  { family: 'opus', version: '4-6', tier: 'strong' },
];

function isApiBackend(backend: LlmBackend): backend is ApiBackend {
  return backend === 'anthropic-api' || backend === 'openai-api' || backend === 'openrouter-api';
}

function dedupeById(options: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  const deduped: ModelOption[] = [];
  for (const option of options) {
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    deduped.push(option);
  }
  return deduped;
}

function normalizeDiscoveryList(list: string[] | undefined, fallback: string[]): string[] {
  const normalized = (list ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (normalized.length === 0) {
    return [...fallback];
  }
  return Array.from(new Set(normalized));
}

function effectiveDiscoverySettings(settings?: ModelDiscoverySettings): ModelDiscoverySettings {
  const merged = settings ?? DEFAULT_MODEL_DISCOVERY_SETTINGS;

  return {
    openaiExcludedTokens: normalizeDiscoveryList(
      merged.openaiExcludedTokens,
      DEFAULT_MODEL_DISCOVERY_SETTINGS.openaiExcludedTokens
    ),
    openaiRequireGpt5Family: typeof merged.openaiRequireGpt5Family === 'boolean'
      ? merged.openaiRequireGpt5Family
      : DEFAULT_MODEL_DISCOVERY_SETTINGS.openaiRequireGpt5Family,
    openrouterManualModels: normalizeDiscoveryList(
      merged.openrouterManualModels,
      DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterManualModels
    ),
    openrouterManualOnly: typeof merged.openrouterManualOnly === 'boolean'
      ? merged.openrouterManualOnly
      : DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterManualOnly,
    openrouterDiscoveryMaxResults: Number.isFinite(merged.openrouterDiscoveryMaxResults)
      ? Math.min(Math.max(Math.floor(merged.openrouterDiscoveryMaxResults), 5), 100)
      : DEFAULT_MODEL_DISCOVERY_SETTINGS.openrouterDiscoveryMaxResults,
  };
}

function discoverySettingsKey(backend: ApiBackend, settings: ModelDiscoverySettings): string {
  if (backend === 'anthropic-api') {
    return 'anthropic-fixed-v1';
  }
  if (backend === 'openai-api') {
    return `openai:${settings.openaiRequireGpt5Family ? 'gpt5' : 'any'}:${settings.openaiExcludedTokens.join(',')}`;
  }
  return `openrouter:${settings.openrouterManualModels.join(',')}:${settings.openrouterManualOnly ? 'manual-only' : 'mixed'}:${settings.openrouterDiscoveryMaxResults}`;
}

function canonicalAnthropicModelId(id: string): string {
  // Collapse dated snapshots like claude-opus-4-5-20251101 to claude-opus-4-5
  return id.replace(/-20\d{6}$/, '');
}

function choosePreferredAnthropicModel(a: AnthropicModel, b: AnthropicModel): AnthropicModel {
  const aHasDateSuffix = /-20\d{6}$/.test(a.id);
  const bHasDateSuffix = /-20\d{6}$/.test(b.id);

  // Prefer non-dated canonical alias when both represent same model family.
  if (aHasDateSuffix !== bHasDateSuffix) {
    return aHasDateSuffix ? b : a;
  }

  const aCreated = Date.parse(a.created_at ?? '');
  const bCreated = Date.parse(b.created_at ?? '');
  return (Number.isFinite(bCreated) ? bCreated : 0) > (Number.isFinite(aCreated) ? aCreated : 0) ? b : a;
}

function createdAtTime(value: string | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesAnthropicTarget(model: AnthropicModel, family: string, version: string): boolean {
  const canonical = canonicalAnthropicModelId(model.id).toLowerCase();
  return canonical.startsWith(`claude-${family}-${version}`);
}

function tierFromNameAndSize(name: string, sizeB: number | null): ModelOption['tier'] {
  const lower = name.toLowerCase();
  if (lower.includes('nano') || lower.includes('haiku')) return 'cheap';
  if (lower.includes('mini') || lower.includes('small')) return 'default';
  if (lower.includes('opus') || lower.includes('pro') || lower.includes('thinking')) return 'strong';

  if (sizeB !== null) {
    if (sizeB >= 100) return 'strong';
    if (sizeB >= 25) return 'default';
    return 'cheap';
  }

  return 'default';
}

function extractParamSizeB(text: string): number | null {
  const matches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*[bB]\b/g));
  if (matches.length === 0) return null;
  const sizes = matches
    .map((m) => Number.parseFloat(m[1]))
    .filter((n) => Number.isFinite(n));
  if (sizes.length === 0) return null;
  return Math.max(...sizes);
}

function isOpenAIChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (!(lower.startsWith('gpt-') || lower.startsWith('chatgpt') || /^o\d/.test(lower))) {
    return false;
  }

  const blocked = [
    'embedding',
    'tts',
    'transcribe',
    'realtime',
    'audio',
    'whisper',
    'dall-e',
    'image',
    'moderation',
    'omni-moderation'
  ];

  return !blocked.some((token) => lower.includes(token));
}

function isOpenAI5Family(id: string): boolean {
  const lower = id.toLowerCase();
  return lower.startsWith('gpt-5') || lower.startsWith('chatgpt-5');
}

function passesOpenAIPrefilter(id: string, settings: ModelDiscoverySettings): boolean {
  const lower = id.toLowerCase();
  if (settings.openaiRequireGpt5Family && !isOpenAI5Family(lower)) return false;
  if (settings.openaiExcludedTokens.some((token) => lower.includes(token))) return false;
  return true;
}

function parseSnapshotDate(id: string): number | null {
  const compact = id.match(/-(20\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    const ts = Date.parse(`${compact[1]}-${compact[2]}-${compact[3]}T00:00:00Z`);
    return Number.isFinite(ts) ? ts : null;
  }

  const dashed = id.match(/-(20\d{2})-(\d{2})-(\d{2})$/);
  if (dashed) {
    const ts = Date.parse(`${dashed[1]}-${dashed[2]}-${dashed[3]}T00:00:00Z`);
    return Number.isFinite(ts) ? ts : null;
  }

  return null;
}

function canonicalOpenAIModelId(id: string): string {
  return id
    .replace(/-(20\d{2})-(\d{2})-(\d{2})$/, '')
    .replace(/-(20\d{2})(\d{2})(\d{2})$/, '');
}

function choosePreferredOpenAIModel(a: OpenAIModel, b: OpenAIModel): OpenAIModel {
  const aDate = parseSnapshotDate(a.id);
  const bDate = parseSnapshotDate(b.id);
  const aHasDate = aDate !== null;
  const bHasDate = bDate !== null;

  // Prefer non-dated canonical model over dated snapshots.
  if (aHasDate !== bHasDate) {
    return aHasDate ? b : a;
  }

  // If both dated, prefer newer date.
  if (aHasDate && bHasDate) {
    if (aDate !== bDate) {
      return (bDate ?? 0) > (aDate ?? 0) ? b : a;
    }
  }

  // Fallback: prefer higher model score, then created timestamp.
  const scoreDelta = openAIModeScore(b.id) - openAIModeScore(a.id);
  if (scoreDelta !== 0) {
    return scoreDelta > 0 ? b : a;
  }

  return (b.created ?? 0) > (a.created ?? 0) ? b : a;
}

function openAIModeScore(id: string): number {
  const lower = id.toLowerCase();
  let score = 0;
  const major = lower.match(/gpt-(\d+(?:\.\d+)?)/);
  if (major) {
    score += Number.parseFloat(major[1]) * 1000;
  }
  if (lower.includes('nano')) score -= 200;
  if (lower.includes('mini')) score -= 100;
  if (lower.includes('preview')) score += 15;
  if (lower.includes('pro')) score += 100;
  return score;
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelOption[]> {
  const response = await tauriFetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  if (!response.ok) {
    throw new Error(`Anthropic model list failed (${response.status})`);
  }

  const payload = await response.json() as { data?: AnthropicModel[] };
  const models = (payload.data ?? [])
    .filter((model) => model.id.toLowerCase().includes('claude'))
    .filter((model) => !model.id.toLowerCase().includes('latest'));

  // Deduplicate dated snapshots by canonical model id, preferring canonical aliases.
  const preferredByCanonical = new Map<string, AnthropicModel>();
  for (const model of models) {
    const canonical = canonicalAnthropicModelId(model.id);
    const existing = preferredByCanonical.get(canonical);
    if (!existing) {
      preferredByCanonical.set(canonical, model);
      continue;
    }
    preferredByCanonical.set(canonical, choosePreferredAnthropicModel(existing, model));
  }

  const latestModels = Array.from(preferredByCanonical.values())
    .sort((a, b) => createdAtTime(b.created_at) - createdAtTime(a.created_at));

  const selectedModels: ModelOption[] = [];
  const selectedIds = new Set<string>();

  // Preferred Anthropic trio: haiku 4.5, sonnet 4.6, opus 4.6.
  for (const target of ANTHROPIC_TARGETS) {
    const candidate = latestModels
      .filter((model) => matchesAnthropicTarget(model, target.family, target.version))
      .sort((a, b) => createdAtTime(b.created_at) - createdAtTime(a.created_at))[0];

    if (!candidate || selectedIds.has(candidate.id)) continue;
    selectedIds.add(candidate.id);
    selectedModels.push({
      id: candidate.id,
      label: candidate.display_name?.trim() || candidate.id,
      tier: target.tier,
    });
  }

  // Fill any gaps from newest remaining models.
  for (const model of latestModels) {
    if (selectedModels.length >= ANTHROPIC_MODEL_LIMIT) break;
    if (selectedIds.has(model.id)) continue;
    selectedIds.add(model.id);

    const label = model.display_name?.trim() || model.id;
    selectedModels.push({
      id: model.id,
      label,
      tier: tierFromNameAndSize(label, extractParamSizeB(`${label} ${model.id}`)),
    });
  }

  return dedupeById(selectedModels);
}

async function fetchOpenAIModels(apiKey: string, settings: ModelDiscoverySettings): Promise<ModelOption[]> {
  const response = await tauriFetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI model list failed (${response.status})`);
  }

  const payload = await response.json() as { data?: OpenAIModel[] };
  const models = (payload.data ?? [])
    .filter((model) => isOpenAIChatModel(model.id))
    .filter((model) => passesOpenAIPrefilter(model.id, settings));

  // Collapse dated snapshots into canonical IDs (e.g. gpt-5-nano-2025-08-07 -> gpt-5-nano).
  const preferredByCanonical = new Map<string, OpenAIModel>();
  for (const model of models) {
    const canonical = canonicalOpenAIModelId(model.id);
    const existing = preferredByCanonical.get(canonical);
    if (!existing) {
      preferredByCanonical.set(canonical, model);
      continue;
    }
    preferredByCanonical.set(canonical, choosePreferredOpenAIModel(existing, model));
  }

  const dedupedModels = Array.from(preferredByCanonical.values()).sort((a, b) => {
    const delta = openAIModeScore(b.id) - openAIModeScore(a.id);
    if (delta !== 0) return delta;
    return b.id.localeCompare(a.id);
  });

  const options = dedupedModels.map((model) => {
    const label = model.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      id: model.id,
      label,
      tier: tierFromNameAndSize(model.id, extractParamSizeB(model.id)),
    } satisfies ModelOption;
  });

  return dedupeById(options);
}

function isTextOnlyModel(model: OpenRouterModel): boolean {
  const input = model.architecture?.input_modalities;
  const output = model.architecture?.output_modalities;

  if (input && input.length > 0 && output && output.length > 0) {
    const onlyTextInput = input.every((m) => m === 'text');
    const onlyTextOutput = output.every((m) => m === 'text');
    return onlyTextInput && onlyTextOutput;
  }

  const modality = model.architecture?.modality?.toLowerCase() ?? '';
  if (!modality) return false;
  return modality.includes('text') && !modality.includes('image') && !modality.includes('audio');
}

function numericPrice(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function isFreeModel(model: OpenRouterModel): boolean {
  if (model.id.endsWith(':free')) {
    return true;
  }

  if (model.pricing?.prompt === undefined || model.pricing?.completion === undefined) {
    return false;
  }

  const prompt = numericPrice(model.pricing.prompt);
  const completion = numericPrice(model.pricing.completion);
  const request = numericPrice(model.pricing.request);
  return prompt === 0 && completion === 0 && request === 0;
}

function modelStrengthScore(model: OpenRouterModel): number {
  const size = extractParamSizeB(`${model.id} ${model.name ?? ''} ${model.description ?? ''}`);
  if (size !== null) return size;
  const created = model.created ?? 0;
  return created / 1_000_000_000;
}

function openRouterLabel(model: OpenRouterModel): string {
  const size = extractParamSizeB(`${model.id} ${model.name ?? ''} ${model.description ?? ''}`);
  const base = model.name?.trim() || model.id;
  const sizeSuffix = size !== null ? ` • ${size}B` : '';
  const freeSuffix = isFreeModel(model) ? ' (Free)' : '';
  return `${base}${sizeSuffix}${freeSuffix}`;
}

async function fetchOpenRouterModels(apiKey: string | undefined, settings: ModelDiscoverySettings): Promise<ModelOption[]> {
  const manualModelIds = settings.openrouterManualModels;
  const manualOnly = settings.openrouterManualOnly;
  const maxResults = settings.openrouterDiscoveryMaxResults;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await tauriFetch('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`OpenRouter model list failed (${response.status})`);
  }

  const payload = await response.json() as { data?: OpenRouterModel[] };
  const allModels = payload.data ?? [];
  const modelsByLowerId = new Map<string, OpenRouterModel>(
    allModels.map((model) => [model.id.toLowerCase(), model])
  );
  const manualOptions = manualModelIds.map((id) => {
    const model = modelsByLowerId.get(id.toLowerCase());
    if (!model) {
      return {
        id,
        label: id,
        tier: tierFromNameAndSize(id, extractParamSizeB(id)),
      } satisfies ModelOption;
    }
    const size = extractParamSizeB(`${model.id} ${model.name ?? ''} ${model.description ?? ''}`);
    return {
      id: model.id,
      label: openRouterLabel(model),
      tier: tierFromNameAndSize(model.id, size),
    } satisfies ModelOption;
  });

  if (manualOnly) {
    return dedupeById(manualOptions);
  }

  const discovered = allModels
    .filter((model) => isTextOnlyModel(model))
    .sort((a, b) => modelStrengthScore(b) - modelStrengthScore(a))
    .slice(0, maxResults)
    .map((model) => {
      const size = extractParamSizeB(`${model.id} ${model.name ?? ''} ${model.description ?? ''}`);
      return {
        id: model.id,
        label: openRouterLabel(model),
        tier: tierFromNameAndSize(model.id, size),
      } satisfies ModelOption;
    });

  return dedupeById([...manualOptions, ...discovered]);
}

export async function discoverModelsForBackend(
  backend: LlmBackend,
  settings: ApiSettings,
  forceRefresh = false,
  discoverySettings?: ModelDiscoverySettings
): Promise<ModelOption[]> {
  if (!isApiBackend(backend)) {
    return MODEL_OPTIONS[backend];
  }

  const activeDiscoverySettings = effectiveDiscoverySettings(discoverySettings);
  const cacheKey = discoverySettingsKey(backend, activeDiscoverySettings);

  const cached = modelCache.get(backend);
  if (!forceRefresh && cached && cached.settingsKey === cacheKey && Date.now() - cached.fetchedAt < DISCOVERY_TTL_MS) {
    return cached.options;
  }

  let options: ModelOption[] = [];
  try {
    if (backend === 'anthropic-api') {
      if (!settings.anthropicApiKey) return MODEL_OPTIONS[backend];
      options = await fetchAnthropicModels(settings.anthropicApiKey);
    } else if (backend === 'openai-api') {
      if (!settings.openaiApiKey) return MODEL_OPTIONS[backend];
      options = await fetchOpenAIModels(settings.openaiApiKey, activeDiscoverySettings);
    } else {
      options = await fetchOpenRouterModels(settings.openrouterApiKey, activeDiscoverySettings);
    }
  } catch (err) {
    console.warn(`Model discovery failed for ${backend}:`, err);
    options = [];
  }

  const fallback = MODEL_OPTIONS[backend];
  // OpenRouter should not silently reintroduce fallback models when manual/discovered
  // models are available.
  const merged = backend === 'openrouter-api'
    ? dedupeById(options.length > 0 ? options : fallback)
    : dedupeById(options.length > 0 ? [...options, ...fallback] : fallback);

  modelCache.set(backend, {
    options: merged,
    fetchedAt: Date.now(),
    settingsKey: cacheKey,
  });

  return merged;
}

export function clearDiscoveredModelCache(backend?: ApiBackend): void {
  if (backend) {
    modelCache.delete(backend);
    return;
  }
  modelCache.clear();
}
