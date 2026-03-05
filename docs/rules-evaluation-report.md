# ngcompass Rules Package — Evaluation Report

**Date:** 2026-03-04
**Branch:** `feat_quality`
**Package:** `packages/rules`
**Rule count:** 20 registered rules
**Preset count:** 11 presets (10 defined, 9 effectively empty or thin)

---

## 1. Overall Score: **6.5 / 10**

| Dimension | Score | Notes |
|---|---|---|
| Rule quality & logic | 8/10 | Smart heuristics, coordination, TypeChecker integration |
| Rule breadth & coverage | 4/10 | 20 rules, 5 categories — many domains completely absent |
| Preset completeness | 2/10 | 8 of 11 presets are empty or have ≤ 1 rule |
| Auto-fix capability | 0/10 | No codemods — report only |
| Developer UX (messages, examples) | 9/10 | Best-in-class: every rule has fix text + before/after code |
| Severity taxonomy | 5/10 | Inconsistent top-level naming (error vs critical) |
| Angular version coverage | 7/10 | Strong for v16–19 Signals era; weak on v14 patterns |

---

## 2. Rules Inventory

### 2.1 Implemented Rules (20)

| Rule ID | Category | Severity | Quality |
|---|---|---|---|
| `prefer-on-push-component-change-detection` | Change Detection | critical | ✅ Solid |
| `component-no-manual-detect-changes` | Change Detection | high | ✅ Solid |
| `prefer-inject-over-constructor-di` | Dependency Injection | moderate | ✅ Excellent (type + name heuristics, TypeChecker) |
| `rxjs-no-subscribe-in-component` | RxJS → Signals | high | ✅ Good (fire-and-forget exempt) |
| `rxjs-require-takeUntilDestroyed` | RxJS → Signals | high | ✅ Coordinated with above |
| `rxjs-avoid-behaviorsubject-for-local-state` | RxJS → Signals | moderate | ✅ Good (alias-aware) |
| `rxjs-avoid-subject-as-event-bus` | RxJS → Signals | moderate | ✅ Good (teardown-name exempt) |
| `rxjs-prefer-toSignal-for-template-state` | RxJS → Signals | low | ⚠️ Heuristic-only ($ suffix) |
| `toSignal-require-initialValue` | RxJS → Signals | moderate | ✅ Solid |
| `signal-no-side-effects-in-computed` | Signals | error | ✅ Good (detects writes + side effects) |
| `signal-prefer-computed-over-sync-effect` | Signals | moderate | ✅ Good (linkedSignal-aware, async boundary aware) |
| `signal-effect-must-be-destroy-scoped` | Signals | high | ✅ Solid |
| `signal-no-effect-in-constructor` | Signals | low | ✅ Simple, correct |
| `signal-avoid-untracked-overuse` | Signals | low | ✅ Good (afterRender exempt via parent walk + positional fallback) |
| `template-no-call-expression` | Template Performance | high | ⚠️ Missing per-violation offset |
| `template-trackby-required-for-ngfor` | Template Performance | high | ✅ Covers both `*ngFor` and `@for` |
| `template-no-object-literal-binding` | Template Performance | moderate | ⚠️ Missing per-violation offset |
| `template-no-array-literal-binding` | Template Performance | moderate | ⚠️ Missing per-violation offset |
| `template-no-async-pipe-duplication` | Template Performance | moderate | ✅ Excellent (WeakMap-scoped state, stringified key) |

### 2.2 Preset State

| Preset | Rules Populated | Expected | Status |
|---|---|---|---|
| `ngcompass:recommended` | 20 | 20 | ✅ Complete |
| `ngcompass:all` | **3** | 20 | 🔴 **Critically broken** |
| `ngcompass:strict` | 1 | 15+ | 🔴 Nearly empty |
| `ngcompass:performance` | 1 | 8+ | 🔴 Nearly empty |
| `ngcompass:reactivity` | 0 | 11+ | 🔴 Empty shell |
| `ngcompass:security` | 0 | 5+ | 🔴 Empty shell |
| `ngcompass:accessibility` | 0 | 5+ | 🔴 Empty shell |
| `ngcompass:testing` | 0 | 4+ | 🔴 Empty shell |
| `ngcompass:architecture` | 0 | 3+ | 🔴 Empty shell |
| `ngcompass:best-practice` | 0 | 8+ | 🔴 Empty shell |
| `ngcompass:code-smell` | 0 | 3+ | 🔴 Empty shell |
| `ngcompass:ssr` | 0 | 3+ | 🔴 Empty shell |

