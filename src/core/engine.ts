import type { StorageAdapter } from '@helder-studio/storage';
import { PRESETS, type PresetName } from './presets';
import { seededRandom } from './random';
import {
  type ChaosRequest,
  type Effect,
  globToRegExp,
  pickRange,
  type Range,
  type Rule,
  resolveEffect,
} from './rules';

export type Outcome =
  | 'passed'
  | 'delayed'
  | 'failed'
  | 'network error'
  | 'timeout'
  | 'malformed'
  | 'stream chaos';

export interface LogEntry {
  id: number;
  time: number;
  method: string;
  url: string;
  outcome: Outcome;
  latencyMs: number;
  /** Final HTTP status, `0` for network errors, `undefined` while pending. */
  status?: number;
}

export interface ChaosState {
  /** Master switch. Off: every request passes untouched. */
  on: boolean;
  offline: boolean;
  preset: PresetName | null;
  /** Rules in evaluation order (preset rules are not listed). */
  rules: (Rule & { id: string; enabled: boolean; source: 'code' | 'panel' })[];
  /** The panel is open. */
  open: boolean;
}

interface Persisted {
  v: 1;
  on: boolean;
  offline: boolean;
  preset: PresetName | null;
  disabled: string[];
  panelRules: (Rule & { id: string })[];
}

const KEY = 'helder-studio:network-chaos';
const LOG_SIZE = 200;
/** Metro dev server traffic is never touched. */
const DEFAULT_IGNORE = ['*:8081/*', '*/symbolicate*', '*/logs*'];

function outcomeOf(effect: Effect | null): Outcome {
  if (!effect) return 'passed';
  if (effect.fail) return 'failed';
  if (effect.error === 'network') return 'network error';
  if (effect.error === 'timeout') return 'timeout';
  if (effect.malformed) return 'malformed';
  if (effect.stream) return 'stream chaos';
  return 'delayed';
}

function idFor(rule: Rule): string {
  return rule.id ?? `rule:${JSON.stringify(rule)}`;
}

export function createChaos(now: () => number = Date.now) {
  let state: ChaosState = { on: true, offline: false, preset: null, rules: [], open: false };
  let random = Math.random;
  let ignore = DEFAULT_IGNORE.map(globToRegExp);
  let storage: StorageAdapter | undefined;
  let log: LogEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const persist = () => {
    if (!storage) return;
    const data: Persisted = {
      v: 1,
      on: state.on,
      offline: state.offline,
      preset: state.preset,
      disabled: state.rules.filter((r) => !r.enabled).map((r) => r.id),
      panelRules: state.rules
        .filter((r) => r.source === 'panel')
        .map(({ enabled: _e, source: _s, ...rule }) => rule),
    };
    try {
      Promise.resolve(storage.setItem(KEY, JSON.stringify(data))).catch(() => {});
    } catch {
      // Settings stay in memory for this session.
    }
  };

  const set = (patch: Partial<ChaosState>, save = true) => {
    state = { ...state, ...patch };
    if (save) persist();
    emit();
  };

  const upsert = (rule: Rule, source: 'code' | 'panel'): string => {
    const id = idFor(rule);
    const existing = state.rules.find((r) => r.id === id);
    const next = { ...rule, id, enabled: existing?.enabled ?? true, source };
    set(
      {
        rules: existing ? state.rules.map((r) => (r.id === id ? next : r)) : [...state.rules, next],
      },
      source === 'panel',
    );
    return id;
  };

  return {
    getState: () => state,
    getLog: () => log,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Adds or replaces a rule (same id or same definition replaces). Returns its id. */
    rule: (rule: Rule) => upsert(rule, 'code'),
    /** Adds a rule from the panel; panel rules are saved to storage. */
    panelRule: (rule: Rule) => upsert(rule, 'panel'),
    removeRule(id: string) {
      set({ rules: state.rules.filter((r) => r.id !== id) });
    },
    toggleRule(id: string, enabled: boolean) {
      set({ rules: state.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) });
    },
    clearRules() {
      set({ rules: [] });
    },
    setOn: (on: boolean) => set({ on }),
    setOffline: (offline: boolean) =>
      set({ offline, preset: !offline && state.preset === 'offline' ? null : state.preset }),
    /** Applies a preset; `null` clears it. `'offline'` also flips the offline switch. */
    preset(name: PresetName | null) {
      set({
        preset: name,
        offline: name === 'offline' || (state.preset !== 'offline' && state.offline),
      });
    },
    open: () => set({ open: true }, false),
    close: () => set({ open: false }, false),
    /** A value from a `Range`, using the (seedable) random source. */
    pick: (range: Range) => pickRange(range, random),
    /** Seeds rate rolls so a run is reproducible. */
    seed(value: number) {
      random = seededRandom(value);
    },
    /** URL globs that are never touched, on top of the Metro dev server. */
    ignore(globs: string[]) {
      ignore = [...DEFAULT_IGNORE, ...globs].map(globToRegExp);
    },
    clearLog() {
      log = [];
      emit();
    },

    /** Loads saved panel settings. Code rules registered earlier keep their place. */
    async hydrate(adapter: StorageAdapter) {
      let raw: string | null = null;
      try {
        raw = await adapter.getItem(KEY);
      } catch {
        // Start from defaults.
      }
      let data: Persisted | undefined;
      try {
        data = raw ? (JSON.parse(raw) as Persisted) : undefined;
      } catch {
        data = undefined;
      }
      // Attach storage only now, so nothing written while loading overwrites the saved settings.
      storage = adapter;
      if (data?.v !== 1) return;
      const disabled = new Set(data.disabled);
      const codeRules = state.rules.filter((r) => r.source === 'code');
      const panelRules = data.panelRules.map((r) => ({
        ...r,
        enabled: true,
        source: 'panel' as const,
      }));
      set(
        {
          on: data.on,
          offline: data.offline,
          preset: data.preset,
          rules: [...codeRules, ...panelRules].map((r) => ({ ...r, enabled: !disabled.has(r.id) })),
        },
        false,
      );
    },

    /**
     * Called by the interceptors for every request. Returns the effect to apply and a callback
     * that records the final status in the log.
     */
    decide(req: ChaosRequest): { effect: Effect | null; finish: (status: number) => void } {
      if (ignore.some((re) => re.test(req.url))) return { effect: null, finish: () => {} };
      let effect: Effect | null = null;
      if (state.on) {
        if (state.offline) {
          effect = { latencyMs: 0, error: 'network', rules: ['offline'] };
        } else {
          const rules = [
            ...(state.preset ? PRESETS[state.preset] : []).map((r) => ({ ...r, id: idFor(r) })),
            ...state.rules.filter((r) => r.enabled),
          ];
          effect = resolveEffect(rules, req, random);
        }
      }
      const entry: LogEntry = {
        id: nextId++,
        time: now(),
        method: req.method.toUpperCase(),
        url: req.url,
        outcome: outcomeOf(effect),
        latencyMs: effect?.latencyMs ?? 0,
      };
      log = [entry, ...log].slice(0, LOG_SIZE);
      emit();
      return {
        effect,
        finish(status) {
          log = log.map((e) => (e.id === entry.id ? { ...e, status } : e));
          emit();
        },
      };
    },
  };
}

export type Chaos = ReturnType<typeof createChaos>;
