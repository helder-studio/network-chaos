import type { StorageAdapter } from '@helder-studio/storage';
import type { ReactNode } from 'react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { chaos } from '../chaos';

export interface NetworkChaosProps {
  /** Off: nothing is patched and nothing renders besides `children`. */
  enabled: boolean;
  /** Saves panel settings (switches, preset, panel rules) so they survive restarts. */
  storage?: StorageAdapter;
  /** URL globs never touched, on top of the Metro dev server. */
  ignore?: string[];
  /** React Native: `false` hides the floating badge and panel, e.g. when using dev-dock. */
  badge?: boolean;
  /** Seeds rate rules for reproducible runs. */
  seed?: number;
  children?: ReactNode;
}

let warned = false;

/** Installs interception during render so requests fired by children's effects are covered. */
export function useActivation({ enabled, storage, ignore, seed }: NetworkChaosProps) {
  if (enabled) chaos.install(); // idempotent
  const ignoreKey = ignore?.join('\n');
  // Hydrate once: `storage={mmkv(instance)}` creates a new adapter object on every render.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (ignoreKey !== undefined) chaos.ignore(ignoreKey.split('\n'));
    if (seed !== undefined) chaos.seed(seed);
    if (storage && !hydrated.current) {
      hydrated.current = true;
      void chaos.hydrate(storage);
    }
    if (!warned) {
      warned = true;
      console.warn('[network-chaos] active: requests may be delayed or failed on purpose.');
    }
  }, [enabled, storage, ignoreKey, seed]);
  useEffect(() => {
    if (!enabled) chaos.uninstall();
  }, [enabled]);
}

export function useChaosState() {
  return useSyncExternalStore(chaos.subscribe, chaos.getState, chaos.getState);
}

export function useChaosLog() {
  return useSyncExternalStore(chaos.subscribe, chaos.getLog, chaos.getLog);
}

/** Short status for the badge, e.g. `flaky · 2 rules`. */
export function summary(state: ReturnType<typeof chaos.getState>): string {
  if (!state.on) return 'off';
  const parts: string[] = [];
  if (state.offline) parts.push('offline');
  else if (state.preset) parts.push(state.preset);
  const rules = state.rules.filter((r) => r.enabled).length;
  if (rules) parts.push(`${rules} rule${rules === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'on';
}

/** One-line description of a rule for the panel, e.g. `50% → 503, 800–3000 ms`. */
export function describeRule(rule: ReturnType<typeof chaos.getState>['rules'][number]): string {
  const parts: string[] = [];
  if (rule.fail) parts.push(`→ ${rule.fail.status}`);
  if (rule.error) parts.push(rule.error === 'network' ? 'network error' : 'timeout');
  if (rule.malformed) parts.push('malformed body');
  if (rule.latency !== undefined) {
    parts.push(
      typeof rule.latency === 'number'
        ? `${rule.latency} ms`
        : `${rule.latency[0]}–${rule.latency[1]} ms`,
    );
  }
  const text = parts.join(', ');
  return rule.rate !== undefined && rule.rate < 1
    ? `${Math.round(rule.rate * 100)}% ${text}`
    : text;
}

/** Quick actions offered for a logged request: each turns into a panel rule for its endpoint. */
export const QUICK_ACTIONS = {
  'Fail 500': { fail: { status: 500 } },
  'Slow 3s': { latency: 3000 },
  Timeout: { error: 'timeout' },
  Flaky: { rate: 0.5, fail: { status: 503 }, latency: [300, 2000] },
} as const;

/** `GET /api/orders?id=1` becomes `GET /api/orders*`. */
export function endpointMatch(method: string, url: string): string {
  const path = url.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/)[0] || '/';
  return `${method.toUpperCase()} ${path}*`;
}
