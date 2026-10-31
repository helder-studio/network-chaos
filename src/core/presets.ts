import type { Rule } from './rules';

export type PresetName = 'offline' | 'slow-3g' | '3g' | 'flaky';

/** `offline` has no rules: it sets the offline switch instead. */
export const PRESETS: Record<PresetName, Rule[]> = {
  offline: [],
  'slow-3g': [{ id: 'preset:slow-3g', match: '*', latency: [2000, 4000] }],
  '3g': [{ id: 'preset:3g', match: '*', latency: [300, 800] }],
  flaky: [
    { id: 'preset:flaky:latency', match: '*', latency: [100, 1500] },
    { id: 'preset:flaky:503', match: '*', rate: 0.2, fail: { status: 503 } },
    { id: 'preset:flaky:timeout', match: '*', rate: 0.05, error: 'timeout' },
  ],
};
