/** A request as the interceptors see it. */
export interface ChaosRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
}

/** Milliseconds, or `[min, max]` for a random delay in that range. */
export type Range = number | readonly [min: number, max: number];

export interface Rule {
  /** Stable id; defaults to one derived from the rule itself. */
  id?: string;
  /**
   * `'POST /api/orders*'`, `'*\/search*'`, `'GET *'`. An optional method, then a URL glob where `*`
   * matches anything. Globs starting with `/` match the path and query; others match the full URL.
   */
  match: string;
  /** Host glob, e.g. `'api.example.com'` or `'*.example.com'`. */
  host?: string;
  /** Header values that must match exactly (names are case-insensitive). */
  headers?: Record<string, string>;
  /** Chance from 0 to 1 that the rule applies to a matching request. Default 1. */
  rate?: number;
  latency?: Range;
  /** Answer with this status instead of calling the server. */
  fail?: { status: number; body?: string };
  /** `network`: the request fails like offline. `timeout`: it hangs until the client aborts. */
  error?: 'network' | 'timeout';
  /** Answer 200 with a truncated JSON body instead of calling the server. */
  malformed?: boolean;
}

const METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|\*)\s+/i;

export function globToRegExp(glob: string): RegExp {
  const source = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`, 'i');
}

// React Native's URL polyfill has no pathname/host, so split URLs by hand.
const ORIGIN = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i;

export function hostOf(url: string): string {
  return ORIGIN.exec(url)?.[1] ?? '';
}

export function pathOf(url: string): string {
  return url.replace(ORIGIN, '') || '/';
}

export function ruleMatches(rule: Rule, req: ChaosRequest): boolean {
  let pattern = rule.match.trim();
  const method = METHODS.exec(pattern);
  if (method) {
    pattern = pattern.slice(method[0].length);
    const wanted = (method[1] as string).toUpperCase();
    if (wanted !== '*' && wanted !== req.method.toUpperCase()) return false;
  }
  const target = pattern.startsWith('/') ? pathOf(req.url) : req.url;
  if (!globToRegExp(pattern).test(target)) return false;
  if (rule.host && !globToRegExp(rule.host).test(hostOf(req.url))) return false;
  if (rule.headers) {
    const actual: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers ?? {})) actual[k.toLowerCase()] = v;
    for (const [k, v] of Object.entries(rule.headers)) {
      if (actual[k.toLowerCase()] !== v) return false;
    }
  }
  return true;
}

/** What happens to one request. */
export interface Effect {
  latencyMs: number;
  fail?: { status: number; body?: string };
  error?: 'network' | 'timeout';
  malformed?: boolean;
  /** Ids of the rules that applied. */
  rules: string[];
}

function pick(range: Range, random: () => number): number {
  if (typeof range === 'number') return range;
  const [min, max] = range;
  return Math.round(min + (max - min) * random());
}

/**
 * Applies every matching rule in order: the longest latency wins, and the first rule with an
 * outcome (fail, error, malformed) decides it. `null` means the request passes untouched.
 */
export function resolveEffect(
  rules: readonly (Rule & { id: string })[],
  req: ChaosRequest,
  random: () => number,
): Effect | null {
  let effect: Effect | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, req)) continue;
    if (rule.rate !== undefined && random() >= rule.rate) continue;
    effect ??= { latencyMs: 0, rules: [] };
    effect.rules.push(rule.id);
    if (rule.latency !== undefined) {
      effect.latencyMs = Math.max(effect.latencyMs, pick(rule.latency, random));
    }
    const decided = effect.fail || effect.error || effect.malformed;
    if (!decided) {
      if (rule.fail) effect.fail = rule.fail;
      else if (rule.error) effect.error = rule.error;
      else if (rule.malformed) effect.malformed = true;
    }
  }
  return effect;
}
