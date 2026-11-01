import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChaos } from '../core/engine';
import { install, uninstall } from './install';

/** Stand-in for the platform XHR: answers 200 "real" one tick after send(). */
class FakeXhr extends EventTarget {
  static sent = 0;
  readyState = 0;
  status = 0;
  responseText = '';
  open() {
    this.readyState = 1;
  }
  send() {
    FakeXhr.sent++;
    setTimeout(() => {
      this.readyState = 4;
      this.status = 200;
      this.responseText = 'real';
      for (const type of ['readystatechange', 'load', 'loadend'])
        this.dispatchEvent(new Event(type));
    }, 0);
  }
  abort() {}
}

function request(url: string, method = 'GET') {
  const xhr = new XMLHttpRequest() as unknown as FakeXhr;
  const events: string[] = [];
  for (const type of ['load', 'error', 'abort', 'loadend']) {
    xhr.addEventListener(type, () => events.push(type));
  }
  (xhr as unknown as XMLHttpRequest).open(method, url);
  (xhr as unknown as XMLHttpRequest).send();
  return { xhr, events };
}

const originalSend = FakeXhr.prototype.send;
const realFetch = vi.fn(async () => new Response('real', { status: 200 }));
let chaos: ReturnType<typeof createChaos>;

beforeEach(() => {
  vi.useFakeTimers();
  FakeXhr.sent = 0;
  realFetch.mockClear();
  vi.stubGlobal('fetch', realFetch);
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  chaos = createChaos();
  install(chaos);
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetch', () => {
  it('passes through and logs the status', async () => {
    const res = await fetch('https://x.dev/a');
    expect(await res.text()).toBe('real');
    expect(chaos.getLog()[0]).toMatchObject({ outcome: 'passed', status: 200 });
  });

  it('answers failed requests without calling the server', async () => {
    chaos.rule({ match: 'POST /orders', fail: { status: 503, body: 'down' } });
    const res = await fetch('https://x.dev/orders', { method: 'POST' });
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('down');
    expect(realFetch).not.toHaveBeenCalled();
  });

  it('delays by the rule latency', async () => {
    chaos.rule({ match: '*', latency: 1000 });
    let done = false;
    const pending = fetch('https://x.dev/a').then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
  });

  it('rejects like a network error when offline', async () => {
    chaos.setOffline(true);
    await expect(fetch('https://x.dev/a')).rejects.toThrow(TypeError);
    expect(chaos.getLog()[0]).toMatchObject({ outcome: 'network error', status: 0 });
  });

  it('hangs on timeout until the client aborts', async () => {
    chaos.rule({ match: '*', error: 'timeout' });
    const controller = new AbortController();
    const pending = fetch('https://x.dev/a', { signal: controller.signal });
    let settled = false;
    pending.catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('honours abort during a delay', async () => {
    chaos.rule({ match: '*', latency: 5000 });
    const controller = new AbortController();
    const pending = fetch('https://x.dev/a', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(realFetch).not.toHaveBeenCalled();
  });

  it('returns a truncated JSON body for malformed', async () => {
    chaos.rule({ match: '*', malformed: true });
    const res = await fetch('https://x.dev/a');
    await expect(res.json()).rejects.toThrow();
  });
});

describe('fetch streams', () => {
  const encoder = new TextEncoder();
  const streamed = (chunks: string[]) =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(encoder.encode(c));
          controller.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
  const sse = ['data: a\n\n', 'data: b\n\n', 'data: c\n\n', 'data: d\n\n'];
  const url = 'https://api.openai.com/v1/chat/completions';

  async function readAll(res: Response) {
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const parts: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return parts;
      parts.push(decoder.decode(value));
    }
  }

  it('delays every chunk', async () => {
    realFetch.mockResolvedValueOnce(streamed(sse));
    chaos.rule({ match: '*', stream: { chunkDelayMs: 100 } });
    const res = await fetch(url, { method: 'POST' });
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    let parts: string[] | undefined;
    void readAll(res).then((p) => {
      parts = p;
    });
    await vi.advanceTimersByTimeAsync(399);
    expect(parts).toBe(undefined);
    await vi.advanceTimersByTimeAsync(101);
    expect(parts).toEqual(sse);
  });

  it('drops the connection after N chunks', async () => {
    realFetch.mockResolvedValueOnce(streamed(sse));
    chaos.rule({ match: '*', stream: { cutAfter: 2 } });
    const res = await fetch(url, { method: 'POST' });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await reader.read();
    await expect(reader.read()).rejects.toThrow('Network connection was lost.');
  });

  it('stalls after N chunks until the client aborts', async () => {
    realFetch.mockResolvedValueOnce(streamed(sse));
    chaos.rule({ match: '*', stream: { stallAfter: 1 } });
    const controller = new AbortController();
    const res = await fetch(url, { method: 'POST', signal: controller.signal });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    const next = reader.read();
    let settled = false;
    next.catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    controller.abort();
    await expect(next).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('injects a broken SSE event after the first chunk', async () => {
    realFetch.mockResolvedValueOnce(streamed(sse));
    chaos.rule({ match: '*', stream: { malformed: true } });
    const parts = await readAll(await fetch(url, { method: 'POST' }));
    expect(parts[0]).toBe('data: a\n\n');
    expect(parts[1]).toContain('{"choices":[{"delta":{"content":"');
    expect(parts).toHaveLength(5);
  });

  it('answers with provider errors without calling the server', async () => {
    chaos.preset('llm-rate-limited');
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST' });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('20');
    expect((await res.json()).error.type).toBe('rate_limit_error');
    expect(realFetch).not.toHaveBeenCalled();
  });
});

describe('XMLHttpRequest', () => {
  it('passes through and logs the status', async () => {
    const { events } = request('https://x.dev/a');
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual(['load', 'loadend']);
    expect(chaos.getLog()[0]).toMatchObject({ outcome: 'passed', status: 200 });
  });

  it('fakes a failed response after the latency', async () => {
    chaos.rule({ match: '*', latency: 300, fail: { status: 500, body: 'oops' } });
    const { xhr, events } = request('https://x.dev/a');
    await vi.advanceTimersByTimeAsync(299);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual(['load', 'loadend']);
    expect([xhr.readyState, xhr.status, xhr.responseText]).toEqual([4, 500, 'oops']);
    expect(FakeXhr.sent).toBe(0);
  });

  it('fires error with status 0 when offline', async () => {
    chaos.setOffline(true);
    const { xhr, events } = request('https://x.dev/a');
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual(['error', 'loadend']);
    expect(xhr.status).toBe(0);
  });

  it('sends the real request after a pure delay', async () => {
    chaos.rule({ match: '*', latency: 100 });
    const { events } = request('https://x.dev/a');
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeXhr.sent).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual(['load', 'loadend']);
  });

  it('hangs on timeout and fires abort when the client gives up', async () => {
    chaos.rule({ match: '*', error: 'timeout' });
    const { xhr, events } = request('https://x.dev/a');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual([]);
    (xhr as unknown as XMLHttpRequest).abort();
    expect(events).toEqual(['abort', 'loadend']);
    expect(chaos.getLog()[0]?.status).toBe(0);
  });
});

describe('XMLHttpRequest edge cases', () => {
  it('fires timeout when the client set xhr.timeout during a timeout effect', async () => {
    chaos.rule({ match: '*', error: 'timeout' });
    const xhr = new XMLHttpRequest() as unknown as FakeXhr & { timeout: number };
    const events: string[] = [];
    for (const type of ['timeout', 'loadend']) xhr.addEventListener(type, () => events.push(type));
    xhr.timeout = 5000;
    (xhr as unknown as XMLHttpRequest).open('GET', 'https://x.dev/a');
    (xhr as unknown as XMLHttpRequest).send();
    await vi.advanceTimersByTimeAsync(4999);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual(['timeout', 'loadend']);
    expect(chaos.getLog()[0]?.status).toBe(0);
  });

  it('lets a reused instance read real values after a faked response', async () => {
    chaos.rule({ id: 'fail', match: '*', fail: { status: 500 } });
    const { xhr } = request('https://x.dev/a');
    await vi.advanceTimersByTimeAsync(0);
    expect(xhr.status).toBe(500);
    chaos.removeRule('fail');
    (xhr as unknown as XMLHttpRequest).open('GET', 'https://x.dev/b');
    expect(xhr.readyState).toBe(1);
    (xhr as unknown as XMLHttpRequest).send();
    await vi.advanceTimersByTimeAsync(1);
    expect([xhr.status, xhr.responseText]).toEqual([200, 'real']);
    expect(chaos.getLog().map((e) => e.status)).toEqual([200, 500]);
  });

  it('leaves synchronous requests untouched', () => {
    chaos.setOffline(true);
    const xhr = new XMLHttpRequest() as unknown as FakeXhr;
    (xhr as unknown as XMLHttpRequest).open('GET', 'https://x.dev/a', false);
    (xhr as unknown as XMLHttpRequest).send();
    expect(FakeXhr.sent).toBe(1);
    expect(chaos.getLog()).toEqual([]);
  });
});

describe('install', () => {
  it('is idempotent and uninstall restores the originals', () => {
    const patched = globalThis.fetch;
    install(chaos);
    expect(globalThis.fetch).toBe(patched);
    uninstall();
    expect(globalThis.fetch).toBe(realFetch);
    expect(XMLHttpRequest.prototype.send).toBe(originalSend);
  });

  it('leaves fetch alone on React Native, where fetch runs on XMLHttpRequest', () => {
    uninstall();
    vi.stubGlobal('navigator', { product: 'ReactNative' });
    install(chaos);
    expect(globalThis.fetch).toBe(realFetch);
    expect(XMLHttpRequest.prototype.send).not.toBe(originalSend);
  });
});
