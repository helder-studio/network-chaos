import { hostOf, pathOf } from './rules';

export type LlmProvider = 'openai' | 'anthropic' | 'gemini';
export type LlmErrorKind = 'rate-limit' | 'overloaded' | 'context-length' | 'content-filter';

const HOSTS: Record<string, LlmProvider> = {
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'generativelanguage.googleapis.com': 'gemini',
};

/** Path shapes of the common LLM APIs, so self-hosted proxies that keep them are detected too. */
const PATHS: [RegExp, LlmProvider][] = [
  [/\/v1\/messages\b/, 'anthropic'],
  [/:(stream)?generateContent\b/i, 'gemini'],
  [/\/(chat\/)?completions\b|\/v1\/responses\b/, 'openai'],
];

export function llmProviderOf(url: string): LlmProvider | undefined {
  const byHost = HOSTS[hostOf(url).replace(/:\d+$/, '').toLowerCase()];
  if (byHost) return byHost;
  const path = pathOf(url);
  return PATHS.find(([re]) => re.test(path))?.[1];
}

export function isLlmRequest(url: string): boolean {
  return llmProviderOf(url) !== undefined;
}

/** How long a rate-limited client is told to wait. */
export const RETRY_AFTER_SECONDS = 20;

/**
 * The status, JSON body and headers each provider really sends for these errors, so client code
 * that branches on them (retry banners, "message too long") can be tested. Unknown → OpenAI shape.
 */
export function llmErrorResponse(
  kind: LlmErrorKind,
  provider: LlmProvider = 'openai',
): { status: number; body: string; headers: Record<string, string> } {
  const json = (status: number, body: unknown, extra: Record<string, string> = {}) => ({
    status,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...extra },
  });
  const retry = { 'retry-after': String(RETRY_AFTER_SECONDS) };

  if (provider === 'anthropic') {
    const error = (type: string, message: string) => ({ type: 'error', error: { type, message } });
    switch (kind) {
      case 'rate-limit':
        return json(
          429,
          error(
            'rate_limit_error',
            'Number of request tokens has exceeded your per-minute rate limit.',
          ),
          retry,
        );
      case 'overloaded':
        return json(529, error('overloaded_error', 'Overloaded'));
      case 'context-length':
        return json(
          400,
          error('invalid_request_error', 'prompt is too long: 215000 tokens > 200000 maximum'),
        );
      case 'content-filter':
        return json(
          400,
          error('invalid_request_error', 'Output blocked by content filtering policy'),
        );
    }
  }
  if (provider === 'gemini') {
    const error = (code: number, status: string, message: string) => ({
      error: { code, message, status },
    });
    switch (kind) {
      case 'rate-limit':
        return json(
          429,
          error(429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota).'),
          retry,
        );
      case 'overloaded':
        return json(
          503,
          error(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.'),
        );
      case 'context-length':
        return json(
          400,
          error(
            400,
            'INVALID_ARGUMENT',
            'The input token count exceeds the maximum number of tokens allowed.',
          ),
        );
      case 'content-filter':
        return json(
          400,
          error(400, 'INVALID_ARGUMENT', 'The request was blocked due to safety settings.'),
        );
    }
  }
  const error = (message: string, type: string, code: string | null) => ({
    error: { message, type, param: null, code },
  });
  switch (kind) {
    case 'rate-limit':
      return json(
        429,
        error(
          'Rate limit reached for requests. Please try again later.',
          'requests',
          'rate_limit_exceeded',
        ),
        retry,
      );
    case 'overloaded':
      return json(503, error('The server is overloaded or not ready yet.', 'server_error', null));
    case 'context-length':
      return json(
        400,
        error(
          "This model's maximum context length is 128000 tokens. Please reduce the length of the messages.",
          'invalid_request_error',
          'context_length_exceeded',
        ),
      );
    case 'content-filter':
      return json(
        400,
        error(
          'Your request was rejected as a result of our safety system.',
          'invalid_request_error',
          'content_policy_violation',
        ),
      );
  }
}
