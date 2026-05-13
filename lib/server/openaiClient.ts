import type { AiTrainingPrompt } from '@/lib/ai-training/prompts';
import { readOpenAiSettings } from '@/lib/server/feishuRepository';

type JsonObject = Record<string, any>;

export type OpenAiResponseFormat = 'text' | 'json';

const OPENAI_REQUEST_TIMEOUT_MS = 60_000;

export class OpenAiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAiConfigurationError';
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

function readErrorMessage(payload: JsonObject | null) {
  const message = payload?.error?.message ?? payload?.message ?? payload?.msg;
  return typeof message === 'string' && message.trim() ? message.trim() : '';
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<JsonObject | null>;
}

async function fetchOpenAiJson(url: string, apiKey: string, body: JsonObject) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, OPENAI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      const message = readErrorMessage(payload);
      throw new Error(message ? `OpenAI 接口请求失败：${message}` : `OpenAI 接口请求失败：${response.status}`);
    }

    return payload ?? {};
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenAI 接口请求超时：${OPENAI_REQUEST_TIMEOUT_MS / 1000} 秒`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function readChoiceText(payload: JsonObject) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
      .trim();
  }

  return '';
}

export function isOpenAiConfigurationError(error: unknown) {
  return error instanceof OpenAiConfigurationError;
}

export function isOpenAiUserFacingError(error: unknown) {
  return (
    isOpenAiConfigurationError(error) ||
    (error instanceof Error &&
      (error.message.startsWith('OpenAI 接口请求失败') || error.message.startsWith('OpenAI 接口请求超时')))
  );
}

export async function generateOpenAiText(prompt: AiTrainingPrompt, responseFormat: OpenAiResponseFormat = 'text') {
  let settings;
  try {
    settings = readOpenAiSettings();
  } catch (error) {
    const message = error instanceof Error ? error.message : '请先在基础设置里配置 OpenAI';
    throw new OpenAiConfigurationError(message);
  }

  const payload = await fetchOpenAiJson(
    `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`,
    settings.apiKey,
    {
      model: settings.model,
      messages: [
        { role: 'system', content: prompt.systemInstruction },
        { role: 'user', content: prompt.contents },
      ],
      temperature: responseFormat === 'json' ? 0.2 : 0.7,
      ...(responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    }
  );
  const text = readChoiceText(payload);
  if (!text) {
    throw new Error('OPENAI_EMPTY_RESPONSE');
  }

  return text;
}
