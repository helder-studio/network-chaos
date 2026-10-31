import { describe, expect, it } from 'vitest';
import { seededRandom } from './random';
import { hostOf, pathOf, type Rule, resolveEffect, ruleMatches } from './rules';

const req = (method: string, url: string, headers?: Record<string, string>) => ({
  method,
  url,
  ...(headers && { headers }),
});

describe('ruleMatches', () => {
  it.each([
    ['POST /api/orders*', 'POST', 'https://x.dev/api/orders/42', true],
    ['POST /api/orders*', 'GET', 'https://x.dev/api/orders/42', false],
    ['post /api/orders*', 'POST', 'https://x.dev/api/orders', true],
    ['/api/orders*', 'DELETE', 'https://x.dev/api/orders?id=1', true],
    ['/api/orders', 'GET', 'https://x.dev/api/orders?id=1', false],
    ['*/search*', 'GET', 'https://x.dev/v2/search?q=a', true],
    ['*/search*', 'GET', 'https://x.dev/v2/find', false],
    ['GET *', 'GET', 'http://localhost:3000/anything', true],
    ['* /a.b', 'PUT', 'https://x.dev/a.b', true],
    ['/a.b', 'GET', 'https://x.dev/aXb', false],
    ['https://api.x.dev/*', 'GET', 'https://api.x.dev/users', true],
    ['/', 'GET', 'https://x.dev', true],
  ])('%s vs %s %s → %s', (match, method, url, expected) => {
    expect(ruleMatches({ match }, req(method, url))).toBe(expected);
  });

  it('matches host globs', () => {
    const rule = { match: '*', host: '*.example.com' };
    expect(ruleMatches(rule, req('GET', 'https://api.example.com/x'))).toBe(true);
    expect(ruleMatches(rule, req('GET', 'https://example.org/x'))).toBe(false);
  });

  it('matches headers case-insensitively by name', () => {
    const rule = { match: '*', headers: { 'X-Feature': 'beta' } };
    expect(ruleMatches(rule, req('GET', '/x', { 'x-feature': 'beta' }))).toBe(true);
    expect(ruleMatches(rule, req('GET', '/x', { 'x-feature': 'stable' }))).toBe(false);
    expect(ruleMatches(rule, req('GET', '/x'))).toBe(false);
  });
});

describe('url helpers', () => {
  it('splits host and path without URL', () => {
    expect(hostOf('https://api.x.dev:8443/a?b=1')).toBe('api.x.dev:8443');
    expect(pathOf('https://api.x.dev:8443/a?b=1')).toBe('/a?b=1');
    expect(pathOf('/relative?q')).toBe('/relative?q');
    expect(hostOf('/relative')).toBe('');
  });
});

describe('resolveEffect', () => {
  const withIds = (rules: Rule[]) => rules.map((r, i) => ({ ...r, id: `r${i}` }));
  const always = () => 0;

  it('returns null when nothing matches', () => {
    expect(resolveEffect(withIds([{ match: '/a*', latency: 10 }]), req('GET', '/b'), always)).toBe(
      null,
    );
  });

  it('takes the longest latency and the first outcome', () => {
    const effect = resolveEffect(
      withIds([
        { match: '*', latency: 100 },
        { match: '*', latency: [500, 900], fail: { status: 503 } },
        { match: '*', error: 'network' },
      ]),
      req('GET', '/x'),
      () => 0.5,
    );
    expect(effect).toEqual({ latencyMs: 700, fail: { status: 503 }, rules: ['r0', 'r1', 'r2'] });
  });

  it('skips rules whose rate roll fails', () => {
    const rules = withIds([{ match: '*', rate: 0.5, error: 'timeout' }]);
    expect(resolveEffect(rules, req('GET', '/x'), () => 0.49)?.error).toBe('timeout');
    expect(resolveEffect(rules, req('GET', '/x'), () => 0.5)).toBe(null);
  });

  it('marks malformed bodies', () => {
    expect(
      resolveEffect(withIds([{ match: '*', malformed: true }]), req('GET', '/x'), always)
        ?.malformed,
    ).toBe(true);
  });

  it('is reproducible with a seed', () => {
    const rules = withIds([{ match: '*', rate: 0.5, fail: { status: 500 } }]);
    const run = (seed: number) => {
      const random = seededRandom(seed);
      return Array.from(
        { length: 20 },
        () => resolveEffect(rules, req('GET', '/x'), random) !== null,
      );
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(7));
  });
});
