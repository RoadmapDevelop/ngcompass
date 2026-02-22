# Contextual Angular Linter — Top 50 Rules for Signals, Performance, and Architecture

This document defines the **top 50 high-value lint rules** for a contextual Angular linter focused on:

* Signals correctness
* Change detection performance
* Template efficiency
* RxJS interop safety
* Memory leak prevention
* Architectural consistency

Each rule includes intent and rationale.

---

# Category A — Signals Correctness (Core Reactivity)

## 1. signal-no-side-effects-in-computed

**Intent:** Ensure computed signals are pure.
**Detect:** Side effects inside `computed()` (HTTP calls, signal writes, subscriptions, DOM writes).
**Why:** Prevents reactive instability and recomputation storms.

---

## 2. signal-no-writes-in-computed

**Detect:** `.set()`, `.update()`, `.mutate()` inside `computed`.
**Why:** Creates cycles and undefined behavior.

---

## 3. signal-effect-allow-writes-explicit

**Detect:** Writing to signals inside `effect()` without explicit opt-in.
**Why:** Prevents accidental feedback loops.

---

## 4. signal-no-effect-in-constructor

**Detect:** `effect()` inside constructor.
**Why:** Lifecycle safety and predictability.

---

## 5. signal-effect-must-be-destroy-scoped

**Detect:** Effects without lifecycle scope.
**Why:** Prevents memory leaks.

---

## 6. signal-prefer-computed-for-derived-state

**Detect:** effect syncing derived signal.
**Why:** Derived state belongs in computed.

---

## 7. signal-no-manual-sync-effects

**Detect:** effect used to synchronize signals unnecessarily.
**Why:** Indicates architectural smell.

---

## 8. signal-no-untracked-overuse

**Detect:** Frequent or unnecessary `untracked`.
**Why:** Breaks reactive graph.

---

## 9. signal-no-nested-computed

**Detect:** computed created inside computed/effect.
**Why:** Memory and lifecycle hazards.

---

## 10. signal-prefer-readonly-exposure

**Detect:** writable signals exposed publicly.
**Why:** Prevents external mutation.

---

# Category B — Signals Performance

## 11. signal-no-large-object-mutation

**Detect:** mutate on deeply nested structures.
**Why:** Causes excessive recomputation.

---

## 12. signal-prefer-immutable-update

**Detect:** mutate instead of update with copy.
**Why:** Improves predictability.

---

## 13. signal-no-frequent-writes-in-loop

**Detect:** signal writes in loops without batching.
**Why:** Performance degradation.

---

## 14. signal-no-write-after-read-in-effect

**Detect:** effect reads and writes same signal.
**Why:** Creates cycles.

---

## 15. signal-no-redundant-computed

**Detect:** computed returning constant.
**Why:** Wasteful.

---

## 16. signal-prefer-computed-over-function

**Detect:** derived logic in methods instead of computed.
**Why:** Eliminates repeated execution.

---

## 17. signal-no-heavy-sync-work-in-computed

**Detect:** expensive CPU work inside computed.
**Why:** Blocks UI thread.

---

## 18. signal-no-signal-creation-in-template

**Detect:** signal() used inside template or getter.
**Why:** Creates new signals each render.

---

## 19. signal-prefer-batching-updates

**Detect:** multiple sequential writes.
**Why:** Reduces recomputation.

---

## 20. signal-no-circular-dependencies

**Detect:** signals depending on each other.
**Why:** Infinite loops.

---

# Category C — Template Performance

## 21. template-no-function-call-in-binding

**Detect:** `{{ fn() }}`
**Why:** Executes every change detection.

---

## 22. template-trackby-required

**Detect:** ngFor without trackBy.
**Why:** Prevents DOM churn.

---

## 23. template-no-heavy-expression

**Detect:** complex math or logic in template.
**Why:** Performance.

---

## 24. template-no-async-pipe-duplication

