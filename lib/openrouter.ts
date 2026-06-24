import OpenAI from 'openai';

/**
 * OpenRouter client wrapper.
 *
 * OpenRouter is API-compatible with OpenAI, so we use the `openai` SDK
 * pointed at OpenRouter's base URL. Server-side only — the API key must
 * never reach the browser.
 *
 * The model ID is supplied per-call from `agent_config.model` (free-text,
 * configurable from the dashboard) rather than hardcoded here.
 */

const apiKey = process.env.OPENROUTER_API_KEY;
const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

if (!apiKey) {
  // Defer hard failure to call-time so the module can be imported in
  // environments where the key is not yet configured (e.g. typecheck).
  // The client below will throw a clear error when actually used.
  // eslint-disable-next-line no-console
  console.warn('OPENROUTER_API_KEY is not set — OpenRouter calls will fail.');
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

export const openrouter = new OpenAI({
  apiKey: apiKey || 'missing-openrouter-api-key',
  baseURL,
  defaultHeaders: {
    // OpenRouter ranking/attribution headers (optional but recommended).
    'HTTP-Referer': appUrl,
    'X-Title': 'WhatsApp CRM',
  },
});

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

/**
 * Thin helper that runs a chat completion and returns the assistant's
 * text reply. Throws if OpenRouter returns no content.
 */
export async function chatCompletion(
  options: ChatCompletionOptions,
): Promise<string> {
  const { model, messages, temperature } = options;

  if (!model) throw new Error('chatCompletion: model is required');
  if (!messages || messages.length === 0) {
    throw new Error('chatCompletion: messages array is required');
  }

  const completion = await openrouter.chat.completions.create({
    model,
    messages,
    temperature: temperature ?? 0.7,
  });

  const reply = completion.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error('chatCompletion: OpenRouter returned an empty reply');
  }

  return reply;
}
