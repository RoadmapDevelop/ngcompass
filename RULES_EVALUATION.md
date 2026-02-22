# ngcompass Rules — Evaluation Report

> Generated: 2026-02-21
> Total Rules Analysed: **25**
> Presets: `recommended`, `strict`, `all`

---

## 1. Overview

The ngcompass rule system is structured around a **single-pass, stream-based engine** with four node stream types:

| Stream Type | Rules Count | Handler Helper |
|---|---|---|
| `AngularClass` | 18 | `createComponentRule` |
| `DecoratedProperty` | 2 | `createDecoratedPropertyRule` |
| `TemplateExpression` | 2 | `createTemplateExpressionRule` |
| `TemplateAttribute` | 3 | `createTemplateAttributeRule` |

Rules are organized in **2 development phases** and **4 priority tiers**:

| Phase | Tier | Rules | Goal |
|---|---|---|---|
| 0 (MVP) | P0 — Migration Blockers | 5 | Stop the most critical anti-patterns |
| 0 (MVP) | P1 — High-ROI Quick Wins | 6 | Easy, high-value improvements |
| 1 (Differentiation) | P2 — Migration Support | 5 | Angular-modern API adoption |
| 1 (Differentiation) | P3 — Code Quality & Safety | 5 | Correctness and lifecycle safety |
| 1 (Differentiation) | P4 — Naming & Conventions | 4 | Consistency |

---

## 2. Full Rule Inventory

### Phase 0 — MVP

#### P0: Migration Blockers

| # | Rule ID | Stream | Severity | What It Checks |
|---|---|---|---|---|
| 1 | `prefer-on-push-component-change-detection` | AngularClass | `critical` | Component missing `ChangeDetectionStrategy.OnPush` |
| 2 | `prefer-standalone` | AngularClass | `critical` / `low` | Component missing `standalone: true` |
| 3 | `prefer-signal-inputs` | DecoratedProperty | `moderate` | `@Input()` not replaced with `input<T>()` signal |
| 4 | `template-no-call-expression` | TemplateExpression | `moderate` / `high` | Function calls in templates (`{{ fn() }}`) |
| 5 | `template-prefer-control-flow` | TemplateAttribute | `high` | Legacy `*ngIf`, `*ngFor`, `*ngSwitch` still in use |

#### P1: High-ROI Quick Wins

| # | Rule ID | Stream | Severity | What It Checks |
|---|---|---|---|---|
| 6 | `rxjs-no-nested-subscribe` | AngularClass | `high` | Nested `.subscribe()` inside subscribe callbacks |
| 7 | `template-use-track-by-function` | TemplateAttribute | `moderate` | Missing `track` / `trackBy` in `@for` / `*ngFor` |
| 8 | `no-input-rename` | AngularClass | `moderate` | `@Input('alias')` with explicit alias |
| 9 | `component-selector` | AngularClass | `moderate` | Selector not using configured prefix + kebab-case |
| 10 | `directive-selector` | AngularClass | `high` | Directive selector not using camelCase prefix |
| 11 | `rxjs-prefer-takeuntil` | AngularClass | `high` | Subscriptions without `takeUntil` / `takeUntilDestroyed` |

---

### Phase 1 — Differentiation

#### P2: Migration Support

| # | Rule ID | Stream | Severity | What It Checks |
|---|---|---|---|---|
| 12 | `prefer-signal-queries` | AngularClass | `high` / `moderate` | `@ViewChild`, `@ContentChild`, etc. not replaced with signal queries |
| 13 | `use-inject` | AngularClass | `moderate` | Constructor-based DI not replaced with `inject()` |
| 14 | `no-attribute-decorator` | DecoratedProperty | `low` | Usage of deprecated `@Attribute()` |
| 15 | `template-no-negated-async` | TemplateExpression | `moderate` | `!(obs$ \| async)` pattern (unclear null handling) |
| 16 | `rxjs-no-create` | AngularClass | `high` | `Observable.create()` removed in RxJS 7 |

#### P3: Code Quality & Safety

