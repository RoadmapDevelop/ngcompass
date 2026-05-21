You are cleaning up the `packages/__PACKAGE_NAME__` package in the ngcompass
monorepo. Most of this code was produced by LLM sessions and accumulated
artifacts that need to be removed before the repo goes public.

Read CLAUDE.md at the repo root first. It defines the coding standards and
architecture this package must conform to. Treat it as the source of truth.

## What to do

Run this in three phases. Do not skip the audit phase.

### Phase 1 — Audit (read-only)

Read every .ts file in packages/__PACKAGE_NAME__/src recursively. Build a
written list of issues found, grouped by category:

  1. **Restated comments**: comments that describe WHAT the code does (the
     code already says that). Includes JSDoc blocks that just repeat the
     function name in prose.
  2. **Outdated comments**: comments that no longer match the code below
     them (renamed variables, changed logic, removed parameters).
  3. **Dead code**: unused exports, unused imports, unreachable branches,
     commented-out blocks, no-op functions, functions never called.
  4. **Defensive checks for impossible states**: `if (typeof x !== 'string')`
     when x is typed as string, null checks on non-nullable types, etc.
  5. **"Just in case" try/catch**: try/catch blocks around code that cannot
     throw, or that swallow errors without handling them.
  6. **Magic numbers**: numeric literals that should be named constants
     (see existing `LIMITS`/`CACHE_LIMIT` patterns in this codebase).
  7. **Inconsistent JSDoc style**: some files have `@fileoverview` headers,
     others don't. Some exported functions have JSDoc, others don't. List
     the inconsistencies — but use the existing style in
     packages/engine/src/rule-handler.ts as the reference for what's right.
  8. **Inconsistent naming**: identifiers in this package that don't match
     the naming conventions in CLAUDE.md (e.g. boolean not prefixed `is*`,
     functions starting with `do`/`handle`/`process`, etc).
  9. **`any` types, `as` casts, `// @ts-ignore`** without justification.
 10. **Console.log / debugger statements** left from development.
 11. **TODO/FIXME/XXX comments** without an issue link or context.
 12. **Verbose intermediate variables**: `const result = x; return result;`
     and similar one-use locals that don't aid readability.
 13. **Hardcoded paths or environment values** that should be parameters or
     constants.
 14. **Architectural violations**: imports that cross package boundaries
     incorrectly per the layered architecture in CLAUDE.md. Imports from
     another package's src/ instead of its public exports. Circular imports.
 15. **Duplicate logic**: the same helper implemented in 2+ places in this
     package. (Don't search across packages — keep this audit scoped.)

For each issue, record: file path, line number, category, and a one-line
description of the fix. Do not make any edits yet. Present this audit list
back to me and stop.

### Phase 2 — Propose

After I review the audit, you'll get a go-ahead. Then propose specific edits
for each approved issue. For complex cases (anything that changes function
signatures, removes exports, or moves code across files) ask before applying.

### Phase 3 — Apply

Apply approved edits. After every ~5 edits, run:

    pnpm --filter @ngcompass/__PACKAGE_NAME__ vitest run

If tests fail, stop and report which edit broke them. Do not "fix" failing
tests by changing their assertions.

After all edits, run:

    pnpm --filter @ngcompass/__PACKAGE_NAME__ typecheck
    pnpm --filter @ngcompass/__PACKAGE_NAME__ vitest run

Both must pass before you call the task done.

## Hard constraints — do not violate these

- **Do not change runtime behavior.** This is a cosmetic + dead-code +
  consistency pass. No logic changes, no algorithm improvements, no
  performance optimizations, no API redesigns.
- **Do not change public exports.** The shape of every exported function,
  class, interface, and type stays identical. Adding JSDoc is fine; changing
  parameter names or types is not.
- **Do not change file names or move code between files** unless explicitly
  approved during Phase 2.
- **Do not modify other packages.** This task is scoped to
  packages/__PACKAGE_NAME__ only. If you discover something wrong in another
  package, list it in the final report but do not touch it.
- **Do not "improve" tests.** Tests get the same comment/dead-code cleanup
  as source files, but no assertion changes, no test restructuring, no
  added or removed test cases.
- **Do not add new abstractions, helpers, or utility files.** If two files
  duplicate logic, list it for review — don't auto-extract.
- **Do not delete @fileoverview blocks even if they feel verbose.** This
  codebase intentionally uses them (see CLAUDE.md "Comments" section).
- **Do not touch the LICENSE, package.json, README.md, or tsconfig files.**
- **Do not run git commit, git push, or any destructive git command.** I
  will commit after reviewing.

## Output

At the end, give me a summary in this format:

  Package: __PACKAGE_NAME__
  Files audited: N
  Files modified: N
  Issues found per category: [list with counts]
  Issues fixed: N
  Issues deferred (needs my decision): N — with their list
  Tests: PASS / FAIL
  Typecheck: PASS / FAIL
  Estimated review time: X minutes

Start with Phase 1 now. Read CLAUDE.md, then read every .ts file under
packages/__PACKAGE_NAME__/src, then present the audit.