---

## 3. What Is Good

### 3.1 Signal-Era Specialization
ngcompass is the **only linting tool** with comprehensive coverage of Angular 16–19 Signals APIs. No competitor (`@angular-eslint`, Codelyzer, SonarQube Angular) covers `computed()` purity, `effect()` injection context, `untracked()` overuse, or `toSignal()` configuration. This is a genuine competitive moat.

### 3.2 Rule Coordination
`rxjs-no-subscribe-in-component` and `rxjs-require-takeUntilDestroyed` are explicitly coordinated: if a subscription already has a teardown, only the latter fires. This eliminates the double-flagging noise common in other linters.

### 3.3 Heuristic Depth
`prefer-inject` has the most sophisticated heuristics: a blocklist of 30+ known DI type name suffixes, a name-based allowlist/blocklist, TypeChecker integration as primary path, and graceful degradation when the type checker is absent.

### 3.4 Developer UX
Every rule provides:
- A one-sentence, actionable `fix` string
- A `before/after` code example
- Named offenders in the failure message (e.g. "Offending params: http: HttpClient, router: Router")

This is best-in-class. `@angular-eslint` provides no code examples inline.

### 3.5 Performance Engineering
- `template-no-async-pipe-duplication`: uses `WeakMap<RuleContext, ...>` instead of module-level state — correct isolation per analysis run.
- `component-no-manual-detect-changes`: per-file CDR presence cache avoids re-running 3 regex scans on every call expression.
- All tree traversals use iterative stacks (no recursion risk on deep ASTs).
- `rxjs-avoid-subject-as-event-bus`: scans source text once for all Subject aliases instead of 3 separate regex sweeps.

---

## 4. What Is Missing / Needs Improvement

### 4.1 Critical Gaps

| Gap | Impact |
|---|---|
| `ngcompass:all` preset only has 3/20 rules | Any user selecting `all` gets dramatically less coverage |
| 8 of 11 presets are empty shells | Preset system is non-functional for most use cases |
| No auto-fix / codemod support | Users must manually apply every suggestion |
| No security rules | `DomSanitizer` bypass, `innerHTML` binding, `bypassSecurityTrust*` usage go unchecked |
| No accessibility rules | Missing `alt` attributes, ARIA roles, interactive element accessibility not covered |

### 4.2 Missing Rule Categories

**Security (0 rules):**
- `no-bypass-security-trust` — flags `bypassSecurityTrustHtml/Script/Style/Url/ResourceUrl`
- `no-inner-html-binding` — flags `[innerHTML]` / `[outerHTML]` bindings without sanitizer
- `no-unsafe-event-handler` — flags `(click)` on non-interactive elements

**Accessibility (0 rules):**
- `template-img-alt-required` — `<img>` without `[alt]` or `alt`
- `template-interactive-role-required` — `(click)` handler requires `role` + `tabindex`
- `template-valid-aria` — invalid ARIA attribute usage

**Naming Conventions (0 rules):**
- `component-selector-prefix` — enforces `app-` or custom prefix on selectors
- `class-naming-convention` — `*Component`, `*Service`, `*Directive` suffix enforcement
- `pipe-naming-convention` — camelCase pipe name enforcement

**Lifecycle Hooks (0 rules):**
- `no-empty-lifecycle-method` — empty `ngOnDestroy()`, `ngOnInit()` etc.
- `implements-lifecycle-interface` — class uses lifecycle hook without `implements` declaration

