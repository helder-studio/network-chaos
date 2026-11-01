import type { Chaos } from '../core/engine';
import type { Effect } from '../core/rules';

// Minimal shapes so the package builds without DOM or React Native types.
interface AbortSignalLike {
  aborted: boolean;
  reason?: unknown;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}
interface ReaderLike {
  read(): Promise<{ done: boolean; value?: unknown }>;
  cancel(reason?: unknown): Promise<void>;
}
interface ResponseLike {
  status: number;
  statusText?: string;
  headers?: unknown;
  body?: { getReader(): ReaderLike } | null;
}
type FetchLike = (
  input: unknown,
  init?: { method?: string; signal?: AbortSignalLike },
) => Promise<ResponseLike>;
type ResponseCtor = new (
  body: unknown,
  init: { status: number; statusText?: string; headers?: unknown },
) => ResponseLike;
type StreamCtor = new (source: {
  pull(controller: StreamController): Promise<void>;
  cancel(reason?: unknown): Promise<void>;
}) => unknown;
interface StreamController {
  enqueue(chunk: unknown): void;
  close(): void;
  error(reason: unknown): void;
}

interface XhrLike {
  readyState: number;
  status: number;
  /** ms; 0 means no timeout. */
  timeout?: number;
  open(method: string, url: string, ...rest: unknown[]): void;
  send(body?: unknown): void;
  abort(): void;
  dispatchEvent?(event: unknown): boolean;
  addEventListener?(type: string, listener: () => void, options?: { once?: boolean }): void;
}
type XhrCtor = { prototype: XhrLike };

const g = globalThis as unknown as {
  fetch?: FetchLike;
  Response?: ResponseCtor;
  ReadableStream?: StreamCtor;
  TextEncoder?: new () => { encode(text: string): unknown };
  XMLHttpRequest?: XhrCtor;
  Event?: new (type: string) => unknown;
  navigator?: { product?: string };
};

const INSTALLED = Symbol.for('helder-studio.network-chaos');
type Installed = {
  fetch?: FetchLike;
  open?: XhrLike['open'];
  send?: XhrLike['send'];
  abort?: XhrLike['abort'];
};
const registry = globalThis as unknown as Record<symbol, Installed | undefined>;

const MALFORMED_BODY = '{"data":[{"id":1,"name":"';

function abortError(signal: AbortSignalLike): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/** Waits `ms` (forever when `ms` is Infinity), rejecting as soon as `signal` aborts. */
function wait(ms: number, signal?: AbortSignalLike): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal as AbortSignalLike));
    };
    const timer =
      ms === Number.POSITIVE_INFINITY
        ? undefined
        : setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

function describeFetch(
  input: unknown,
  init?: { method?: string },
): { method: string; url: string } {
  const req = input as { url?: string; method?: string } | string;
  const url = typeof req === 'string' ? req : (req?.url ?? String(input));
  const method = init?.method ?? (typeof req === 'object' ? req?.method : undefined) ?? 'GET';
  return { method, url };
}

function patchFetch(chaos: Chaos, original: FetchLike): FetchLike {
  return async (input, init) => {
    const { effect, finish } = chaos.decide(describeFetch(input, init));
    const signal = init?.signal ?? (input as { signal?: AbortSignalLike } | undefined)?.signal;
    try {
      if (effect) {
        if (effect.latencyMs > 0) await wait(effect.latencyMs, signal);
        if (effect.error === 'network') throw new TypeError('Network request failed');
        if (effect.error === 'timeout') await wait(Number.POSITIVE_INFINITY, signal);
        const fake = fakeResponse(effect);
        if (fake && g.Response) {
          finish(fake.status);
          return new g.Response(fake.body, { status: fake.status, headers: fake.headers });
        }
      }
      const response = await original(input, init);
      finish(response.status);
      return effect?.stream ? chaosStream(response, effect.stream, signal, chaos) : response;
    } catch (error) {
      finish(0);
      throw error;
    }
  };
}

const BROKEN_SSE = 'data: {"choices":[{"delta":{"content":"\n\n';

/**
 * Re-wraps a streamed body so chunks arrive slowly, stall, drop mid-stream or carry a broken SSE
 * event. Needs `ReadableStream` (browsers, Node, Expo's streaming fetch); otherwise passes through.
 */
