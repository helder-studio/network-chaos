import { createChaos } from './core/engine';
import { install as installInterceptors, uninstall } from './intercept/install';

const engine = createChaos();

/**
 * The global chaos controller. Rules added here apply once interception is installed, either by
 * rendering `<NetworkChaos enabled>` or by calling `chaos.install()` at the top of your entry file.
 */
export const chaos = {
  ...engine,
  /** Patches fetch and XMLHttpRequest now. Call before any HTTP client captures `fetch`. */
  install: () => installInterceptors(engine),
  uninstall,
};

export type ChaosController = typeof chaos;
