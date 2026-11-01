import type { ReactNode } from 'react';
import type { ChaosController } from './chaos';
import type { NetworkChaosProps } from './react/shared';

export type { ChaosController } from './chaos';
export type { ChaosState, LogEntry, Outcome } from './core/engine';
export type { PresetName } from './core/presets';
export type { ChaosRequest, Range, Rule } from './core/rules';
export type { NetworkChaosProps } from './react/shared';

const noop = () => {};
const state = { on: false, offline: false, preset: null, rules: [], open: false };

/**
 * Production stand-in with the same API that patches nothing. Alias the package to
 * `@helder-studio/network-chaos/noop` in release builds to keep the real code out of the bundle.
 */
export const chaos: ChaosController = {
  getState: () => state,
  getLog: () => [],
  subscribe: () => noop,
  rule: () => '',
  panelRule: () => '',
  removeRule: noop,
  toggleRule: noop,
  clearRules: noop,
  setOn: noop,
  setOffline: noop,
  preset: noop,
  open: noop,
  close: noop,
  seed: noop,
  ignore: noop,
  clearLog: noop,
  hydrate: async () => {},
  decide: () => ({ effect: null, finish: noop }),
  install: () => noop,
  uninstall: noop,
};

export function NetworkChaos({ children }: NetworkChaosProps): ReactNode {
  return children ?? null;
}

export function NetworkChaosPanel(): null {
  return null;
}

export const networkChaosTab = {
  id: 'network-chaos',
  title: 'Network',
  status: () => null,
  subscribe: () => noop,
  render: () => null,
};