**Angular 17+ APIs (0 rules):**
- `prefer-signal-inputs` — flags `@Input()` decorator in favour of `input()` function
- `prefer-signal-outputs` — flags `@Output()` decorator in favour of `output()` function
- `prefer-model` — flags `@Input()/@Output()` two-way binding patterns in favour of `model()`
- `prefer-new-control-flow` — flags `*ngIf`, `*ngFor`, `*ngSwitch` in favour of `@if`, `@for`, `@switch`

**SSR Safety (0 rules):**
- `no-window-access-in-server` — flags `window`, `document`, `navigator` direct access
- `no-localstorage-in-server` — flags `localStorage`/`sessionStorage` usage

**Architecture (0 rules):**
- `no-logic-in-constructor` — flags business logic in constructors beyond DI
- `no-direct-store-access` — pattern for NgRx/Signal Store discipline

**Testing (0 rules):**
- `no-fixture-detect-changes-in-beforeEach` — flags repeated `fixture.detectChanges()` pattern
- `prefer-by-css-over-native-element` — flags direct DOM queries in tests

### 4.3 Implementation Issues in Existing Rules

**Template rules report binding-level offset, not expression offset**
`template-no-call-expression`, `template-no-array-literal-binding`, and `template-no-object-literal-binding` all report the offset of the entire binding expression (`node.sourceSpan.start`), not the individual flagged sub-expression. If a binding has 3 call expressions, all 3 failures point to the same line/column.

**`findForBlocksWithoutTrack` is dead code**
`packages/rules/src/migration/template-trackby-required.rule.ts` exports `findForBlocksWithoutTrack()` for detecting `@for` blocks missing `track`. However, this function is not wired into the engine — it is never called during analysis. The `*ngFor` / `trackBy` rule fires, but the `@for` / `track` check does not.

**`rxjs-avoid-subject-as-event-bus` only covers `.component.ts`**
Subject-as-event-bus is equally problematic in directives (`directive.ts`) and services that expose streams to components. The rule filters out non-component files at line 64.

**`rxjs-avoid-behaviorsubject-for-local-state` skips directives**
Same scope gap — the `shouldAnalyzeFile()` check only permits `.component.ts` and `.service.ts`. Directive files are skipped.

**Severity taxonomy is inconsistent**
The severity field uses: `'error'`, `'critical'`, `'high'`, `'moderate'`, `'low'`. Two different "maximum" severity levels are used (`error` in `signal-no-side-effects-in-computed`, `critical` in `prefer-on-push`). This makes severity-based filtering and reporting ambiguous.

**`rxjs-prefer-toSignal-for-template-state` relies solely on `$` suffix**
The rule flags any class property ending with `$` that looks like an Observable. False positive rate is high for utility streams (e.g. `isLoading$`, `destroy$` — though the latter is in an explicit exclude list). There is no template-usage verification to confirm the observable is actually bound in the template.

---

## 5. Competition Comparison

| Feature | ngcompass | @angular-eslint | Codelyzer (deprecated) | SonarQube Angular |
|---|---|---|---|---|
| Total rules | 20 | ~35 | ~100 | ~15 |
| Signal rules | ✅ 9 | ❌ 0 | ❌ 0 | ❌ 0 |
| RxJS lifecycle rules | ✅ 6 | ⚠️ 1 | ⚠️ 2 | ❌ 0 |
| Template performance rules | ✅ 5 | ⚠️ 2 | ⚠️ 3 | ❌ 0 |
| Security rules | ❌ 0 | ⚠️ 1 | ⚠️ 2 | ✅ 4 |
| Accessibility rules | ❌ 0 | ✅ 8 | ✅ 6 | ❌ 0 |
| Naming convention rules | ❌ 0 | ✅ 7 | ✅ 12 | ❌ 0 |
| Lifecycle hook rules | ❌ 0 | ✅ 4 | ✅ 5 | ❌ 0 |
| Angular 17+ control flow | ❌ 0 | ⚠️ 1 | ❌ 0 | ❌ 0 |
| signal input/output/model | ❌ 0 | ❌ 0 | ❌ 0 | ❌ 0 |
| Auto-fix support | ❌ No | ✅ Yes | ✅ Yes | ❌ No |
| Before/after examples | ✅ All rules | ❌ No | ❌ No | ❌ No |
| TypeChecker integration | ✅ Partial | ✅ Yes | ✅ Yes | ✅ Yes |
| Preset system | ⚠️ Broken | ✅ Working | ✅ Working | N/A |

