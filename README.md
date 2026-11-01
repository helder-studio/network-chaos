<div align="center">

# @helder-studio/network-chaos

**Test slow, flaky and failing APIs on a real device. No proxy, no dev tools.**

Rules, presets and a QA panel that delay or fail your app's requests on purpose, and remember the
settings across restarts. React Native and web.

[![npm](https://img.shields.io/npm/v/@helder-studio/network-chaos?color=cb3837&logo=npm)](https://www.npmjs.com/package/@helder-studio/network-chaos)
[![bundle size](https://img.shields.io/bundlejs/size/@helder-studio/network-chaos?label=min%2Bgzip)](https://bundlejs.com/?q=@helder-studio/network-chaos)
[![CI](https://github.com/helder-studio/network-chaos/actions/workflows/ci.yml/badge.svg)](https://github.com/helder-studio/network-chaos/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/npm-provenance-2ea44f?logo=sigstore)](https://www.npmjs.com/package/@helder-studio/network-chaos#provenance)
[![license](https://img.shields.io/npm/l/@helder-studio/network-chaos?color=blue)](./LICENSE)

<!-- demo GIF -->

</div>

```sh
npm install @helder-studio/network-chaos
```

## Why

Your app works on office Wi-Fi. Your users ride the subway. Testing loading states, retries and error
screens usually means a desktop proxy, a dev build and a developer. Network Chaos puts the switch in
the app itself: a QA tester taps the badge, sets `/api/orders*` to flaky, and the setting is still
there after an app restart.

## Quick start

```tsx
import { chaos, NetworkChaos } from '@helder-studio/network-chaos';
import { mmkv } from '@helder-studio/storage';

chaos.rule({ match: 'POST /api/orders*', fail: { status: 503 }, rate: 0.5 });
chaos.rule({ match: '*/search*', latency: [800, 3000] });

export default function Root() {
  return (
    <NetworkChaos enabled={__DEV__ || Config.QA_BUILD} storage={mmkv(storage)}>
      <App />
    </NetworkChaos>
  );
}
```

## Features

- 📱 **QA panel on the device**: master switch, presets, rules and a live request log. Tap any request
  to make that endpoint fail, slow, time out or go flaky
- 🎯 **Precise rules**: method + URL glob, host and header matching, latency ranges, status codes,
  network errors, timeouts and malformed bodies
- 🎲 **Reproducible**: seed the random rate rolls and replay the same run
- 💾 **Survives restarts**: panel settings are saved through any
  [`@helder-studio/storage`](https://github.com/helder-studio/storage) adapter
- 🔌 **Covers every client**: patches `XMLHttpRequest` (React Native's `fetch` and axios run on it) and
  `fetch` on the web
- ⏱️ **Honest timing**: delays honour `AbortController`, and a timeout hangs until the client gives up
- 🚫 **Production-safe**: `enabled={false}` patches nothing, a `/noop` entry drops the code from release
  bundles, and a badge shows whenever chaos is active

## Rules

```ts
chaos.rule({ match: 'GET /api/feed*', latency: 2000 }); // fixed delay
chaos.rule({ match: '*/search*', latency: [800, 3000] }); // random delay in a range
chaos.rule({ match: 'POST /api/orders*', fail: { status: 503 }, rate: 0.5 }); // half fail
chaos.rule({ match: '/api/profile', error: 'network' }); // like offline
chaos.rule({ match: '/api/upload*', error: 'timeout' }); // hangs until aborted
chaos.rule({ match: '/api/config', malformed: true }); // 200 with broken JSON
chaos.rule({ match: '*', host: 'api.example.com', headers: { 'x-beta': '1' }, latency: 500 });
```

| Field       | Type                          | Notes                                                   |
| ----------- | ----------------------------- | ------------------------------------------------------- |
| `match`     | `string`                      | optional method, then a glob; `/…` matches path + query |
| `host`      | `string`                      | host glob                                               |
| `headers`   | `Record<string, string>`      | exact values, names case-insensitive                    |
| `rate`      | `0`–`1`                       | chance the rule applies, default `1`                    |
| `latency`   | `number` or `[min, max]` (ms) | longest latency of all matching rules wins              |
| `fail`      | `{ status, body? }`           | answers without calling the server                      |
| `error`     | `'network'` or `'timeout'`    |                                                         |
| `malformed` | `boolean`                     | answers 200 with truncated JSON                         |

The first matching rule with an outcome (`fail`, `error`, `malformed`) decides it.

## Controller

```ts
chaos.preset('flaky'); // 'offline' | 'slow-3g' | '3g' | 'flaky' | null
chaos.setOffline(true);
chaos.open(); // open the panel from your own dev menu or shake handler
chaos.seed(42); // reproducible rate rolls
chaos.ignore(['*/analytics*']); // never touch these (Metro on :8081 is always ignored)
chaos.getLog(); // last 200 requests with outcome and status
```

## Install early

Interception starts when `<NetworkChaos enabled>` first renders. If an HTTP client grabs `fetch`
before that, call `chaos.install()` at the top of your entry file instead.

## With dev-dock

Using several helder-studio tools? Show them in one floating panel with
[`@helder-studio/dev-dock`](https://github.com/helder-studio/dev-dock):

```tsx
import { NetworkChaos, networkChaosTab } from '@helder-studio/network-chaos';
import { DevDock } from '@helder-studio/dev-dock';

<NetworkChaos enabled={qa} storage={storage} badge={false}>
  <App />
  <DevDock enabled={qa} tabs={[networkChaosTab]} />
</NetworkChaos>;
```

## Keep it out of production

```js
// metro.config.js (release builds)
config.resolver.resolveRequest = (context, name, platform) =>
  context.resolveRequest(
    context,
    name === '@helder-studio/network-chaos' && !isQaBuild
      ? '@helder-studio/network-chaos/noop'
      : name,
    platform,
  );
```

The `/noop` entry has the same API and does nothing.

## Coming soon

- Web panel (the web build shows a status badge and is driven by `chaos.*` for now)
- `/testing` helper so Jest and Vitest reuse the same rules
- Share a chaos setup by deep link or QR code

## Compared with other tools

[chaos-fetch](https://github.com/fetch-kit/chaos-fetch) wraps `fetch` on the web; it doesn't see
`XMLHttpRequest` (so not React Native's `fetch` or axios) and has no on-device UI.
[react-native-network-logger](https://github.com/alexbrazier/react-native-network-logger) shows traffic
but can't change it. Proxies like Charles need a desktop and certificates. Network Chaos is for the
person holding the phone.

## Support

If this saves you time, you can buy me a coffee on Ko-fi. It keeps the helder-studio libraries maintained.

<a href="https://ko-fi.com/gorian" target="_blank" rel="noopener">
  <img src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="Support me on Ko-fi" height="40">
</a>

## License

[MIT](./LICENSE) © helder-studio
