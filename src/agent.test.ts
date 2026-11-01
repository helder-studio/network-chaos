import { afterEach, describe, expect, it } from 'vitest';
import { chaosAgentTools } from './agent';
import { chaos } from './chaos';

const call = (name: string, input: Record<string, unknown> = {}) => {
  const tool = chaosAgentTools.find((t) => t.tool.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(input);
};

afterEach(() => call('chaos-clear'));

describe('chaosAgentTools', () => {
  it('describe every tool with a unique name and an object schema', () => {
    const names = chaosAgentTools.map((t) => t.tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of chaosAgentTools) expect(t.tool.inputSchema.type).toBe('object');
  });

  it('apply presets and rules, read the log, and clear', () => {
    call('chaos-set-preset', { preset: 'llm-flaky' });
    expect(chaos.getState().preset).toBe('llm-flaky');
    const { id } = call('chaos-add-rule', {
      match: 'POST /api/orders*',
      fail: { status: 503 },
    }) as { id: string };
    expect(chaos.getState().rules.find((r) => r.id === id)?.source).toBe('panel');
    chaos.decide({ method: 'POST', url: 'https://x.dev/api/orders' });
    expect(call('chaos-get-log', { limit: 1 })).toMatchObject([{ outcome: 'failed' }]);
    call('chaos-clear');
    expect(chaos.getState()).toMatchObject({ preset: null, offline: false, rules: [] });
  });
});