| # | Rule ID | Stream | Severity | What It Checks |
|---|---|---|---|---|
| 17 | `implements-on-destroy` | AngularClass | `high` / `moderate` | `ngOnDestroy()` without `implements OnDestroy` |
| 18 | `no-output-native` | AngularClass | `high` | `@Output()` name collides with native DOM event |
| 19 | `no-conflicting-lifecycle` | AngularClass | `high` / `moderate` | `ngDoCheck` + `ngOnChanges` or `ngDoCheck` + `ngOnInit` |
| 20 | `template-no-duplicate-attributes` | TemplateAttribute | `high` | Duplicate attribute names on same HTML element |
| 21 | `no-empty-lifecycle-method` | AngularClass | `moderate` | Empty lifecycle hook implementations |

#### P4: Naming & Conventions

| # | Rule ID | Stream | Severity | What It Checks |
|---|---|---|---|---|
| 22 | `component-class-suffix` | AngularClass | `moderate` | Class not ending with `Component` |
| 23 | `directive-class-suffix` | AngularClass | `moderate` | Class not ending with `Directive` |
| 24 | `no-output-on-prefix` | AngularClass | `low` | `@Output()` name starting with `on` |
| 25 | `no-output-rename` | AngularClass | `moderate` | `@Output('alias')` with explicit alias |

---

## 3. What Is Good ✅

### 3.1 Architecture
- **Single-pass engine** — rules are not re-traversing the AST independently; pre-filtered, typed streams are passed to handlers. This is a strong design for performance at scale.
- **Stream segregation** — separating `AngularClass`, `DecoratedProperty`, `TemplateExpression`, and `TemplateAttribute` keeps each rule handler focused and small.
- **Plugin boundary** — `RuleRegistry` with a `RulePlugin` interface allows external rules to be registered. This enables ecosystem extension without forking.
- **Helper factories** — `createComponentRule`, `createDecoratedPropertyRule`, etc. enforce a consistent rule shape and reduce boilerplate.
- **Zero-allocation philosophy** — handlers receive pre-analyzed nodes and only return failures, no internal traversal needed.

### 3.2 Rule Coverage Quality
- **Migration blockers** are correctly prioritised at `critical` / `high` severity (OnPush, standalone, control-flow, signal inputs).
- **Memory-leak prevention** is double-covered: `rxjs-prefer-takeuntil` (prevent leaks) + `rxjs-no-nested-subscribe` (prevent callback hell).
- **Both old and new Angular APIs** are considered — rules target legacy patterns (`*ngIf`, `@ViewChild`, `@Input`) as well as their modern replacements.
- **Output hygiene** is well-covered with three rules: `no-output-native`, `no-output-on-prefix`, `no-output-rename`.
- **Configurable rules** (`component-selector`, `directive-selector`) allow teams to adapt to their own naming conventions.

### 3.3 Preset Strategy
- Three presets (`recommended`, `strict`, `all`) follow the conventional ESLint pattern — familiar to developers and easy to adopt incrementally.
- `prefer-standalone` correctly uses `low` in `recommended` and `critical` in `all`, respecting that not all projects are on Angular 17+.

---

## 4. Coverage Analysis

### 4.1 Coverage by Angular Concept

| Angular Concept | Covered | Rules |
|---|---|---|
| Change detection | ✅ | `prefer-on-push` |
| Standalone API | ✅ | `prefer-standalone` |
| Signal inputs | ✅ | `prefer-signal-inputs` |
| Signal queries | ✅ | `prefer-signal-queries` |
| Signal outputs | ❌ | **Not covered** |
| `inject()` function | ✅ | `use-inject` |
| Template control flow | ✅ | `template-prefer-control-flow` |
| Template performance | ✅ | `template-no-call-expression`, `template-use-track-by-function` |
| Template correctness | ✅ | `template-no-duplicate-attributes`, `template-no-negated-async` |
| RxJS lifecycle | ✅ | `rxjs-prefer-takeuntil`, `rxjs-no-nested-subscribe` |
| RxJS API compat | ✅ | `rxjs-no-create` |
| Lifecycle hooks | ✅ | `implements-on-destroy`, `no-conflicting-lifecycle`, `no-empty-lifecycle-method` |
| Output conventions | ✅ | `no-output-native`, `no-output-on-prefix`, `no-output-rename` |
| Input conventions | ✅ | `no-input-rename` |
| Naming conventions | ✅ | `component-class-suffix`, `directive-class-suffix`, `component-selector`, `directive-selector` |
| Pipe naming | ❌ | **Not covered** |
| Service naming | ❌ | **Not covered** |
| Module patterns | ❌ | **Not covered** |
| HTTP / async patterns | ❌ | **Not covered** |
| Accessibility (a11y) | ❌ | **Not covered** |
| Security (XSS, innerHTML) | ❌ | **Not covered** |

