import type { ApiSettings } from '$lib/utils/settings';
import { log, logError, logObject } from '$lib/utils/logger';

export interface ApiRequestOptions {
  provider: 'anthropic' | 'openai' | 'openrouter';
  model: string;
  prompt: string;
  systemMessage?: string;
  signal?: AbortSignal;
  temperature?: number;
}

export interface ApiResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cost?: number;
  };
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .filter(Boolean);

    return textParts.join('\n').trim();
  }

  return '';
}

/**
 * Call Anthropic API with prompt caching.
 * System message is cached using ephemeral cache_control.
 */
async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  systemMessage: string,
  signal?: AbortSignal,
  temperature = 0.7
): Promise<ApiResponse> {
  log(`Calling Anthropic API with model: ${model}`);
  log(`Anthropic API key starts with: ${apiKey.substring(0, 10)}...`);
  const url = 'https://api.anthropic.com/v1/messages';

  // Build messages with prompt caching on system message
  const messages = [
    {
      role: 'user',
      content: prompt, // JD + custom instructions - varies per job
    },
  ];

  const body = {
    model,
    max_tokens: 8192,
    temperature,
    system: systemMessage
      ? [
          {
            type: 'text',
            text: systemMessage,
            cache_control: { type: 'ephemeral' }, // Cache system message
          },
        ]
      : undefined,
    messages,
  };

  log(`Anthropic request body (model: ${model}, has_system: ${!!systemMessage}, prompt_length: ${prompt.length})`);

  let response;
  try {
    log(`Attempting fetch to ${url}`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    // Only add beta header if using prompt caching
    if (systemMessage) {
      headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
    }

    log(`Headers: ${JSON.stringify(Object.keys(headers))}`);

    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    log(`Fetch completed, status: ${response.status}`);
  } catch (fetchErr) {
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    const errStack = fetchErr instanceof Error ? fetchErr.stack : 'no stack';
    logError(`Anthropic fetch failed: ${errMsg}`, errStack);

    // Try a simple test fetch to see if it's the endpoint
    try {
      const testResp = await fetch('https://httpbin.org/get');
      log(`Test fetch to httpbin succeeded: ${testResp.ok}`);
    } catch {
      log('Test fetch to httpbin also failed - network might be down');
    }

    throw new Error(`Anthropic fetch failed: ${errMsg}`);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    logError(`Anthropic API error (${response.status})`, errorBody);
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  logObject('Anthropic response', data);

  if (!data.content || !data.content[0] || !data.content[0].text) {
    throw new Error(`Unexpected Anthropic response structure: ${JSON.stringify(data)}`);
  }

  const text = data.content[0].text;
  if (!text) {
    throw new Error('Anthropic response has no content');
  }

  return {
    text,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      cacheReadTokens: data.usage?.cache_read_input_tokens,
      cacheWriteTokens: data.usage?.cache_creation_input_tokens,
      cost: typeof data.usage?.cost === 'number' ? data.usage.cost : undefined,
    },
  };
}

/**
 * Call OpenAI API with automatic prompt caching.
 * OpenAI caches common prefixes >= 1024 tokens automatically.
 */
async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  systemMessage: string,
  signal?: AbortSignal,
  temperature = 0.7
): Promise<ApiResponse> {
  log(`Calling OpenAI API with model: ${model}`);
  const url = 'https://api.openai.com/v1/chat/completions';

  // OpenAI automatically caches prompts >= 1024 tokens with common prefixes
  const messages = systemMessage
    ? [
        {
          role: 'system',
          content: systemMessage, // Stable instruction block - auto-cached
        },
        {
          role: 'user',
          content: prompt, // JD-specific content
        },
      ]
    : [
        {
          role: 'user',
          content: prompt,
        },
      ];

  const body = {
    model,
    messages,
    max_completion_tokens: 8192, // GPT-5+ models use max_completion_tokens instead of max_tokens
    temperature,
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    logError('OpenAI fetch failed', fetchErr);
    throw new Error(`OpenAI fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    logError(`OpenAI API error (${response.status})`, errorBody);
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  logObject('OpenAI response', data);

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error(`Unexpected OpenAI response structure: ${JSON.stringify(data)}`);
  }

  const text = data.choices[0].message.content;
  if (!text) {
    throw new Error('OpenAI response has no content');
  }

  return {
    text,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens,
      cost: typeof data.usage?.cost === 'number' ? data.usage.cost : undefined,
    },
  };
}

/**
 * Call OpenRouter API.
 * Uses OpenAI-compatible format with OpenRouter models.
 */
async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  systemMessage: string,
  signal?: AbortSignal,
  temperature = 0.7
): Promise<ApiResponse> {
  log(`Calling OpenRouter API with model: ${model}`);
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  // OpenRouter uses OpenAI-compatible message format
  const messages = systemMessage
    ? [
        {
          role: 'system',
          content: systemMessage,
        },
        {
          role: 'user',
          content: prompt,
        },
      ]
    : [
        {
          role: 'user',
          content: prompt,
        },
      ];

  const body = {
    model,
    messages,
    max_tokens: 8192,
    temperature,
  };

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (fetchErr) {
      logError('OpenRouter fetch failed', fetchErr);
      throw new Error(`OpenRouter fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      logError(`OpenRouter API error (${response.status})`, errorBody);
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    logObject('OpenRouter response', data);

    if (!data.choices || !data.choices[0]) {
      throw new Error(`Unexpected OpenRouter response structure: ${JSON.stringify(data)}`);
    }

    const choice = data.choices[0];
    const message = choice.message;
    log(`OpenRouter choice: ${JSON.stringify(choice)}`);

    // OpenRouter supports both chat completions (message.content)
    // and non-chat completions (choice.text).
    let text = extractTextFromContent(message?.content);
    if (!text && typeof choice.text === 'string') {
      text = choice.text.trim();
    }

    if (text) {
      return {
        text,
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens,
          cost: typeof data.usage?.cost === 'number' ? data.usage.cost : undefined,
        },
      };
    }

    const completionTokens = data.usage?.completion_tokens ?? 0;
    const finishReason = choice.finish_reason ?? choice.native_finish_reason ?? null;
    const providerError = choice.error?.message ?? choice.error?.code ?? null;
    log(`OpenRouter empty completion. finish_reason=${finishReason}, completion_tokens=${completionTokens}, attempt=${attempt}/${maxAttempts}`);

    if (providerError) {
      throw new Error(`OpenRouter provider error: ${providerError}`);
    }

    if (attempt < maxAttempts) {
      log('Retrying OpenRouter request once due to empty completion');
      continue;
    }

    throw new Error(
      `OpenRouter returned an empty completion (finish_reason: ${finishReason ?? 'null'}, completion_tokens: ${completionTokens}) after retry. ` +
      `Try switching models. Raw choice: ${JSON.stringify(choice)}`
    );
  }

  throw new Error('OpenRouter request failed without a usable completion');
}

