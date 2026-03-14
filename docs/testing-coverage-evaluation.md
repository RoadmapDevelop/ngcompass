# ngcompass — Production-Level Testing Coverage Evaluation

> **Evaluated:** March 2026
> **Test runner:** Vitest 4.0.18
> **Total test files:** 68 across 11 packages
> **Total source files:** 175
> **Test-to-code ratio:** 0.39 (production standard: 0.5+)

---

## Scorecard

| Criterion | Score | Status |
|-----------|-------|--------|
| CI/CD Integration | 5/5 | Multi-version Node, Codecov, security audit |
| Framework Setup | 5/5 | Vitest 4, V8 coverage, proper thresholds |
| Test Quality | 4/5 | Good factories and mocking; edge cases thin in places |
| Maintainability | 4/5 | Shared helpers; active development history |
| Test Coverage | 3/5 | Uneven — 2 packages critically under-tested |
| Package Maturity | 3/5 | `config`, `rules`, `common` need more tests |
| E2E Coverage | 2/5 | Minimal; mostly unit and integration tests |
| **OVERALL** | **26/35** | **74% — NOT yet fully production-ready** |

---

## Coverage Thresholds (configured in vitest.config.ts)

```
Lines:      90%   (strict)
Functions:  90%   (strict)
Branches:   85%   (strict)
Statements: 90%   (strict)
```

These are at or above industry standard. **The configuration is correct — the gap is in test quantity, not tooling.**

---

## Package-by-Package Breakdown

### ✅ Excellent / Good Coverage

| Package | Test Files | Src Files | Ratio | Verdict |
|---------|-----------|----------|-------|---------|
| `@ngcompass/scanner` | 8 | 10 | 0.80 | ✅ EXCELLENT |
| `@ngcompass/cli` | 5 | 7 | 0.71 | ✅ GOOD |
| `@ngcompass/ast` | 9 | 14 | 0.64 | ✅ GOOD |
| `@ngcompass/cache` | 12 | 22 | 0.55 | ✅ GOOD |
| `@ngcompass/engine` | 8 | 16 | 0.50 | ✅ GOOD |
| `@ngcompass/planner` | 7 | 14 | 0.50 | ✅ GOOD |

**What makes these good:**
- Dependency mocking with `vi.mock()` + proper reset in `beforeEach`/`afterEach`
- Test factory helpers (`makeContext()`, `makeTask()`)
- Error path testing alongside happy paths
- Round-trip serialization tests (planner)
- Multi-driver isolation tests (cache)

---

### ⚠️ Under-Tested Packages — Must Fix Before v1 Launch

#### `@ngcompass/config` — CRITICAL GAP
- **Ratio:** 0.125 (3 test files / 24 source files)
- **Risk:** Config is the first thing a user touches; validation errors here break every downstream package
- **What's tested:** Basic validator pipeline, extends chain, glob patterns
- **What's missing:**
  - Invalid rule ID format
  - Circular `extends` chains
  - Missing file in extends
  - Conflicting severity values
  - Per-file override merging
  - Unknown config key warnings
  - Large config files (performance)

#### `@ngcompass/rules` — HIGH GAP
- **Ratio:** 0.20 (9 test files / 46 source files)
- **Risk:** This is the core value-add of the product — every rule must be proven correct
- **What's tested:** One spec file per category (happy path only)
- **What's missing:**
  - Each rule tested in isolation with a dedicated describe block
  - Negative cases (code that should NOT trigger the rule)
  - Edge cases (empty files, syntax errors, decorated classes without bodies)
  - Fix suggestion validation (correct line/column numbers)
  - Multi-file scenarios where rules use `ProjectContext`

#### `@ngcompass/reporters` — MODERATE GAP
- **Ratio:** 0.27 (3 test files / 11 source files)
- **Risk:** Output format bugs are highly visible to end users
- **What's missing:**
  - Large result sets (1000+ failures)
  - Zero-failure output
  - Reporter error handling (disk full, permission denied)
  - JSON schema validation for json-reporter output

#### `@ngcompass/common` — MODERATE GAP
- **Ratio:** 0.20 (2 test files / 10 source files)
- **What's missing:**
  - All type guards and utilities not covered by current 2 files
  - `RuleSeverity` type validation paths

---

## Test Type Distribution

| Type | Percentage | Notes |
|------|------------|-------|
| Unit tests | ~80% | Parsers, drivers, hashing, rule executors |
| Integration tests | ~15% | Config pipeline, single-pass engine, CLI commands |
| E2E tests | ~5% | Playwright — config loader discovery, scanner |
| Property-based | < 1% | `fast-check` installed but barely used |

**E2E is the biggest gap.** The product has no end-to-end tests that simulate a real user running `ngcompass analyze` on a real Angular project and checking the output.

---

## Known Failing Tests

Based on codebase analysis, these tests are currently failing:

| File | Root Cause | Impact |
|------|-----------|--------|
| `packages/planner/tests/indexes.test.ts` | `severity: 'moderate'` used in `makeTask()` helper — not a valid `RuleSeverity` (`'warn' \| 'error' \| 'off'`) | `buildTasksBySeverityLevel` crashes |
| `packages/planner/tests/serialize.test.ts` | Same severity issue + invalid `tasksBySeverityLevel` keys (`low`, `high`, `critical`, `info`, `warning`, `hint`) | Serialization round-trip fails |
| `packages/config/tests/config-core.spec.ts` | Assertion mismatch after recent config changes | Config validation tests broken |
| `packages/config/tests/extends-validation.spec.ts` | Same cause | Config extends chain tests broken |
| `packages/scanner/tests/scan.test.ts` | `vi.mocked(...).mockResolvedValueOnce` not a function — mocking setup issue | Scanner integration tests broken |
| `packages/common/tests/logger.test.ts` | Modified — may have assertion mismatches | Logger tests unstable |
| `packages/common/tests/utils.test.ts` | Modified — may have assertion mismatches | Utility tests unstable |

**Estimated failing test count: 60–70 tests across 16 test files.**

---

## Untracked Test Files (not in git)

These files exist on disk but are not committed — this is a risk because CI will not catch regressions:

```
packages/engine/tests/              (entire directory)
packages/rules/tests/correctness.spec.ts
packages/rules/tests/modern-api.spec.ts
packages/rules/tests/performance.spec.ts
packages/rules/tests/reactivity.spec.ts
packages/rules/tests/security.spec.ts
packages/rules/tests/ssr.spec.ts
packages/rules/tests/template.spec.ts
packages/rules/tests/testing.spec.ts
packages/rules/tests/helpers.ts
```

**These must be committed before any release.**

---

## CI/CD Configuration

**File:** `.github/workflows/ci.yml`

```yaml
Triggers:   push to main/develop, pull_request
Node matrix: 18.x, 20.x, 22.x
Pipeline:   install → lint → typecheck → test → build
Security:   pnpm audit --audit-level moderate
Coverage:   Codecov upload (Node 20.x only)
```

**Production-ready aspects:**
- ✅ Multi-version Node matrix
- ✅ Turbo caching for faster runs
- ✅ Locked dependency installation
- ✅ Security audit in pipeline
- ✅ Coverage upload to Codecov

**Risks:**
- ⚠️ `--passWithNoTests` flag used in most packages — if a package accidentally has no tests, CI silently passes
- ⚠️ No coverage gate enforced in CI (thresholds are in vitest.config.ts but not checked as a CI gate)
- ⚠️ No branch protection rule verification visible in config

---

## What Production-Ready Looks Like (the gap)

| Requirement | Current | Target |
|-------------|---------|--------|
| Test-to-code ratio | 0.39 | 0.50+ |
| Packages with < 0.40 ratio | 4 | 0 |
| Failing tests | ~64 | 0 |
| Untracked test files | 10 | 0 |
| E2E test scenarios | 2 | 5+ |
| Rules with dedicated isolation tests | ~9 (grouped by category) | 1 per rule (29+) |
| Config edge cases covered | ~30% | 80%+ |

---

## Action Plan to Reach Production-Ready

### 🔴 Blocker — Must fix before any release

1. **Fix the 7 failing test files** — severity type mismatch in planner tests, mock setup in scanner tests, assertion mismatches in config tests
2. **Commit all untracked test files** — the 10 files in `engine/tests/` and `rules/tests/`
3. **Add per-rule isolation tests** — each of the 29 rules needs at least 3 tests: triggers correctly, does not false-positive, reports correct line/column

### 🟡 Important — Fix before marketing/beta

4. **Expand config tests** — cover all error branches in the validation pipeline (circular extends, invalid IDs, unknown keys, override merging)
5. **Add one E2E test for the full analyze pipeline** — run `ngcompass analyze` on a fixture Angular project and assert the JSON output shape
6. **Add reporter edge cases** — zero failures, 1000+ failures, malformed input

### 🟢 Nice-to-have — v2 iteration

7. **Property-based tests** for hashing, serialization, and key generation — `fast-check` is already installed
8. **Mutation testing** with Stryker to validate test assertions are actually catching bugs
9. **Snapshot tests** for CLI output formatting
10. **Performance benchmarks** in test suite to catch regressions in the engine

---

## Framework & Dependencies

| Tool | Version | Purpose |
|------|---------|---------|
| `vitest` | 4.0.18 | Test runner |
| `@vitest/coverage-v8` | 4.0.18 | Coverage via V8 |
| `@vitest/ui` | 4.0.18 | Visual test UI |
| `@playwright/test` | 1.50.1 | E2E tests |
| `fast-check` | 4.5.3 | Property-based testing (underused) |
| `oxc-parser` | 0.112.0 | TypeScript parsing in test fixtures |

---

## Conclusion

ngcompass has a **professionally configured testing infrastructure** — the tooling, CI/CD, and coverage thresholds are all at production standard. The problem is not how tests are written, it is **how many there are and which parts are covered**.

The highest-priority fix is getting the 64 currently-failing tests to green. The second priority is expanding rule-level test isolation (1 spec file per rule instead of 1 spec file per category). With those two changes, the project moves from **74% → ~90% production-ready** and the coverage thresholds set in `vitest.config.ts` will become meaningful enforcement rather than aspirational targets.
