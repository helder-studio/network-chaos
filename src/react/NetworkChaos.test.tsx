// @vitest-environment happy-dom
/// <reference lib="dom" />
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chaos } from '../chaos';
import { NetworkChaos } from './NetworkChaos';
import { describeRule, endpointMatch, summary } from './shared';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(enabled: boolean) {
  const el = document.createElement('div');
  document.body.append(el);
  act(() => createRoot(el).render(<NetworkChaos enabled={enabled}>app</NetworkChaos>));
  return el;
}

afterEach(() => {
  chaos.uninstall();
  chaos.clearRules();
  chaos.setOffline(false);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('<NetworkChaos> (web)', () => {
  it('renders only children and patches nothing when disabled', () => {
    const before = globalThis.fetch;
    expect(mount(false).textContent).toBe('app');
    expect(globalThis.fetch).toBe(before);
  });

  it('patches fetch, warns once and shows a live badge when enabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = globalThis.fetch;
    const el = mount(true);
    expect(globalThis.fetch).not.toBe(before);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(el.querySelector('button')?.textContent).toBe('⚡ network chaos: on');
    act(() => chaos.setOffline(true));
    expect(el.querySelector('button')?.textContent).toBe('⚡ network chaos: offline');
  });

  it('opens a panel where a logged request becomes a rule', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = mount(true);
    const click = (text: string) =>
      act(() =>
        [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text))?.click(),
      );
    click('network chaos');
    expect(el.querySelector('section[aria-label="Network chaos"]')).not.toBe(null);
    click('flaky');
    expect(chaos.getState().preset).toBe('flaky');
    act(() => {
      chaos.decide({ method: 'GET', url: 'https://x.dev/api/orders?id=1' });
    });
    click('GET /api/orders');
    click('Fail 500');
    expect(chaos.getState().rules.map((r) => [r.match, r.fail?.status])).toEqual([
      ['GET /api/orders*', 500],
    ]);
    act(() => chaos.preset(null));
    act(() => chaos.close());
    expect(el.querySelector('section')).toBe(null);
  });
});

describe('hydration', () => {
  it('hydrates once even when the storage adapter is recreated on every render', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getItem = vi.fn(() => null);
    const adapter = () => ({ getItem, setItem: () => {}, removeItem: () => {} });
    const el = document.createElement('div');
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(<NetworkChaos enabled storage={adapter()} />));
    act(() => root.render(<NetworkChaos enabled storage={adapter()} />));
    act(() => root.render(<NetworkChaos enabled storage={adapter()} />));
    expect(getItem).toHaveBeenCalledTimes(1);
  });
});

describe('panel helpers', () => {
  const base = { id: 'x', match: '*', enabled: true, source: 'code' as const };

  it('summarises state', () => {
    const state = { on: true, offline: false, preset: null, rules: [], open: false };
    expect(summary(state)).toBe('on');
    expect(summary({ ...state, on: false })).toBe('off');
    expect(summary({ ...state, preset: 'flaky', rules: [base, { ...base, id: 'y' }] })).toBe(
      'flaky · 2 rules',
    );
  });

  it('describes rules', () => {
    expect(describeRule({ ...base, rate: 0.5, fail: { status: 503 }, latency: [800, 3000] })).toBe(
      '50% → 503, 800–3000 ms',
    );
    expect(describeRule({ ...base, error: 'timeout' })).toBe('timeout');
    expect(describeRule({ ...base, malformed: true, latency: 5 })).toBe('malformed body, 5 ms');
  });

  it('turns a logged request into an endpoint rule', () => {
    expect(endpointMatch('get', 'https://x.dev/api/orders?id=1#top')).toBe('GET /api/orders*');
    expect(endpointMatch('POST', 'https://x.dev')).toBe('POST /*');
  });
});