**Summary:** ngcompass has no peer in the Signals migration space. But it lags behind `@angular-eslint` in accessibility, naming conventions, and lifecycle hooks, and it lags behind SonarQube in security. The auto-fix gap is the most actionable competitive disadvantage.

---

## 6. Priority Tickets

---

### 🔴 CRITICAL — P0

---

#### TICKET-001: Fix `ngcompass:all` Preset — Only Contains 3 of 20 Rules
**File:** `packages/rules/src/presets/all.ts`
**Problem:** The `ngcompass:all` preset only declares 3 rules. It should include all 20 registered rules. Any user relying on this preset gets less than 15% rule coverage.
**Action:** Populate `allPreset.rules` with all 20 rule IDs at appropriate severity levels.
**Effort:** XS (30 min)

---

#### TICKET-002: Populate Thin Presets (`strict`, `performance`, `reactivity`, `architecture`, `best-practice`, `code-smell`, `ssr`)
**Files:** `packages/rules/src/presets/*.ts`
**Problem:** 8 of 11 presets are empty or contain 1 rule. The preset system is non-functional as a configuration shortcut.
**Action:**
- `strict`: escalate all `recommended` rules to `critical`/`error`; add opinionated rules
- `performance`: include all template + OnPush rules at `high`
- `reactivity`: include all signal + RxJS rules
- `architecture`: include DI, lifecycle, naming rules (when implemented)
- Others: populate as rules are added
**Effort:** S (2h)

---

#### TICKET-003: Wire `findForBlocksWithoutTrack` Into the Engine
**File:** `packages/rules/src/migration/template-trackby-required.rule.ts`
**Problem:** `findForBlocksWithoutTrack()` is implemented and exported but never called during analysis. `@for` blocks missing `track` are silently ignored.
**Action:** Create a registered rule (or extend the existing `template-trackby-required-for-ngfor` rule) that calls `findForBlocksWithoutTrack` against the raw template source.
**Effort:** S (2-3h)

---

### 🟠 HIGH — P1

---

#### TICKET-004: Normalize Severity Taxonomy
**Files:** All rule files + `@ngcompass/common` types
**Problem:** Two different "maximum" severity levels exist: `'critical'` (prefer-on-push) and `'error'` (signal-no-side-effects-in-computed). This breaks any severity-based filtering, sorting, or reporter logic.
**Action:** Settle on a single canonical scale. Recommended: `critical | high | moderate | low`. Update all rule files and the type definition in `@ngcompass/common`.
**Effort:** S (2h)

---

#### TICKET-005: Fix Template Rule Per-Violation Offsets
**Files:**
- `packages/rules/src/migration/template-no-call-expression.rule.ts`
- `packages/rules/src/migration/template-no-array-literal-binding.rule.ts`
- `packages/rules/src/migration/template-no-object-literal-binding.rule.ts`
**Problem:** When multiple violations exist in a single binding expression, all failures report the same line/column (the binding start offset). Individual sub-expression positions are not mapped.
**Action:** Extract the source span from each sub-expression AST node and compute its absolute offset for reporting.
**Effort:** M (4-6h)

---

#### TICKET-006: Add Security Rules — `no-bypass-security-trust` and `no-inner-html-binding`
**File:** `packages/rules/src/security/` (new directory)
**Problem:** The security preset is empty. XSS via `bypassSecurityTrustHtml/Script/Style/Url` and `[innerHTML]` bindings are the top Angular security issues and go fully undetected.
**Rules to implement:**
1. `security-no-bypass-security-trust` — flag any call to `DomSanitizer.bypassSecurityTrust*`
2. `security-no-inner-html-binding` — flag `[innerHTML]` / `[outerHTML]` in templates
3. `security-no-eval-in-component` — flag `eval()` usage
**Effort:** M (1-2 days)

