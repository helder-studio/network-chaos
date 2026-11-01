import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestChaos } from './testing';

const realFetch = vi.fn(async () => new Response('ok'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createTestChaos', () => {
  it('applies rules to the test environment fetch and restores it', async () => {
    vi.stubGlobal('fetch', realFetch);
    const chaos = createTestChaos({
      rules: [{ match: 'POST /api/orders*', fail: { status: 503 } }],
    });
    expect((await fetch('http://localhost/api/orders', { method: 'POST' })).status).toBe(503);
    expect((await fetch('http://localhost/api/feed')).status).toBe(200);
    expect(chaos.getLog().map((e) => e.outcome)).toEqual(['passed', 'failed']);
    chaos.restore();
    expect(globalThis.fetch).toBe(realFetch);
  });

  it('supports offline and replaces a previous instance', async () => {
    vi.stubGlobal('fetch', realFetch);
    createTestChaos({ rules: [{ match: '*', fail: { status: 500 } }] });
    const chaos = createTestChaos({ offline: true, seed: 3 });
    await expect(fetch('http://localhost/x')).rejects.toThrow(TypeError);
    chaos.restore();
    expect(globalThis.fetch).toBe(realFetch);
  });
});
