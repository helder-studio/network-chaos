import { describe, expect, it } from 'vitest';
import { createChaos } from './engine';
import { isLlmRequest, llmErrorResponse, llmProviderOf } from './llm';
import { resolveEffect } from './rules';

describe('llmProviderOf', () => {
  it.each([
    ['https://api.openai.com/v1/chat/completions', 'openai'],
    ['https://api.openai.com/v1/responses', 'openai'],
    ['https://api.anthropic.com/v1/messages', 'anthropic'],
    [
      'https://generativelanguage.googleapis.com/v1beta/models/gemini:streamGenerateContent',
      'gemini',
    ],
    ['https://my-proxy.dev/llm/v1/messages', 'anthropic'],
    ['https://my-proxy.dev/v1/chat/completions', 'openai'],
    ['https://my-proxy.dev/api/orders', undefined],
  ])('%s → %s', (url, provider) => {
    expect(llmProviderOf(url)).toBe(provider);
    expect(isLlmRequest(url)).toBe(provider !== undefined);
  });
});

describe('llmErrorResponse', () => {
  it('uses each provider’s real status and error body', () => {
    const anthropic = llmErrorResponse('overloaded', 'anthropic');
    expect(anthropic.status).toBe(529);
    expect(JSON.parse(anthropic.body)).toEqual({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    });
    const openai = llmErrorResponse('rate-limit', 'openai');
    expect(openai.status).toBe(429);
    expect(openai.headers['retry-after']).toBe('20');
    expect(JSON.parse(openai.body).error.code).toBe('rate_limit_exceeded');
    expect(JSON.parse(llmErrorResponse('context-length', 'gemini').body).error.status).toBe(
      'INVALID_ARGUMENT',
    );
    expect(llmErrorResponse('content-filter').status).toBe(400);
  });

  it('covers every kind for every provider', () => {
    for (const provider of ['openai', 'anthropic', 'gemini'] as const) {
      for (const kind of [
        'rate-limit',
        'overloaded',
        'context-length',
        'content-filter',
      ] as const) {
        const res = llmErrorResponse(kind, provider);
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(() => JSON.parse(res.body)).not.toThrow();
      }
    }
  });
});

describe('LLM rules', () => {
  const req = (url: string) => ({ method: 'POST', url });

  it('limits `llm` rules to LLM calls and answers with the provider error', () => {
    const rules = [{ id: 'r', match: '*', llm: true, llmError: 'rate-limit' as const }];
    expect(resolveEffect(rules, req('https://api.example.com/orders'), () => 0)).toBe(null);
    const effect = resolveEffect(rules, req('https://api.anthropic.com/v1/messages'), () => 0);
    expect(effect?.fail?.status).toBe(429);
    expect(JSON.parse(effect?.fail?.body ?? '').error.type).toBe('rate_limit_error');
  });

  it('combines stream effects across rules, earlier rules winning per field', () => {
    const effect = resolveEffect(
      [
        { id: 'a', match: '*', stream: { chunkDelayMs: 100 } },
        { id: 'b', match: '*', stream: { chunkDelayMs: 999, cutAfter: 3 } },
      ],
      req('https://api.openai.com/v1/chat/completions'),
      () => 0,
    );
    expect(effect?.stream).toEqual({ chunkDelayMs: 100, cutAfter: 3 });
  });

  it('LLM presets leave other traffic alone and log stream chaos', () => {
    const chaos = createChaos();
    chaos.preset('llm-slow');
    expect(chaos.decide(req('https://api.example.com/orders')).effect).toBe(null);
    const { effect } = chaos.decide(req('https://api.openai.com/v1/chat/completions'));
    expect(effect?.stream?.chunkDelayMs).toEqual([150, 400]);
    expect(chaos.getLog()[0]?.outcome).toBe('stream chaos');
    chaos.preset('llm-overloaded');
    expect(chaos.decide(req('https://api.anthropic.com/v1/messages')).effect?.fail?.status).toBe(
      529,
    );
  });
});