---

#### TICKET-007: Auto-Fix Infrastructure (Codemod API)
**Packages:** `@ngcompass/engine`, `@ngcompass/rules`
**Problem:** Rules produce diagnostic output only. Competitors (`@angular-eslint`, ESLint) provide `--fix` codemod capability, which is the primary automation value driver.
**Action:** Define a `fix: CodeFix` object type (range + replacement text) on `RuleFailure`. Implement codemods for high-ROI rules first:
1. `prefer-on-push` → insert `changeDetection: ChangeDetectionStrategy.OnPush`
2. `prefer-inject` → rewrite constructor params to `inject()` field declarations
3. `template-trackby-required` → add `trackBy: trackById` attribute
**Effort:** XL (1-2 weeks)

---

### 🟡 MEDIUM — P2

---

#### TICKET-008: Add Naming Convention Rules
**File:** `packages/rules/src/naming/` (new directory)
**Problem:** No rules enforce Angular naming conventions. `@angular-eslint` has 7 naming rules; ngcompass has 0.
**Rules to implement:**
1. `naming-component-selector-prefix` — selector must start with configured prefix
2. `naming-component-class-suffix` — class name must end with `Component`
3. `naming-directive-class-suffix` — class name must end with `Directive`
4. `naming-service-class-suffix` — class name must end with `Service`
5. `naming-pipe-name-convention` — pipe name must be camelCase
**Effort:** M (2-3 days)

---

#### TICKET-009: Add Lifecycle Hook Rules
**File:** `packages/rules/src/lifecycle/` (new directory)
**Problem:** Empty lifecycle methods and missing interface declarations are common Angular code smells with no coverage.
**Rules to implement:**
1. `lifecycle-no-empty-method` — flag empty `ngOnInit`, `ngOnDestroy`, etc.
2. `lifecycle-implements-interface` — class using lifecycle method must declare `implements OnInit` etc.
3. `lifecycle-no-logic-in-constructor` — flag non-DI statements in constructor bodies
**Effort:** M (2-3 days)

---

#### TICKET-010: Add Angular 17+ Signal Input/Output/Model Rules
**File:** `packages/rules/src/migration/` (extend)
**Problem:** Angular 17+ introduces `input()`, `output()`, and `model()` as replacements for `@Input()` / `@Output()` decorators. No rules guide users toward these modern APIs.
**Rules to implement:**
1. `prefer-signal-inputs` — flag `@Input()` decorator, suggest `input()`
2. `prefer-signal-outputs` — flag `@Output(EventEmitter)` pattern, suggest `output()`
3. `prefer-model-for-two-way` — flag `@Input()`/`@Output()` pairs with matching names, suggest `model()`
**Effort:** M (2-3 days)

---

#### TICKET-011: Add New Control Flow Preference Rule (`@if`, `@for`, `@switch`)
**File:** `packages/rules/src/migration/template-prefer-new-control-flow.rule.ts` (new)
**Problem:** Angular 17 introduced built-in control flow (`@if`, `@for`, `@switch`). No rule guides migration away from structural directives (`*ngIf`, `*ngFor`, `*ngSwitch`).
**Action:** Create a template attribute rule flagging `*ngIf`, `*ngFor`, `*ngSwitch` with suggestions to migrate to the block syntax.
**Effort:** S (1 day)

---

#### TICKET-012: Add Accessibility Rules
**File:** `packages/rules/src/accessibility/` (new directory)
**Problem:** The accessibility preset is empty. This is a major gap vs `@angular-eslint` (8 accessibility rules).
**Rules to implement:**
1. `a11y-img-alt-required` — `<img>` must have `alt` attribute
2. `a11y-interactive-element-role` — `(click)` on `<div>`/`<span>` requires `role` + `tabindex="0"`
3. `a11y-no-autofocus` — flag `autofocus` attribute
4. `a11y-valid-aria-role` — flag invalid ARIA role values
**Effort:** L (1 week)

