import { memory } from '@helder-studio/storage';
import { describe, expect, it, vi } from 'vitest';
import { createChaos } from './engine';

const get = (url: string) => ({ method: 'GET', url });

describe('createChaos', () => {
  it('passes requests untouched without rules and logs them', () => {
    const chaos = createChaos(() => 1);
    const { effect, finish } = chaos.decide(get('https://x.dev/a'));
    expect(effect).toBe(null);
    finish(200);
    expect(chaos.getLog()).toEqual([
      {
        id: 1,
        time: 1,
        method: 'GET',
        url: 'https://x.dev/a',
        outcome: 'passed',
        latencyMs: 0,
        status: 200,
      },
    ]);
  });

  it('applies code rules and replaces a rule added twice', () => {
    const chaos = createChaos();
    const a = chaos.rule({ match: '/api*', fail: { status: 503 } });
    const b = chaos.rule({ match: '/api*', fail: { status: 503 } });
    expect(a).toBe(b);
    expect(chaos.getState().rules).toHaveLength(1);
    expect(chaos.decide(get('https://x.dev/api/1')).effect?.fail?.status).toBe(503);
    expect(chaos.getLog()[0]?.outcome).toBe('failed');
  });

  it('master switch and rule toggles turn effects off', () => {
    const chaos = createChaos();
    const id = chaos.rule({ id: 'slow', match: '*', latency: 50 });
    chaos.toggleRule(id, false);
    expect(chaos.decide(get('/a')).effect).toBe(null);
    chaos.toggleRule(id, true);
    chaos.setOn(false);
    expect(chaos.decide(get('/a')).effect).toBe(null);
    chaos.setOn(true);
    expect(chaos.decide(get('/a')).effect?.latencyMs).toBe(50);
    chaos.removeRule(id);
    expect(chaos.getState().rules).toEqual([]);
  });

  it('offline fails everything with a network error', () => {
    const chaos = createChaos();
    chaos.setOffline(true);
    expect(chaos.decide(get('/a')).effect).toEqual({
      latencyMs: 0,
      error: 'network',
      rules: ['offline'],
    });
    expect(chaos.getLog()[0]?.outcome).toBe('network error');
  });

  it('presets add their rules; the offline preset flips the offline switch', () => {
    const chaos = createChaos();
    chaos.seed(1);
    chaos.preset('3g');
    const latency = chaos.decide(get('/a')).effect?.latencyMs ?? 0;
    expect(latency).toBeGreaterThanOrEqual(300);
    expect(latency).toBeLessThanOrEqual(800);
    chaos.preset('offline');
    expect(chaos.getState().offline).toBe(true);
    chaos.preset('flaky');
    expect(chaos.getState().offline).toBe(false);
    chaos.preset('offline');
    chaos.setOffline(false);
    expect(chaos.getState().preset).toBe(null);
  });

  it('never touches the Metro dev server or ignored URLs', () => {
    const chaos = createChaos();
    chaos.setOffline(true);
    chaos.ignore(['*/health']);
    for (const url of [
      'http://localhost:8081/index.bundle',
      'http://10.0.2.2:8081/symbolicate',
      'https://x.dev/health',
    ]) {
      expect(chaos.decide(get(url)).effect).toBe(null);
    }
    expect(chaos.getLog()).toEqual([]);
  });

  it('keeps the last 200 log entries, newest first', () => {
    const chaos = createChaos();
    for (let i = 0; i < 205; i++) chaos.decide(get(`/r/${i}`));
    const log = chaos.getLog();
    expect(log).toHaveLength(200);
    expect(log[0]?.url).toBe('/r/204');
    chaos.clearLog();
    expect(chaos.getLog()).toEqual([]);
  });

  it('notifies subscribers; open/close are not saved', async () => {
    const storage = memory();
    const chaos = createChaos();
    await chaos.hydrate(storage);
    const listener = vi.fn();
    const unsubscribe = chaos.subscribe(listener);
    chaos.open();
    expect(chaos.getState().open).toBe(true);
    expect(storage.getItem('helder-studio:network-chaos')).toBe(null);
    chaos.close();
    unsubscribe();
    chaos.open();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('saves panel settings and restores them after a restart', async () => {
    const storage = memory();
    const first = createChaos();
    first.rule({ id: 'code', match: '*', latency: 10 });
    await first.hydrate(storage);
    first.panelRule({ match: 'GET /api/orders*', rate: 0.5, fail: { status: 503 } });
    first.toggleRule('code', false);
    first.preset('flaky');

    const second = createChaos();
    second.rule({ id: 'code', match: '*', latency: 10 });
    await second.hydrate(storage);
    const state = second.getState();
    expect(state.preset).toBe('flaky');
    expect(state.rules.map((r) => [r.match, r.source, r.enabled])).toEqual([
      ['*', 'code', false],
      ['GET /api/orders*', 'panel', true],
    ]);
  });

  it('starts from defaults when storage fails or holds garbage', async () => {
    const chaos = createChaos();
    await chaos.hydrate({
      getItem: () => Promise.reject(new Error('read')),
      setItem: () => {
        throw new Error('write');
      },
      removeItem: () => {},
    });
    expect(() => chaos.setOffline(true)).not.toThrow();
    const other = createChaos();
    await other.hydrate(memory({ 'helder-studio:network-chaos': '{nope' }));
    expect(other.getState().on).toBe(true);
  });
});