function chaosStream(
  response: ResponseLike,
  stream: NonNullable<Effect['stream']>,
  signal: AbortSignalLike | undefined,
  chaos: Chaos,
): ResponseLike {
  const reader = response.body?.getReader?.();
  if (!reader || !g.ReadableStream || !g.Response) return response;
  let chunks = 0;
  let injected = false;
  const body = new g.ReadableStream({
    async pull(controller) {
      try {
        if (stream.stallAfter !== undefined && chunks >= stream.stallAfter) {
          await wait(Number.POSITIVE_INFINITY, signal);
        }
        if (stream.cutAfter !== undefined && chunks >= stream.cutAfter) {
          await reader.cancel();
          controller.error(new TypeError('Network connection was lost.'));
          return;
        }
        if (stream.chunkDelayMs !== undefined) await wait(chaos.pick(stream.chunkDelayMs), signal);
        const { done, value } = await reader.read();
        if (done) return controller.close();
        chunks++;
        controller.enqueue(value);
        if (stream.malformed && !injected && g.TextEncoder) {
          injected = true;
          controller.enqueue(new g.TextEncoder().encode(BROKEN_SSE));
        }
      } catch (error) {
        await reader.cancel(error).catch(() => {});
        controller.error(error);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return new g.Response(body, {
    status: response.status,
    ...(response.statusText !== undefined && { statusText: response.statusText }),
    headers: response.headers,
  });
}

function fakeResponse(
  effect: Effect,
): { status: number; body: string; headers: Record<string, string> } | undefined {
  if (effect.fail) {
    return {
      status: effect.fail.status,
      body: effect.fail.body ?? '',
      headers: effect.fail.headers ?? {},
    };
  }
  if (effect.malformed) {
    return { status: 200, body: MALFORMED_BODY, headers: { 'content-type': 'application/json' } };
  }
  return undefined;
}

const META = Symbol('chaos');
type Meta = {
  method: string;
  url: string;
  timer?: ReturnType<typeof setTimeout> | undefined;
  pending?: boolean;
  finish?: (status: number) => void;
};
type Tracked = XhrLike & { [META]?: Meta | undefined };

function fire(xhr: XhrLike, type: string) {
  // RN's XHR accepts plain `{ type }` objects; browsers need real Events. Both run `on<type>` too.
  xhr.dispatchEvent?.(g.Event ? new g.Event(type) : { type });
}

const FAKED = ['readyState', 'status', 'responseText', 'response', 'statusText'] as const;

function settle(xhr: Tracked, status: number, body: string, events: string[]) {
  const values = [4, status, body, body, ''];
  FAKED.forEach((key, i) => {
    Object.defineProperty(xhr, key, { value: values[i], configurable: true });
  });
  for (const type of events) fire(xhr, type);
}

/** Drops fake values from an earlier settle so a reused instance reads the real ones again. */
function unsettle(xhr: Tracked) {
  for (const key of FAKED) delete (xhr as unknown as Record<string, unknown>)[key];
}

function patchXhr(chaos: Chaos, proto: XhrLike, saved: Installed) {
  const { open, send, abort } = saved as Required<Pick<Installed, 'open' | 'send' | 'abort'>>;

  proto.open = function (this: Tracked, method: string, url: string, ...rest: unknown[]) {
    unsettle(this);
    // Synchronous requests can't be delayed without blocking, so they pass untouched.
    this[META] = rest[0] === false ? undefined : { method, url: String(url) };
    return open.call(this, method, url, ...rest);
  };

  proto.send = function (this: Tracked, body?: unknown) {
    const meta = this[META];
    if (!meta) return send.call(this, body);
    const { effect, finish } = chaos.decide(meta);
    meta.finish = finish;
    const track = () =>
      this.addEventListener?.('loadend', () => finish(this.status), { once: true });
    if (!effect) {
      track();
      return send.call(this, body);
    }
    meta.pending = true;
    const run = () => {
      meta.timer = undefined;
      if (effect.error === 'timeout') {
        // Hang until abort(), or until the client's own xhr.timeout fires (axios relies on it).
        const limit = this.timeout ?? 0;
        if (limit > 0) {
          meta.timer = setTimeout(() => {
            meta.pending = false;
            finish(0);
            settle(this, 0, '', ['readystatechange', 'timeout', 'loadend']);
          }, limit);
        }
        return;
      }
      meta.pending = false;
      if (effect.error === 'network') {
        finish(0);
        return settle(this, 0, '', ['readystatechange', 'error', 'loadend']);
      }
      const fake = fakeResponse(effect);
      if (fake) {
        finish(fake.status);
        return settle(this, fake.status, fake.body, ['readystatechange', 'load', 'loadend']);
      }
      track();
      send.call(this, body);
    };
    if (effect.latencyMs > 0) meta.timer = setTimeout(run, effect.latencyMs);
    else run();
  };

  proto.abort = function (this: Tracked) {
    const meta = this[META];
    if (meta?.pending) {
      if (meta.timer !== undefined) clearTimeout(meta.timer);
      meta.pending = false;
      meta.finish?.(0);
      return settle(this, 0, '', ['readystatechange', 'abort', 'loadend']);
    }
    return abort.call(this);
  };
}

/**
 * Patches fetch (web only: React Native's fetch runs on XMLHttpRequest) and XMLHttpRequest.
 * Safe to call repeatedly, e.g. under Fast Refresh. Returns an uninstall function.
 */
export function install(chaos: Chaos): () => void {
  if (registry[INSTALLED]) return uninstall;
  const saved: Installed = {};
  const isNative = g.navigator?.product === 'ReactNative';
  if (g.fetch && !isNative) {
    saved.fetch = g.fetch;
    g.fetch = patchFetch(chaos, g.fetch);
  }
  const proto = g.XMLHttpRequest?.prototype;
  if (proto) {
    saved.open = proto.open;
    saved.send = proto.send;
    saved.abort = proto.abort;
    patchXhr(chaos, proto, saved);
  }
  registry[INSTALLED] = saved;
  return uninstall;
}

export function uninstall() {
  const saved = registry[INSTALLED];
  if (!saved) return;
  if (saved.fetch) g.fetch = saved.fetch;
  const proto = g.XMLHttpRequest?.prototype;
  if (proto && saved.open && saved.send && saved.abort) {
    proto.open = saved.open;
    proto.send = saved.send;
    proto.abort = saved.abort;
  }
  registry[INSTALLED] = undefined;
}