### 4.2 Coverage by Stream Type

| Stream | Total Rules | % of 25 |
|---|---|---|
| AngularClass | 18 | **72%** |
| TemplateAttribute | 3 | 12% |
| TemplateExpression | 2 | 8% |
| DecoratedProperty | 2 | 8% |

> **Observation**: 72% of rules operate on the `AngularClass` stream. Template and property streams are under-explored, meaning there is room for many more high-value template-level rules.

### 4.3 Coverage by Severity Distribution

| Severity | Count | % |
|---|---|---|
| `critical` | 2 | 8% |
| `high` | 10 | 40% |
| `moderate` | 11 | 44% |
| `low` | 2 | 8% |

> **Observation**: Severity distribution is reasonable. `critical` is correctly kept small (only the most impactful migration issues).

---

## 5. Gaps & Weaknesses ⚠️

### 5.1 Missing Angular Signals Coverage
- **`prefer-signal-outputs`** — `@Output()` / `EventEmitter` should be replaceable with `output<T>()` (Angular 17.3+). This is a logical companion to `prefer-signal-inputs` and `prefer-signal-queries` but is absent.
- **`prefer-computed`** — No rule encouraging `computed()` over manually managed derived state.
- **`prefer-effect`** — No rule detecting manual `ngOnChanges` patterns that could be replaced with `effect()`.

### 5.2 Missing Naming Conventions
- **Pipe class suffix** — No rule enforcing `MyPipe` must end with `Pipe`.
- **Service class suffix** — No rule enforcing `MyService` must end with `Service`.
- **Guard class suffix** — No rule enforcing `MyGuard` must end with `Guard`.
- **Resolver class suffix** — No rule enforcing `MyResolver` must end with `Resolver`.

### 5.3 Missing Template Rules
- **`template-no-any-cast`** — No rule detecting `$any()` casts in templates (hides type errors).
- **`template-prefer-self-closing`** — No rule encouraging self-closing tags for components with no content.
- **`template-no-inline-styles`** — No rule catching inline `[style]` bindings that should be in CSS.

### 5.4 Missing Security Rules
- **`no-inner-html`** — No rule detecting `[innerHTML]` bindings (XSS vector). This is one of the most important security rules in Angular.
- **`no-bypassSecurityTrust`** — No rule flagging calls to `bypassSecurityTrustHtml`, `bypassSecurityTrustUrl`, etc.

### 5.5 Missing RxJS Rules
- **`rxjs-no-subject-value`** — Accessing `.value` on a `BehaviorSubject` directly is a code smell. No rule covers this.
- **`rxjs-no-async-subscribe`** — Using `async` functions inside `.subscribe()` callbacks breaks error propagation. No rule covers this.
- **`prefer-async-pipe`** — No rule detecting manual subscriptions in components that could be replaced with the `async` pipe.

### 5.6 Stream Imbalance
- The `DecoratedProperty` stream has only **2 rules** but covers a very broad surface area (all decorated class properties). There are many more checks possible here (e.g., `@HostListener` usage, `@HostBinding` patterns).
- The `TemplateExpression` stream has only **2 rules** out of a potentially large number of expression-level checks.