---

### 🟢 LOW — P3

---

#### TICKET-013: Extend RxJS/Subject Rules to Cover Directives
**Files:**
- `packages/rules/src/migration/rxjs-avoid-subject-as-event-bus.rule.ts`
- `packages/rules/src/migration/rxjs-avoid-behaviorsubject-for-local-state.rule.ts`
**Problem:** Both rules gate on `.component.ts` only. Directives have identical reactive concerns.
**Action:** Extend the file filter to include `.directive.ts` files.
**Effort:** XS (30 min each)

---

#### TICKET-014: Add SSR Safety Rules
**File:** `packages/rules/src/ssr/` (new directory)
**Problem:** The SSR preset is empty. Direct browser API access (`window`, `document`, `localStorage`) in SSR contexts is a runtime crash.
**Rules to implement:**
1. `ssr-no-window-access` — flag direct `window.*` / `document.*` usage without PLATFORM_ID guard
2. `ssr-no-localstorage-access` — flag `localStorage`/`sessionStorage` without guard
**Effort:** M (1-2 days)

---

#### TICKET-015: Improve `rxjs-prefer-toSignal-for-template-state` Accuracy
**File:** `packages/rules/src/migration/rxjs-prefer-toSignal-for-template-state.rule.ts`
**Problem:** The rule only relies on the `$` suffix convention. It has no evidence that the property is actually used in the template (vs. service-to-service streams). High false positive rate for internal streams.
**Action:** Cross-reference detected observable properties with template bindings. Only flag when the property name appears in a template expression.
**Effort:** M (1 day)

---

#### TICKET-016: Add Testing Rules
**File:** `packages/rules/src/testing/` (new directory)
**Problem:** The testing preset is empty.
**Rules to implement:**
1. `testing-no-fixture-detect-changes-in-beforeeach` — flag `fixture.detectChanges()` inside `beforeEach` (should be in `it` blocks)
2. `testing-prefer-harness-over-native-element` — suggest CDK Testing Harnesses
**Effort:** M (1-2 days)

---

## 7. Roadmap Summary

```
Q1 2026 — Foundation Fixes (P0)
  ├── TICKET-001  Fix ngcompass:all preset (XS)
  ├── TICKET-002  Populate thin presets (S)
  ├── TICKET-003  Wire @for track check (S)
  └── TICKET-004  Normalize severity taxonomy (S)

Q1 2026 — High Impact (P1)
  ├── TICKET-005  Fix template violation offsets (M)
  ├── TICKET-006  Add security rules (M)
  └── TICKET-007  Auto-fix / codemod infrastructure (XL)

Q2 2026 — Rule Breadth (P2)
  ├── TICKET-008  Naming convention rules (M)
  ├── TICKET-009  Lifecycle hook rules (M)
  ├── TICKET-010  Signal input/output/model rules (M)
  ├── TICKET-011  New control flow preference rule (S)
  └── TICKET-012  Accessibility rules (L)

Q3 2026 — Polish & Depth (P3)
  ├── TICKET-013  Extend RxJS rules to directives (XS)
  ├── TICKET-014  SSR safety rules (M)
  ├── TICKET-015  Improve toSignal template heuristic (M)
  └── TICKET-016  Testing rules (M)
```

---

## 8. Key Strengths to Preserve

1. **The Signals rule suite is world-class** — do not dilute the focus on `computed()`/`effect()` correctness.
2. **Rule coordination pattern** (subscribe ↔ takeUntilDestroyed) should be extended to new rule pairs.
3. **Developer UX** (fix text + before/after examples on every rule) is a competitive differentiator — maintain this standard for every new rule added.
4. **Iterative stack traversal** pattern should be the default for all new tree-walking rules — never recursive.
5. **WeakMap-scoped state** pattern from `template-no-async-pipe-duplication` should be the template for any rule that needs cross-node state within a file analysis run.
