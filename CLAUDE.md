# @helder-studio/network-chaos

Delays and fails an app's HTTP requests on purpose, with rules, presets and an on-device QA panel.
React Native + web. PDF: "Library 2: Network Chaos".

## Layout

- `src/core/`: pure TS. `rules.ts` (matcher, `resolveEffect`), `random.ts` (seeded PRNG),
  `presets.ts`, `engine.ts` (`createChaos`: state, persistence under `helder-studio:network-chaos`,
  log ring buffer of 200, `decide()` for interceptors).
- `src/intercept/install.ts`: patches XHR everywhere and `fetch` on web only (RN's fetch runs on XHR,
  patching both would double the effect). Idempotent via `Symbol.for('helder-studio.network-chaos')`.
  Fake responses set instance props and dispatch events (`{ type }` objects when `Event` is missing).
- `src/chaos.ts`: the `chaos` singleton. `src/react/`: shared hooks + web component (badge only).
  `src/native/`: RN component with draggable badge and Modal panel (core RN primitives only).
- Entries: `index` (web), `native` (exports condition `react-native`), `noop` (same API, does nothing).

## Decisions

- Spike rescoped (2026-10-31): no devices here, and `@mswjs/interceptors` would break the
  no-runtime-dependency rule, so the XHR/fetch patch is hand-written. Needs the manual device check.
- Interception installs during render of `<NetworkChaos enabled>` so children's effects are covered;
  `chaos.install()` exists for apps whose HTTP client captures `fetch` at import.
- Code rules (`chaos.rule`) are not saved; panel rules, toggles, preset and switches are.
- `malformed` answers 200 with truncated JSON instead of corrupting a real response (simpler, same test value).
- attw runs with `--profile node16`: node10 can't resolve the `./noop` subpath.

## Open

DOM panel and `/testing` helper (v0.2), Expo example, device QA checklist, late-install warning.

## Commands

`pnpm verify`, `pnpm coverage`, `pnpm changeset`.