### 5.7 No `autofix` Support
- Rules provide a `fix` text recommendation but no programmatic `autofix` capability. An ESLint-style `--fix` flag would dramatically increase adoption, especially for mechanical changes like `*ngIf` → `@if`.

### 5.8 No Rule Documentation Files
- Each rule file contains implementation logic but there is no per-rule documentation (markdown or JSDoc) describing: rationale, examples of bad/good code, configuration options, links to Angular docs.

---

## 6. Improvement Suggestions

### Priority 1 — Critical Gaps (Add First)

| Suggestion | Why |
|---|---|
| Add `prefer-signal-outputs` rule | Completes the signals trilogy: inputs ✅, queries ✅, outputs ❌ |
| Add `no-inner-html` security rule | Most impactful security rule; XSS via `[innerHTML]` is common |
| Add `no-bypassSecurityTrust` rule | Explicit flag on all trust-bypass calls |

### Priority 2 — Complete Naming Conventions

| Suggestion | Why |
|---|---|
| Add `pipe-class-suffix` | Consistent with existing `component-class-suffix` and `directive-class-suffix` |
| Add `service-class-suffix` | Every major Angular style guide includes this |
| Add `guard-class-suffix` | Rounds out class naming convention coverage |

### Priority 3 — Improve Template Coverage

| Suggestion | Why |
|---|---|
| Add `template-no-any-cast` | `$any()` silences the type checker; high-severity smell |
| Add `template-no-inline-styles` | Encourages separation of concerns |
| Add `prefer-async-pipe` | Catches manual subscriptions that can be replaced declaratively |

### Priority 4 — Signal Modernisation Completeness

| Suggestion | Why |
|---|---|
| Add `prefer-computed` | Detects manual derived state that should use `computed()` |
| Add `no-ngonchanges-for-derived-state` | Flags `ngOnChanges` blocks that are just computing derived values |

### Priority 5 — RxJS Safety

| Suggestion | Why |
|---|---|
| Add `rxjs-no-async-subscribe` | `async` inside `subscribe` breaks error chains silently |
| Add `rxjs-no-subject-value` | `.value` on BehaviorSubject encourages imperative anti-patterns |

### Priority 6 — Developer Experience

| Suggestion | Why |
|---|---|
| Add programmatic `autofix` for mechanical rules | `template-prefer-control-flow`, `prefer-standalone`, `no-output-on-prefix` are pure text transformations — automating these saves hours of migration work |
| Add per-rule markdown documentation | Each rule should have `docs/rules/<rule-id>.md` with rationale, bad/good examples, and config reference |
| Add `--rule` CLI flag | Allow running a single rule in isolation for debugging |
| Add severity override in config | Allow users to override severity of built-in rules without custom plugins |

---

## 7. Summary Scorecard

| Category | Score | Notes |
|---|---|---|
| Architecture | **9 / 10** | Single-pass engine, plugin system, factory helpers are excellent |
| Rule Quality | **8 / 10** | Rules are correct and well-targeted; some missing coverage in security and signals |
| Coverage Breadth | **6 / 10** | 72% of rules on AngularClass stream; template, security, and RxJS gaps |
| Preset Strategy | **8 / 10** | Three-tier preset strategy is intuitive and follows ESLint convention |
| Developer Experience | **5 / 10** | No autofix, no per-rule docs, no single-rule filter; room for improvement |
| Migration Completeness | **7 / 10** | Good signal coverage but outputs missing; no `computed` / `effect` guidance |

**Overall: 43 / 60 (72%)** — A solid, well-engineered foundation with clear expansion opportunities.

---

## 8. Recommended Next Steps

1. **Add `prefer-signal-outputs`** — complete the signals rule set
2. **Add `no-inner-html`** — highest-value security rule
3. **Add `pipe-class-suffix` + `service-class-suffix`** — low effort, high consistency value
4. **Add `template-no-any-cast`** — high severity, common anti-pattern
5. **Implement autofix for 3–4 mechanical rules** — dramatically improves adoption
6. **Create `docs/rules/` folder** with one `.md` per rule

---

*End of evaluation report.*
