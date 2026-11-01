# @helder-studio/network-chaos

Shared rules, commands and conventions: @AGENTS.md

Delays and fails an app's HTTP requests on purpose, with rules, presets and an on-device QA panel.
React Native + web. PDF: "Library 2: Network Chaos".

## Layout

- `src/core/`: pure TS. `rules.ts` (matcher, `resolveEffect`), `random.ts` (seeded PRNG),
  `presets.ts`, `engine.ts` (`createChaos`: state, persistence under `helder-studio:network-chaos`,
  log ring buffer of 200, `decide()` for interceptors).
- `src/intercept/install.ts`: patches XHR everywhere and `fetch` on web only (RN's fetch runs on XHR,
  patching both would double the effect). Idempotent via `Symbol.for('helder-studio.network-chaos')`.
  Fake responses set instance props and dispatch events (`{ type }` objects when `Event` is missing).
- `src/chaos.ts`: the `chaos` singleton. `src/react/`: shared hooks + web component (badge + DOM panel).
  `src/native/`: RN component with draggable badge and Modal panel (core RN primitives only).
- Entries: `index` (web, DOM panel), `native` (exports condition `react-native`), `noop` (same API,
  does nothing), `testing` (`createTestChaos` for Jest/Vitest).

- `src/core/llm.ts`: provider detection (host, then path shape) and real error bodies per provider.
  Stream effects wrap `Response.body` in `intercept/install.ts` (`chaosStream`); RN XHR streaming is
  not covered (v0.3 scope).

## Decisions

- Spike rescoped (2026-10-31): no devices here, and `@mswjs/interceptors` would break the
  no-runtime-dependency rule, so the XHR/fetch patch is hand-written. Needs the manual device check.
- Interception installs during render of `<NetworkChaos enabled>` so children's effects are covered;
  `chaos.install()` exists for apps whose HTTP client captures `fetch` at import.
- Code rules (`chaos.rule`) are not saved; panel rules, toggles, preset and switches are.
- `malformed` answers 200 with truncated JSON instead of corrupting a real response (simpler, same test value).
- Web size limit 6 kB since v0.3 (provider error bodies).
- attw runs with `--profile node16`: node10 can't resolve the `./noop` subpath.

## Open

Expo example, device QA checklist, late-install warning, share-by-QR. Web DOM panel and `/testing` (`createTestChaos`) done.

## Commands

`pnpm verify`, `pnpm coverage`, `pnpm changeset`.