/**
 * Unified API client - calls Anthropic, OpenAI, or OpenRouter based on provider.
 */
export async function callLlmApi(
  options: ApiRequestOptions,
  settings: ApiSettings
): Promise<ApiResponse> {
  const { provider, model, prompt, systemMessage = '', signal, temperature = 0.7 } = options;

  let apiKey: string | undefined;
  if (provider === 'anthropic') {
    apiKey = settings.anthropicApiKey;
  } else if (provider === 'openai') {
    apiKey = settings.openaiApiKey;
  } else {
    apiKey = settings.openrouterApiKey;
  }

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Please configure in Settings.`);
  }

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, prompt, systemMessage, signal, temperature);
  } else if (provider === 'openai') {
    return callOpenAI(apiKey, model, prompt, systemMessage, signal, temperature);
  } else {
    return callOpenRouter(apiKey, model, prompt, systemMessage, signal, temperature);
  }
}

/**
 * Check if an error suggests we should try fallback (rate limit, capacity, etc.)
 */
export function shouldFallbackToApi(error: string): boolean {
  const fallbackIndicators = [
    'rate limit',
    'rate_limit',
    'quota exceeded',
    'too many requests',
    '429',
    '503',
    'service unavailable',
    'capacity',
    'overloaded',
  ];
  const lower = error.toLowerCase();
  return fallbackIndicators.some((indicator) => lower.includes(indicator));
}
