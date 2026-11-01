import { createChaos } from './core/engine';
import type { Rule } from './core/rules';
import { install, uninstall } from './intercept/install';

export type { Effect, Rule } from './core/rules';

/**
 * Chaos for Jest and Vitest: same rules and effects as the app, applied to whatever `fetch` and
 * `XMLHttpRequest` the test environment provides (jsdom, happy-dom, msw, Node's fetch).
 *
 * ```ts
 * const chaos = createTestChaos({ seed: 1, rules: [{ match: 'POST /api/orders*', fail: { status: 503 } }] });
 * afterEach(() => chaos.restore());
 * ```
 */
export function createTestChaos(
  options: { rules?: Rule[]; seed?: number; offline?: boolean } = {},
) {
  uninstall(); // one active instance at a time
  const chaos = createChaos();
  chaos.ignore([]); // tests may hit localhost:8081 on purpose
  if (options.seed !== undefined) chaos.seed(options.seed);
  for (const rule of options.rules ?? []) chaos.rule(rule);
  if (options.offline) chaos.setOffline(true);
  install(chaos);
  return {
    ...chaos,
    /** Puts the original fetch and XMLHttpRequest back. */
    restore: (): void => uninstall(),
  };
}
