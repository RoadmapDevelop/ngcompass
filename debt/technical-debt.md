# Remaining Technical Debt & Future Roadmap

This document track's the remaining technical debt and identifies areas for further improvement following the Phase 1.95 and P1 debt resolution.

## 1. Resolved Issues (Phase 1.95 & P1)

The following high-priority issues have been successfully addressed:

- **[FIXED] taskId Propagation**: `taskId` is now correctly included in `RuleResult`, enabling the incremental cache to function.
- **[FIXED] Cache Pruning**: `ResultCache` now supports deletion, and `pruneStaleCache` correctly removes old/infrequent entries.
- **[FIXED] Performance (Planning)**: Sync `existsSync` calls in `resources.ts` were replaced with async `readdir` and a directory cache.
- **[FIXED] Hashing Reliability**: `calculateTaskId` now includes file paths, and `hashFile` enforces UTF-8 to avoid `ERR_INVALID_ARG_TYPE`.
- **[FIXED] Type Safety (Context)**: Smuggled state like `_globalHash` has been replaced with proper fields on `TaskBuilderContext`.
- **[FIXED] Logger Integration**: Replaced `console` calls with `logger` from `@ngcompass/common` in `orchestrator.ts` and `builder.ts`.
- **[FIXED] Visitor Consolidation**: Extracted AST traversal into a shared `walkProgram` utility in `visitor.ts`.
- **[FIXED] Result Schema Validation**: Added strict structural validation for `RuleResult` in `orchestrator.ts`.

## 2. Priority Debt (P3 - Medium)

| # | Issue | File | Description |
| --- | --- | --- | --- |
| 1 | **Worker Pool Sizing** | `orchestrator.ts` | Dynamically adjust worker count based on machine CPU cores. |
| 2 | **Watch Mode** | `cli/` | Implement a watch mode for near-instant linting feedback. |
| 3 | **Lazy AST Parsing** | `orchestrator.ts` | Optimize to only parse ASTs if needed by enabled rules. |
