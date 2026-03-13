# ngcompass — Market Readiness Evaluation

> Deep assessment across every dimension that determines whether a tool like this survives and succeeds in the market.
> Last updated: 2026-03-14

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Rule Coverage](#2-rule-coverage)
3. [Preset System](#3-preset-system)
4. [Configuration Experience](#4-configuration-experience)
5. [Performance & Scalability](#5-performance--scalability)
6. [Output & Developer Experience](#6-output--developer-experience)
7. [Rule Quality & False Positive Risk](#7-rule-quality--false-positive-risk)
8. [Testing Coverage](#8-testing-coverage)
9. [Extensibility & Ecosystem](#9-extensibility--ecosystem)
10. [Market Positioning](#10-market-positioning)
11. [Summary Scorecard](#11-summary-scorecard)
12. [The Three Things That Matter Most Right Now](#12-the-three-things-that-matter-most-right-now)

---

## 1. Executive Summary

**ngcompass** is a monorepo-based static analysis tool purpose-built for Angular applications. Its architecture is production-grade: a parallel worker engine, multi-layer caching, content-addressed task deduplication, cross-file type-aware analysis, and a rich preset/resolution pipeline. The engineering quality is high.

The problem is the gap between the engine and the product. The execution core is at roughly 8/10. The user-facing surface — config bootstrapping, documentation, auto-fix, IDE integration, per-rule tests — is at 4/10. A developer who installs the package today and tries to get started will struggle before they ever see a rule fire.

The market window is real and narrow. Angular 17–19 signal adoption is the most active migration pressure the ecosystem has seen in five years. ngcompass is currently the only tool attempting to guide that migration comprehensively. That advantage shrinks every month that `angular-eslint` expands its signal coverage.

---

## 2. Rule Coverage

**Current: 29 rules across 7 categories. Verdict: Good depth, visible gaps.**

### Complete Rule Inventory

#### Change Detection & Architecture (3 rules)

| Rule | Severity | What It Checks |
|---|---|---|
| `prefer-on-push-component-change-detection` | error | Enforces `ChangeDetectionStrategy.OnPush` on all components |
| `component-no-manual-detect-changes` | error | Prevents manual `detectChanges()` / `markForCheck()` calls |
| `template-trackby-required-for-ngfor` | error | Requires `trackBy` on `*ngFor` loops |

#### Dependency Injection (1 rule)

| Rule | Severity | What It Checks |
|---|---|---|
| `prefer-inject-over-constructor-di` | warn | Encourages `inject()` function over constructor DI |

#### RxJS → Signals Migration (7 rules)

| Rule | Severity | What It Checks |
|---|---|---|
| `rxjs-no-subscribe-in-component` | error | Disallows open-ended subscriptions in components |
| `rxjs-require-takeUntilDestroyed` | error | Requires teardown operator on long-lived subscriptions |
| `rxjs-no-nested-subscribe` | error | Flags `.subscribe()` calls nested inside another `.subscribe()` |
| `rxjs-avoid-behaviorsubject-for-local-state` | warn | Recommends `signal()` over `BehaviorSubject` for local state |
| `rxjs-avoid-subject-as-event-bus` | warn | Discourages `Subject` for component UI state |
| `rxjs-prefer-toSignal-for-template-state` | warn | Suggests `toSignal()` for template-only observables |
| `toSignal-require-initialValue` | warn | Requires `initialValue` parameter on `toSignal()` |

#### Signals Correctness & Best Practices (5 rules)

| Rule | Severity | What It Checks |
|---|---|---|
| `signal-no-side-effects-in-computed` | error | Enforces purity inside `computed()` |
| `signal-effect-must-be-destroy-scoped` | error | Ensures `effect()` has proper cleanup |
| `signal-no-effect-in-constructor` | warn | Recommends moving `effect()` to field initializers |
| `signal-prefer-computed-over-sync-effect` | warn | Suggests `computed()` instead of manual signal updates in `effect()` |
| `signal-avoid-untracked-overuse` | warn | Warns against excessive `untracked()` usage |

#### Signals API Modernization (3 rules)

| Rule | Severity | What It Checks |
|---|---|---|
| `signal-prefer-input-signal` | warn | Flags `@Input()` decorator; recommends `input()` / `input.required()` (Angular 17.1+) |
| `signal-prefer-output-function` | warn | Flags `@Output() EventEmitter`; recommends `output()` (Angular 17.3+) |
| `signal-prefer-model` | warn | Flags `@Input() x` + `@Output() xChange` pairs; recommends `model()` (Angular 17.2+) |

#### Template Quality & Performance (6 rules)

| Rule | Severity | What It Checks |
|---|---|---|
| `template-prefer-control-flow` | error | Flags `*ngIf`, `*ngFor`, `*ngSwitch`; recommends `@if`, `@for`, `@switch` |
| `template-no-call-expression` | error | Prevents function calls with arguments in templates |
| `template-no-unsafe-bindings` | error | Flags `[innerHTML]`, `[outerHTML]`, `[srcdoc]` without sanitization |
| `template-no-object-literal-binding` | warn | Prevents inline object literals in template bindings |
| `template-no-array-literal-binding` | warn | Prevents inline array literals in template bindings |
| `template-no-async-pipe-duplication` | warn | Flags multiple `async` pipe subscriptions to the same observable |

#### Security (1 rule)

| Rule | Severity | What It Checks |
|---|---|---|
| `no-bypass-sanitization` | error | Flags all `bypassSecurityTrust*` DomSanitizer methods |

#### SSR / Platform Safety (2 rules)

| Rule | Severity | What It Checks |
|---|---|---|
| `no-document-access` | error | Flags method calls on `document`, `window`, `localStorage`, etc. |
| `prefer-after-render-over-after-view-init` | warn | Flags DOM access inside `ngAfterViewInit`; recommends `afterNextRender()` |

#### Test Quality (1 rule)

| Rule | Severity | What It Checks |
|---|---|---|
| `spec-no-focused-test` | error | Flags `fdescribe`, `fit`, `describe.only`, `it.only` |

---

### Missing Rules That Users Will Notice

These are gaps that will be visible on first use by an experienced Angular developer:

| Missing Rule | Category | Why It Hurts |
|---|---|---|
| `prefer-standalone-component` | Architecture | Angular 17 made standalone the default. Zero rules for standalone adoption is a visible gap. |
| `no-ngmodule-for-new-components` | Architecture | Teams migrating off NgModules need active guidance. |
| `no-constructor-lifecycle-logic` | Best practice | Extremely common mistake; trivial to detect. |
| `inject-context-guard` | Safety | `inject()` outside an injection context is a runtime crash. Worth catching statically. |
| NgRx / NGXS patterns | State management | Any team using a store library sees zero value from the tool on their state layer. |
| Accessibility rules | A11y | Required for enterprise teams with accessibility audits. |
| Import boundary enforcement | Architecture | Architecture teams need layer-aware import rules. |
| `no-any-in-template` | Type safety | `$any()` casts in templates bypass type checking silently. |
| `no-eval` | Security | Two security rules is thin for enterprise adoption. |

---

## 3. Preset System

**Current: 5 presets. Verdict: Structurally solid, semantically incomplete.**

### Available Presets

| Preset | Rules Enabled | Purpose |
|---|---|---|
| `recommended` | ~18 | Balanced baseline for modern Angular apps |
| `strict` | ~14, all errors | Zero-tolerance mode for CI enforcement |
| `performance` | ~5 | Rendering and change-detection focused |
| `reactivity` | ~10 | Signals + RxJS migration sprint |
| `all` | ~28 | Full coverage with default severities |

The resolution pipeline underneath these presets — inheritance chain resolution, circular dependency detection, priority merging, unknown rule skipping — is production quality.

### Missing Presets

A developer who runs `extends: ["ngcompass:security"]` and gets zero rules enabled will leave immediately.

| Missing Preset | Rules It Should Group |
|---|---|
| `security` | `no-bypass-sanitization`, `template-no-unsafe-bindings` + future rules |
| `ssr` | `no-document-access`, `prefer-after-render-over-after-view-init` |
| `migration` | All RxJS→Signals rules grouped for teams on an active migration sprint |
| `testing` | `spec-no-focused-test` + future test rules |
| `accessibility` | Requires new a11y rules first |

---

## 4. Configuration Experience

**Verdict: Technically strong, user-facing experience is rough.**

### What Works Well

The underlying configuration system is well-engineered:
- Zod-based schema validation with detailed error messages
- Profile system for environment-specific configs (`ci`, `local`, `dev`)
- `extends` chain with circular dependency detection
- Config health checks with fix suggestions
- Cache-aware validation with content-hash keys
- Auto-discovery of `ngcompass.json`, `ngcompass.config.js`, `.ngcompassrc`

### What's Missing

| Gap | Impact |
|---|---|
| No example `ngcompass.json` in the repo root | A developer who installs the package has no starting point |
| No `ngcompass init` command that scaffolds a config | ESLint has had this since v7; absence signals immaturity |
| No published JSON Schema at a known URL | Without it, VS Code cannot autocomplete the config file. This is table stakes in 2026. |
| Extensibility format is undocumented | `extends` accepts npm packages but the required shape of a user-published preset is never documented |
| No Angular version gate on migration rules | `signal-prefer-input-signal` fires on Angular 14 codebases where `input()` doesn't exist yet |

### Example Minimum Config (Should Exist in Repo)

```json
{
  "$schema": "https://ngcompass.dev/schema/v1/ngcompass.schema.json",
  "extends": ["ngcompass:recommended"],
  "include": ["src/**/*.ts", "src/**/*.html"],
  "exclude": ["**/*.spec.ts", "node_modules/**"],
  "rules": {
    "signal-prefer-input-signal": "warn",
    "template-prefer-control-flow": "error"
  }
}
```

---

## 5. Performance & Scalability

**Verdict: Genuinely strong. This is a real differentiator.**

The execution architecture is more sophisticated than any Angular-specific static analysis tool currently in the market.

| Feature | Status | Notes |
|---|---|---|
| Worker thread pool | ✅ Implemented | Threshold-based routing (>150 tasks uses workers) |
| Multi-layer cache (memory L1 → disk L2) | ✅ Implemented | 8 distinct cache layers with LRU eviction |
| Content-addressed task deduplication | ✅ Implemented | SHA-256 of content; cross-project cache sharing |
| Incremental scan | ✅ Implemented | Only re-analyzes changed files |
| Git-aware file discovery | ✅ Implemented | `git ls-files` for fast discovery in large repos |
| Memoized AST parsing | ✅ Implemented | Zero re-parses per file per analysis run |
| Cross-file analysis (ProjectContext) | ✅ Implemented | Import graphs, component clusters, barrel detection |

On large codebases (500+ component files) this architecture will measurably outperform ESLint's Angular plugin. That's a real marketing claim.

### Critical Gap: No Published Benchmarks

There are no benchmark results, no `BENCHMARKS.md`, and no CI job that tracks performance regression. Without numbers, the performance claim is invisible to evaluators. A single published benchmark comparing ngcompass vs. `angular-eslint` on a 300-file project would be worth more than any amount of documentation prose.

---

## 6. Output & Developer Experience

**Verdict: Baseline covered, nothing differentiated yet.**

### Available Reporters

| Format | Status | Notes |
|---|---|---|
| Console (rich terminal) | ✅ Implemented | Color-coded violations, fix recommendations, code frames |
| HTML (interactive dashboard) | ✅ Implemented | File-by-file breakdown, statistics |
| JSON (machine-readable) | ✅ Implemented | Full violation data, CI/CD integration ready |
| SARIF | ⚠️ Defined in schema | Implementation status unclear; GitHub Code Scanning requires this |
| Compact / ESLint-style | ✅ Implemented | `--compact` flag |

### What's Missing to Make DX Great

| Feature | Priority | Notes |
|---|---|---|
| `--fix` / auto-fix | Critical | `autoFix` is in the config schema but unimplemented in rules. Auto-fixing `*ngIf → @if` would be the tool's viral demo moment. |
| VS Code extension | High | Inline squiggles while typing is how developers discover a linter. No extension means high adoption friction. |
| SARIF output | High | Enterprise teams and GitHub Code Scanning require it. |
| `ngcompass init` scaffolding | High | First-run experience is currently broken. |
| JSON Schema for config file | Medium | IDE autocomplete for `ngcompass.json`. |
| Watch mode | Medium | Defined in config schema, implementation status unclear. |
| Rule severity explanations in output | Medium | The HTML reporter should explain _why_ a rule exists, not just what it found. |

### The Auto-Fix Opportunity

Auto-fixing `template-prefer-control-flow` is the single highest-ROI feature in the entire roadmap. A developer who runs `ngcompass --fix` and watches 50 `*ngIf` directives get rewritten to `@if` blocks will tweet about it. Nothing else on the list has equivalent viral potential.

---

## 7. Rule Quality & False Positive Risk

**Verdict: Core rules are careful; new rules need hardening.**

### Rules with Strong False Positive Handling

These rules have been through meaningful iteration and show real attention to edge cases:

- **`rxjs-no-subscribe-in-component`** — HTTP observable exemptions, `take(1)` / `first()` awareness, teardown operator detection, `ngOnDestroy + .unsubscribe()` pattern recognition.
- **`rxjs-require-takeUntilDestroyed`** — Same exemptions as above; also caches the per-file teardown check.
- **`signal-prefer-computed-over-sync-effect`** — `linkedSignal` awareness, async boundary detection, type-checker integration.

### Rules with Known Gaps or Risks

| Rule | Issue | Risk Level |
|---|---|---|
| `no-document-access` | Only catches method calls on browser globals. Direct property assignment (`document.title = x`, `window.location.href = url`) is not detected. More incomplete than it appears. | Medium |
| `signal-prefer-input-signal` | On a large existing codebase with 200 components this can generate 800+ warnings in one run. Signal-to-noise problem will cause teams to disable the rule. Needs an Angular version gate or a way to suppress en-masse. | High |
| `prefer-after-render-over-after-view-init` | DOM access detection is a keyword match (`nativeElement`, `focus`, `offsetWidth`, etc.). Will false-positive on service method calls that happen to share those names. | Medium |
| `rxjs-no-nested-subscribe` | Does not catch the case where the inner `.subscribe()` is inside a `.pipe()` call on the outer stream, which is a common pattern. | Medium |
| `template-prefer-control-flow` | Fires on every `*ngIf` in a codebase regardless of Angular version. Pre-17 teams will get irrelevant noise. | Medium |

### Suggested Mitigations

1. Add an `angularVersion` option to the config that gates version-specific rules.
2. Add a `maxWarnings` threshold to suppress bulk-noise rules in existing codebases.
3. Harden `no-document-access` to also walk `ExpressionStatement → AssignmentExpression` patterns.

---

## 8. Testing Coverage

**Verdict: Infrastructure exists; rule unit tests largely don't.**

### What Exists

- Vitest configured across all packages.
- `packages/testing/` utilities package for test helpers.
- Meaningful test suites for `planner`, `scanner`, `config`, `cache`, and `engine` packages.
- `docs/guides/rule-development-guide.md` describes testing patterns.

### The Gap

There are essentially no unit tests for the actual rule implementations. There is no file like `rxjs-no-nested-subscribe.test.ts` that provides:
- Example input code that should trigger the rule
- Example input code that should not trigger the rule
- Edge case inputs (nested pipes, teardown present, HTTP observable, etc.)

This is a liability with compounding consequences:
- False positives ship silently
- Regressions appear with each refactor of shared utilities
- Rule authors (including external contributors) have no contract to code against
- CI cannot prove rule correctness

### Required Test Pattern per Rule

Every rule needs a file following this structure:

```typescript
// rxjs-no-nested-subscribe.rule.test.ts
describe('rxjs-no-nested-subscribe', () => {
    it('flags a subscribe callback that contains another subscribe', () => { ... });
    it('does not flag a subscribe with switchMap inside', () => { ... });
    it('does not flag a subscribe inside a separate method definition', () => { ... });
    it('flags three levels of nesting', () => { ... });
});
```

Before adding rule 30, tests should exist for rules 1–29.

---

## 9. Extensibility & Ecosystem

**Verdict: Architected but inaccessible.**

### What Exists

- `RulePlugin` interface in `packages/rules/src/registry/rule-registry.ts`
- `registerNewEngineRule()` function — a third party could theoretically register a custom rule
- `extends` chain in config supports npm package specifiers

### What's Missing

| Gap | Impact |
|---|---|
| No `@ngcompass/plugin-kit` package | External rule authors have no helpers or types to import |
| No guide on writing a plugin | Extensibility is undocumented |
| No documented npm package shape for presets | `extends: ["my-org-preset"]` is supported but the required package structure is unknown |
| No community rules exist | Obvious at this stage, but the ecosystem needs to be planned for |

ESLint succeeded in part because plugin authoring was documented on day one and the community produced hundreds of rule sets. If ngcompass stays closed to external rules, its ceiling is whatever can be built in-house.

### Suggested Minimum Plugin Contract

```typescript
// What a third-party package should export
export const plugin: NgcompassPlugin = {
    name: 'my-org/angular-rules',
    rules: [myCustomRule, anotherRule],
    presets: {
        recommended: { rules: { 'my-org/my-custom-rule': 'warn' } }
    }
};
```

---

## 10. Market Positioning

**Verdict: The niche is real. The window is narrow.**

### Competitive Advantages

1. **Signals-first rule set** — No other linter covers the `input()` / `output()` / `model()` / `computed()` space adequately. This is the strongest genuine differentiator.
2. **RxJS→Signals migration story** — End-to-end guidance from `BehaviorSubject` to `signal()`, covering every step. No other tool attempts this.
3. **Parallel worker engine with caching** — Measurably faster on large codebases than ESLint's sequential execution.
4. **Cross-file analysis (ProjectContext)** — Import graphs, component clusters, and barrel detection enable architectural rules that per-file linters cannot do.

### Comparison to Alternatives

| Dimension | `angular-eslint` | Nx linter | `ng` compiler | ngcompass |
|---|---|---|---|---|
| Signals rules | Minimal | None | None | 15+ |
| RxJS migration | 1–2 rules | None | None | 7 rules |
| Performance rules | Basic | None | Partial (build) | Specialized |
| Cross-file analysis | None | Graph-based | Type system | Import + component graphs |
| Caching | Via ESLint | Nx task cache | Build cache | Multi-layer, custom |
| Parallelization | ESLint built-in | Nx task runner | Sequential | Custom worker pool |
| Presets | Limited | Task configs | N/A | 5 built-in |
| Auto-fix | Partial | None | `ng migrate` | Not yet |

### Risks

| Risk | Probability | Mitigation |
|---|---|---|
| Angular team ships `ng lint --signal-migration` with auto-fix | Medium | Partially already happened with `ng generate @angular/core:signal-migration`. Focus on rules the team will never ship (opinionated patterns, RxJS, architecture). |
| `angular-eslint` adds signal rules | Medium–High | Distribution advantage: already installed via `ng lint`. ngcompass needs to get to market and build brand recognition before this happens. |
| Migration moment passes | Medium | Teams who don't get guidance now will either migrate manually or stay on legacy patterns. The window for being the tool that helps them migrate is 12–18 months. |

### Target Market (Priority Order)

1. **Angular 17–19 enterprise teams** — Actively migrating to signals, standalone, and SSR. Highest willingness to pay and strongest use case.
2. **Teams starting new Angular 17+ projects** — Want the `recommended` preset enforced from day one.
3. **Performance-conscious teams** — Change detection and template performance rules.
4. **Teams adopting Angular Universal / @angular/ssr** — The SSR safety rules (`no-document-access`, `prefer-after-render`) address a real pain point.

---

## 11. Summary Scorecard

| Dimension | Score | Verdict |
|---|---|---|
| Rule depth & coverage | 6/10 | Strong in signals/RxJS; gaps in architecture, a11y, state management |
| Rule quality / false positive risk | 6/10 | Core rules careful; new rules need hardening and tests |
| Configuration UX | 5/10 | Technically strong; user-facing experience incomplete |
| Performance | 9/10 | Genuinely excellent architecture; needs published benchmarks |
| Output & DX | 5/10 | Baseline covered; auto-fix and IDE integration absent |
| Testing coverage | 4/10 | Infrastructure exists; per-rule unit tests largely don't |
| Extensibility | 4/10 | Architected but undocumented and inaccessible |
| Documentation | 5/10 | Internal architecture docs good; user-facing docs thin |
| Market timing | 8/10 | Right moment, narrow window |
| **Overall** | **5.8/10** | Strong engine, incomplete product |

---

## 12. The Three Things That Matter Most Right Now

### 1. Auto-fix for `template-prefer-control-flow`

This is the killer demo. A developer runs `ngcompass --fix` on an existing Angular 16 project and watches 50 `*ngIf` directives get rewritten to `@if` blocks automatically. That is a tweet. That is a conference talk slide. That is what gets the tool into a team's standard setup.

Nothing else in the roadmap has the same viral potential per unit of implementation effort.

### 2. A working `ngcompass init` + example config + JSON Schema

Without these three things, the first five minutes of the user experience is confusion. A developer who has to read source code to figure out the config format will choose a tool with a documented getting-started path. Every developer who bounces in the first five minutes is a permanently lost adoption opportunity.

The three steps:
- `ngcompass init` command that writes a sensible `ngcompass.json` and asks two questions (Angular version, strict mode yes/no)
- A `ngcompass.json` example in the repo root
- A published JSON Schema URL so VS Code can autocomplete config fields

### 3. Per-rule tests for every rule before adding more rules

Before rule 30 is written, tests for rules 1–29 need to exist. The false positive rate of the 10 rules added in this session is currently unknown. One high-profile false positive on a widely-used pattern becomes a GitHub issue that stays open for months and signals immaturity to every evaluator who finds it.

The investment is roughly 2–4 hours of test writing per rule for the most important cases. The return is a linter that teams can trust, which is the only kind of linter that survives.

---

## Appendix: Fully Implemented Subsystems

For reference, these areas are architecturally complete and production-ready:

| Subsystem | Package | Status |
|---|---|---|
| Rule engine with parallel workers | `@ngcompass/engine` | Production-ready |
| Multi-layer caching (8 layers) | `@ngcompass/cache` | Production-ready |
| Config loading, validation, profiles | `@ngcompass/config` | Production-ready |
| File discovery with Git integration | `@ngcompass/scanner` | Production-ready |
| Execution planner with task indexing | `@ngcompass/planner` | Production-ready |
| Preset resolution pipeline | `@ngcompass/rules` | Production-ready |
| TypeScript + Angular template AST | `@ngcompass/ast` | Production-ready |
| Console / HTML / JSON reporters | `@ngcompass/reporters` | Production-ready |
| CLI `analyze` command | `@ngcompass/cli` | Production-ready |
| Cross-file ProjectContext | `@ngcompass/engine` | Production-ready |
