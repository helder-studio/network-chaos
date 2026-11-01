import { chaos } from './chaos';
import type { PresetName } from './core/presets';
import type { Rule } from './core/rules';

/**
 * A tool an AI coding agent can call in the running app. The shape matches Rozenite's
 * `useRozeniteInAppAgentTool({ domain, tool, handler })`, without depending on it.
 */
export interface AgentTool {
  tool: { name: string; description: string; inputSchema: Record<string, unknown> };
  handler: (input: Record<string, unknown>) => unknown;
}

const PRESETS: PresetName[] = [
  'offline',
  'slow-3g',
  '3g',
  'flaky',
  'llm-slow',
  'llm-flaky',
  'llm-rate-limited',
  'llm-overloaded',
];

/** Lets an agent drive network chaos: presets, rules, offline and the request log. */
export const chaosAgentTools: AgentTool[] = [
  {
    tool: {
      name: 'chaos-set-preset',
      description: 'Apply a network chaos preset to the running app, or clear it with null.',
      inputSchema: {
        type: 'object',
        properties: { preset: { type: ['string', 'null'], enum: [...PRESETS, null] } },
        required: ['preset'],
      },
    },
    handler: ({ preset }) => {
      chaos.preset((preset ?? null) as PresetName | null);
      return chaos.getState();
    },
  },
  {
    tool: {
      name: 'chaos-add-rule',
      description:
        'Add a rule. match: optional method + URL glob ("POST /api/orders*"). Effects: latency (ms or [min,max]), fail {status}, error ("network"|"timeout"), llmError, stream {chunkDelayMs, stallAfter, cutAfter}, rate (0-1).',
      inputSchema: {
        type: 'object',
        properties: {
          match: { type: 'string' },
          latency: {},
          fail: { type: 'object' },
          error: { type: 'string', enum: ['network', 'timeout'] },
          llm: { type: 'boolean' },
          llmError: {
            type: 'string',
            enum: ['rate-limit', 'overloaded', 'context-length', 'content-filter'],
          },
          stream: { type: 'object' },
          rate: { type: 'number' },
        },
        required: ['match'],
      },
    },
    handler: (input) => ({ id: chaos.panelRule(input as unknown as Rule) }),
  },
  {
    tool: {
      name: 'chaos-clear',
      description: 'Remove all rules, clear the preset and go back online.',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: () => {
      chaos.clearRules();
      chaos.preset(null);
      chaos.setOffline(false);
      return chaos.getState();
    },
  },
  {
    tool: {
      name: 'chaos-get-log',
      description: 'Recent requests with outcome, latency and status, newest first.',
      inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    },
    handler: ({ limit }) => chaos.getLog().slice(0, typeof limit === 'number' ? limit : 20),
  },
];
