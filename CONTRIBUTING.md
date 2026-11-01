# Contributing to @helder-studio/network-chaos

Thanks for helping! Bug reports, docs fixes and pull requests are all welcome.

## Setup

You need Node 24 and pnpm 11 (`corepack enable` picks the right pnpm from `package.json`).

```sh
pnpm install
pnpm verify
```

## Making a change

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Add or update a test next to the code you change (`*.test.ts(x)`). Bug fixes need a test that
   fails without the fix.
3. Run `pnpm verify`. It must pass; CI runs the same command.
4. If users will notice the change, add a changeset:
   `pnpm changeset --patch @helder-studio/network-chaos -m "Fix: …"` (or `--minor` for a feature).
5. Update `README.md` when the public API or behaviour changes.

The design rules (no runtime dependencies, pure-TS core, SSR safety, production safety) are in
[AGENTS.md](./AGENTS.md). They apply to humans and AI agents alike.

## Using an AI agent

This repo is set up for AI coding agents: `AGENTS.md` has the rules, `CLAUDE.md` the library notes,
and `.claude/` a format-on-save hook, safe permissions and a `/ship-change` skill for Claude Code.
Review what the agent wrote before opening a pull request, and leave AI attribution out of commits.

## Releases

Maintainers merge the automated "Version Packages" pull request; CI then publishes to npm with
provenance. Please don't bump versions or edit `CHANGELOG.md` by hand.
