# @helder-studio/network-chaos

## 0.2.0

### Minor Changes

- 7f98a09: Add chaosAgentTools (React Native): tool definitions so AI coding agents can set presets, add rules and read the request log through Rozenite for Agents.
- 26bd9ca: Add LLM and streaming chaos: slow, stalled, dropped or malformed token streams, real OpenAI/Anthropic/Gemini rate-limit, overload, context-length and content-filter errors, the llm rule filter, and llm-* presets.

## 0.1.0

### Minor Changes

- bf24fcf: Add NetworkChaosPanel, networkChaosTab for dev-dock, and a badge prop to hide the built-in badge.
- 3cf1f70: Add the web panel (click the badge) and createTestChaos in @helder-studio/network-chaos/testing for Jest and Vitest.
- ae51a6f: First release: rule matcher, presets, seeded rate rules, fetch and XMLHttpRequest interception, request log, saved settings, and the React Native QA panel.

### Patch Changes

- 3f74d1d: Fix: the timeout effect now honours xhr.timeout (axios), reused XMLHttpRequest instances reset after a faked response, synchronous XHR passes untouched, hydration runs once even with an inline storage adapter, and the web panel keeps focus outlines.