**Detect:** multiple async pipes on same observable.
**Why:** Duplicate subscriptions.

---

## 25. template-prefer-signal-over-async-pipe

**Detect:** observable used directly in template.
**Why:** Signals more efficient.

---

## 26. template-no-object-literal-binding

**Detect:** `[input]="{a:1}"`
**Why:** New object every render.

---

## 27. template-no-array-literal-binding

**Detect:** `[input]="[1,2]"`
**Why:** New reference every render.

---

## 28. template-no-inline-lambda

**Detect:** `(click)="() => doThing()"`
**Why:** Allocations each render.

---

## 29. template-no-dom-thrash-conditions

**Detect:** rapidly changing ngIf conditions.
**Why:** DOM destruction cost.

---

## 30. template-prefer-pure-pipes

**Detect:** impure pipes.
**Why:** Frequent execution.

---

# Category D — Change Detection

## 31. component-prefer-onpush

**Detect:** missing OnPush.
**Why:** Reduces CD overhead.

---

## 32. component-no-manual-detectChanges

**Detect:** detectChanges misuse.
**Why:** Architectural smell.

---

## 33. component-no-markForCheck-spam

**Detect:** frequent calls.
**Why:** CD thrashing.

---

## 34. component-no-state-mutation-without-signal

**Detect:** mutable fields used as state.
**Why:** Breaks reactivity.

---

## 35. component-prefer-signal-state

**Detect:** primitive state fields.
**Why:** Signals provide efficient reactivity.

---

# Category E — RxJS Interop

## 36. rxjs-no-subscribe-in-component

**Detect:** subscribe in component.
**Why:** Leak risk.

---

## 37. rxjs-require-takeUntilDestroyed

**Detect:** missing teardown.
**Why:** Leak prevention.

---

## 38. rxjs-prefer-toSignal

**Detect:** observable used as state.
**Why:** Better integration.

---

## 39. rxjs-no-manual-unsubscribe-array

**Detect:** subscriptions array pattern.
**Why:** Use modern APIs.

---

## 40. rxjs-no-shareReplay-without-refCount

**Detect:** shareReplay misuse.
**Why:** Memory retention.

---

# Category F — Architecture & Anti-Patterns

## 41. component-class-suffix

**Detect:** class name not ending Component.
**Why:** Style consistency.

---

## 42. directive-class-suffix

**Detect:** missing Directive suffix.

---

## 43. pipe-class-suffix

**Detect:** missing Pipe suffix.

---

## 44. no-component-business-logic

**Detect:** heavy logic in component.
**Why:** Move to service.

---

## 45. prefer-inject-over-constructor-di

**Detect:** constructor DI.
**Why:** Modern Angular best practice.

---

## 46. no-global-state-mutation

**Detect:** global mutation.
**Why:** Predictability.

---

## 47. no-dom-access-direct

**Detect:** document.querySelector.
**Why:** Breaks Angular abstraction.

---

## 48. no-timeout-for-state-sync

**Detect:** setTimeout syncing state.
**Why:** Anti-pattern.

---

## 49. no-zone-dependent-logic

**Detect:** zone assumptions.
**Why:** Future compatibility.

---

## 50. prefer-signal-inputs

**Detect:** legacy @Input instead of signal input.
**Why:** Modern reactive architecture.

---

# Recommended Severity Levels

| Severity | Description                      |
| -------- | -------------------------------- |
| critical | breaks correctness, causes leaks |
| high     | serious performance issue        |
| moderate | architectural improvement        |
| low      | stylistic improvement            |

---

# Recommended Implementation Priority

Start with:

1. signal-no-side-effects-in-computed
2. template-no-function-call-in-binding
3. template-trackby-required
4. rxjs-require-takeUntilDestroyed
5. component-prefer-onpush
6. signal-no-writes-in-computed

These deliver maximum performance and correctness gains.

---

# End of Ruleset
