---

name: ship-change
description: Take a code change in this repo to done - tests next to the code, pnpm verify green, changeset, README and noop entry updated, clean commit. Use after implementing a fix or feature, or when the user says ship, finish or wrap up a change.
---

# Ship a change

1. Read `AGENTS.md` (rules) and `CLAUDE.md` (library notes) if you haven't in this session.
2. Tests: every changed behaviour has a test next to its source (`*.test.ts(x)`). A bug fix has a
   test that fails without the fix; check that by reasoning about the old code or running it.
3. Public API changed? Update `src/noop.ts` to the same shape (if the repo has one), the README
   (usage + API table) and the exported types in `src/index.ts` / `src/native.ts`.
4. Run `pnpm verify`. Fix every failure; don't skip or weaken checks. Formatting issues: `pnpm format`.
5. User-visible? Add a changeset non-interactively:
   `pnpm changeset --patch|--minor @helder-studio/<name> -m "Fix: …" / "Add: …"`.
6. Commit with a plain imperative message and no AI attribution. Don't push, publish or tag unless
   the user asks; releases go through the "Version Packages" PR.
7. Report: what changed, the verify result (test count, sizes), and anything not verified (for
   example, React Native UI that wasn't run on a device).
