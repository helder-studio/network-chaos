import type { Rule } from './rules';

export type PresetName =
  | 'offline'
  | 'slow-3g'
  | '3g'
  | 'flaky'
  | 'llm-slow'
  | 'llm-flaky'
  | 'llm-rate-limited'
  | 'llm-overloaded';

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
  // LLM presets only touch LLM API calls (see `llm` in Rule).
  'llm-slow': [
    {
      id: 'preset:llm-slow',
      match: '*',
      llm: true,
      latency: [1500, 4000],
      stream: { chunkDelayMs: [150, 400] },
    },
  ],
  'llm-flaky': [
    { id: 'preset:llm-flaky:slow', match: '*', llm: true, stream: { chunkDelayMs: [50, 300] } },
    { id: 'preset:llm-flaky:cut', match: '*', llm: true, rate: 0.25, stream: { cutAfter: 8 } },
    { id: 'preset:llm-flaky:stall', match: '*', llm: true, rate: 0.1, stream: { stallAfter: 5 } },
    { id: 'preset:llm-flaky:429', match: '*', llm: true, rate: 0.15, llmError: 'rate-limit' },
  ],
  'llm-rate-limited': [
    { id: 'preset:llm-rate-limited', match: '*', llm: true, llmError: 'rate-limit' },
  ],
  'llm-overloaded': [
    { id: 'preset:llm-overloaded', match: '*', llm: true, llmError: 'overloaded' },
  ],
};
